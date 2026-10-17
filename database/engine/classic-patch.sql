-- Source for 014 only. Old 012 behavior is retained behind version dispatch.
create or replace function ml_private.patch_poison_regions(v text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$
 select coalesce(jsonb_agg(q.region order by q.first_cell),'[]') from
 (select c->>'region' region,min(ord) first_cell from jsonb_array_elements(ml_private.runtime_data(v,'cells')) with ordinality t(c,ord)
 where c->>'region' not in ('山洞','教学楼','操场','办公室') group by c->>'region') q $$;
create or replace function ml_private.patch_bomb_regions(s jsonb) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$
 select coalesce(jsonb_agg(q.region order by q.first_cell),'[]') from
 (select c->>'region' region,min(ord) first_cell from jsonb_array_elements(ml_private.game_data(s,'cells')) with ordinality t(c,ord)
 where c->>'region'<>'山洞' and case when c->>'region' in ('教学楼','操场','办公室') then
 not exists(select 1 from ml_private.arr(ml_private.patch_poison_regions(s->>'version')) r where not (s#>'{classic,poison}' ? (r#>>'{}')))
 else ml_private.version_catalog(s->>'version')#>>array['mapDefinition','regions',c->>'region','exposure']='outdoor' end
 group by c->>'region') q $$;
create or replace function ml_private.classic_refresh(s jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare pool jsonb; safe jsonb; begin
 if s->>'version'<>'web-v0.1.5' then return ml_private.classic_refresh_before_patch(s);end if;
 select coalesce(jsonb_agg(r),'[]') into pool from ml_private.arr(ml_private.patch_poison_regions(s->>'version')) r where not (s#>'{classic,poison}' ? (r#>>'{}'));
 s:=ml_private.classic_pick(s,pool,2);s:=jsonb_set(s,'{classic,poison}',(s#>'{classic,poison}')||(s->'_picked'));s:=s-'_picked';
 s:=jsonb_set(s,'{classic,farmClosed}',to_jsonb((s->>'round')::int>=5));
 select coalesce(jsonb_agg(c->'id'),'[]') into safe from ml_private.arr(ml_private.game_data(s,'cells')) c where not (s#>'{classic,poison}' ? (c->>'region'));
 return s||jsonb_build_object('safe',safe,'bomb',null,'forecast',null);
end $$;
-- Stage-3 boundary only; no incomplete new character is admitted to the live pool.
create or replace function ml_private.character_effect_allowed(effect jsonb,target_seat integer,target_character text) returns boolean language sql immutable
set search_path=pg_catalog as $$
 select case
 when target_character='character-026' and
 ((effect->>'origin' like 'role-%' and effect->>'actor' is not null and (effect->>'actor')::int<>target_seat)
 or exists(select 1 from jsonb_array_elements(coalesce(effect->'roleModifiers','[]'::jsonb)) m where (m->>'actor')::int<>target_seat)) then false
 when target_character='character-044' and effect->>'origin'='role-active' and (effect->>'actor')::int<>target_seat then false
 else true end $$;
create or replace function ml_private.classic_environment(s jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare hits jsonb:='[]';p jsonb;a integer;region text;old jsonb;danger boolean;streak integer;amount integer;loss integer;begin
 if s->>'version'<>'web-v0.1.5' then return ml_private.classic_environment_before_patch(s);end if;
 s:=ml_private.classic_pick(s,ml_private.patch_bomb_regions(s),2,true);s:=jsonb_set(s,'{classic,bombs}',s->'_picked');s:=s-'_picked';s:=jsonb_set(s,'{classic,bombRound}',s->'round');
 for a in 0..3 loop p:=s->'players'->a;if (p->>'hp')::int<=0 then continue;end if;
  region:=ml_private.region_at(s->>'version',p->>'cell');old:=s#>array['classic','exposure',a::text];danger:=s#>'{classic,poison}' ? region or s#>'{classic,bombs}' ? region;
  streak:=case when not danger then 0 when old->>'region'=region then (old->>'streak')::int+1 else 1 end;
  amount:=case when danger then power(2,least(30,streak-1))::int else 0 end;loss:=least((p->>'hp')::int,greatest(0,amount-(p->>'shield')::int));
  s:=jsonb_set(s,array['classic','exposure',a::text],case when loss>0 then jsonb_build_object('region',region,'streak',streak) else jsonb_build_object('region',null,'streak',0) end);
  hits:=hits||jsonb_build_array(jsonb_build_object('target',a,'amount',amount,'source',null,'category','environment'));
 end loop;return s||jsonb_build_object('_hits',hits);
end $$;
create or replace function ml_private.classic_relocated(s jsonb,a integer,origin text,cell text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ begin
 if s->>'version' in ('web-v0.1.4','web-v0.1.5') and ml_private.region_at(s->>'version',origin)<>ml_private.region_at(s->>'version',cell) then s:=jsonb_set(s,array['classic','exposure',a::text],jsonb_build_object('region',null,'streak',0));end if;
 if s->>'version'='web-v0.1.5' and ml_private.region_at(s->>'version',origin)='山洞' and ml_private.region_at(s->>'version',cell)<>'山洞' then s:=jsonb_set(s,array['classic','caveEnds',a::text],'0');end if;
 return s;
end $$;
create or replace function ml_private.cave_ending(s jsonb,a integer) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a;countn integer;paid integer;begin
 s:=s||jsonb_build_object('_hits','[]'::jsonb);
 if s->>'version'<>'web-v0.1.5' or (p->>'hp')::int<=0 then return s;end if;
 countn:=case when ml_private.region_at(s->>'version',p->>'cell')='山洞' then (s#>>array['classic','caveEnds',a::text])::int+1 else 0 end;
 s:=jsonb_set(s,array['classic','caveEnds',a::text],to_jsonb(case when countn>=3 then 0 else countn end));
 if countn<3 then return s;end if;
 paid:=least(2,(p->>'ap')::int);s:=ml_private.put_player(s,a,p||jsonb_build_object('ap',(p->>'ap')::int-paid));
 s:=ml_private.emit(s,'cave','S'||(a+1)||' 山洞连续停留3个个人回合，野人扣'||paid||'AP并造成1伤害',jsonb_build_object('actor',a,'ap',paid,'amount',1));
 return s||jsonb_build_object('_hits',jsonb_build_array(jsonb_build_object('target',a,'amount',1,'source',null,'category','environment')));
end $$;
