create or replace function ml_private.stage3_card_allowed(s jsonb,target integer,card text,effect jsonb) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->target; tags jsonb; begin
 if p is null or not ml_private.character_effect_allowed(effect,target,p->>'character') then return false;end if;
 if p->>'character'='character-006' and (effect->>'actor')::int<>target and effect->>'faction'<>'机械猴子' then return false;end if;
 tags:=ml_private.version_catalog('web-v0.1.5')#>array['sourceCatalog','cards',split_part(card,'#',1),'tags'];
 if p->>'character'='character-005' and tags ? '建民' then return false;end if;return true;
end $$;
create or replace function ml_private.stage3_role_targets(s jsonb,a integer,origin text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(p->'seat' order by ord),'[]') from jsonb_array_elements(s->'players') with ordinality t(p,ord) where (p->>'hp')::int>0 and (p->>'seat')::int<>a and ml_private.character_effect_allowed(jsonb_build_object('origin',origin,'actor',a,'roleModifiers','[]'::jsonb),(p->>'seat')::int,p->>'character') $$;
create or replace function ml_private.stage3_jj_targets(s jsonb,a integer,card text,targets jsonb,effect jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare d jsonb:=ml_private.stage3_content()#>array['cards',split_part(card,'#',1)]; jj integer; begin
 if d is null or d->>'type'='equipment' or (d->>'type'='response' and not (d->>'id'='basic-002' and s#>>array['players',a::text,'character']='character-023')) or d->>'id'='basic-037' then return jsonb_build_object('targets',targets,'effect',effect);end if;
 select (p->>'seat')::int into jj from ml_private.arr(s->'players') p where (p->>'hp')::int>0 and p->>'character'='character-003' and (p->>'seat')::int<>a and s#>>array['stage3','jjExposed',p->>'seat']='true' limit 1;
 if jj is null or targets @> jsonb_build_array(jj) then return jsonb_build_object('targets',targets,'effect',effect);end if;
 effect:=jsonb_set(effect,'{roleModifiers}',(effect->'roleModifiers')||jsonb_build_array(jsonb_build_object('actor',jj,'kind','target')));return jsonb_build_object('targets',targets||jsonb_build_array(jj),'effect',effect);
end $$;
create or replace function ml_private.stage3_same_near(a text,b text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.runtime_data('web-v0.1.5','map')#>>array[a,'region']=ml_private.runtime_data('web-v0.1.5','map')#>>array[b,'region'] or ml_private.neighbor_for_version('web-v0.1.5',ml_private.runtime_data('web-v0.1.5','map')#>>array[a,'region'],ml_private.runtime_data('web-v0.1.5','map')#>>array[b,'region']) $$;
create or replace function ml_private.stage3_monkey_targets(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a; boost boolean:=p->>'character'='character-045'; result jsonb; begin
 if not boost and ml_private.runtime_data('web-v0.1.5','map')#>>array[p->>'cell','region'] in ('教学楼','秀松苑') then return '[]';end if;
 select coalesce(jsonb_agg(q->'seat' order by ord),'[]') into result from jsonb_array_elements(s->'players') with ordinality t(q,ord) where (q->>'hp')::int>0 and (q->>'seat')::int<>a and (s->>'mode'='ffa' or q->'team'<>p->'team') and not (q->>'character'='character-027' and jsonb_array_length(q->'hand')=1) and (boost or ml_private.stage3_same_near(p->>'cell',q->>'cell'));return result;
end $$;
create or replace function ml_private.stage3_ledger_candidates(s jsonb,xie integer,card_user integer,participants jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->xie; result jsonb:='[]'; a jsonb; q jsonb; begin
 if (p->>'hp')::int<=0 or p->>'character'<>'character-044' then return result;end if;
 for a in select * from ml_private.arr(jsonb_build_array(card_user)||participants) loop q:=s->'players'->(a#>>'{}')::int;
 if (a#>>'{}')::int<>xie and (q->>'hp')::int>0 and not (result @> jsonb_build_array(a)) and ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',xie,'roleModifiers','[]'::jsonb),(a#>>'{}')::int,q->>'character') and (ml_private.runtime_data('web-v0.1.5','map')#>>array[q->>'cell','region']=ml_private.runtime_data('web-v0.1.5','map')#>>array[p->>'cell','region'] or ml_private.distance_for_version('web-v0.1.5',p->>'cell',q->>'cell')=1) then result:=result||jsonb_build_array(a);end if;end loop;return result;
end $$;
create or replace function ml_private.stage3_east_targets(s jsonb,a integer,kind text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(t order by ord),'[]') from jsonb_array_elements(ml_private.stage3_role_targets(s,a,'role-active')) with ordinality x(t,ord) where kind='draw' or jsonb_array_length(s#>array['players',t#>>'{}','hand'])>0 $$;
create or replace function ml_private.stage3_assam_targets(s jsonb,a integer) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(p->'seat' order by ord),'[]') from jsonb_array_elements(s->'players') with ordinality t(p,ord) where (p->>'hp')::int>0 and ((p->>'seat')::int=a or (s->>'mode'='team' and p->'team'=s#>array['players',a::text,'team'] and ml_private.stage3_same_near(p->>'cell',s#>>array['players',a::text,'cell']))) $$;
create or replace function ml_private.stage3_direction_cell(cell text,direction text) returns text language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=ml_private.runtime_data('web-v0.1.5','map')->cell; result text; begin
 if p is null then return null;end if;
 result:='r'||((p->>'row')::int+case direction when 'up' then -1 when 'down' then 1 else 0 end)::text||'c'||((p->>'col')::int+case direction when 'left' then -1 when 'right' then 1 else 0 end)::text;
 return case when ml_private.runtime_data('web-v0.1.5','map') ? result then result else null end;
end $$;
create or replace function ml_private.stage3_west_direction(declared text,die integer) returns text language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ begin
 perform ml_private.need(declared in ('up','right','down','left') and die between 1 and 6,'西帝汶方向或判定无效');
 return case when die%2=0 then declared else case declared when 'up' then 'down' when 'right' then 'left' when 'down' then 'up' else 'right' end end;
end $$;
create or replace function ml_private.stage3_west_step(from_cell text,to_cell text,direction text) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare a jsonb:=ml_private.runtime_data('web-v0.1.5','map')->from_cell; b jsonb:=ml_private.runtime_data('web-v0.1.5','map')->to_cell; begin
 if a is null or b is null then return false;end if;
 return case direction when 'up' then a->'col'=b->'col' and (b->>'row')::int<(a->>'row')::int when 'down' then a->'col'=b->'col' and (b->>'row')::int>(a->>'row')::int when 'left' then a->'row'=b->'row' and (b->>'col')::int<(a->>'col')::int else a->'row'=b->'row' and (b->>'col')::int>(a->>'col')::int end;
end $$;
create or replace function ml_private.stage3_empty_entry(s jsonb,a integer,cell text,ignored jsonb default '[]') returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(ml_private.runtime_data('web-v0.1.5','map') ? cell and not (coalesce((s->>'farmClosed')::boolean,false) and ml_private.runtime_data('web-v0.1.5','map')#>>array[cell,'region']='高唐农场') and ml_private.stage3_can_enter(s,a,cell) and not exists(select 1 from ml_private.arr(s->'players') p where (p->>'hp')::int>0 and p->>'cell'=cell and not (ignored @> jsonb_build_array(p->'seat'))),false) $$;
create or replace function ml_private.stage3_elbow_cells(s jsonb,card_user integer,target integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare d text; cell text; result jsonb:='[]'; begin
 if (s#>>array['players',target::text,'hp'])::int<=0 then return result;end if;
 foreach d in array array['up','right','down','left'] loop cell:=ml_private.stage3_direction_cell(s#>>array['players',target::text,'cell'],d);if cell is not null and ml_private.stage3_empty_entry(s,target,cell,jsonb_build_array(target)) then result:=result||jsonb_build_array(cell);end if;end loop;return result;
end $$;
create or replace function ml_private.stage3_elbow_targets(s jsonb,a integer,converted boolean) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(t order by ord),'[]') from jsonb_array_elements(ml_private.stage3_role_targets(s,a,case when converted then 'role-active' else 'role-locked' end)) with ordinality x(t,ord) where s#>>array['players',a::text,'character']='character-023' and ml_private.runtime_data('web-v0.1.5','map')#>>array[s#>>array['players',a::text,'cell'],'region']=ml_private.runtime_data('web-v0.1.5','map')#>>array[s#>>array['players',t#>>'{}','cell'],'region'] $$;
create or replace function ml_private.stage3_collision_path(s jsonb,card_user integer,target integer,direction text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare result jsonb:='[]'; at_cell text:=s#>>array['players',target::text,'cell']; next_cell text; begin
 if s#>>array['players',card_user::text,'character']<>'character-045' or not ml_private.character_effect_allowed(jsonb_build_object('origin','role-locked','actor',card_user,'roleModifiers','[]'::jsonb),target,s#>>array['players',target::text,'character']) then return result;end if;
 loop next_cell:=ml_private.stage3_direction_cell(at_cell,direction);exit when next_cell is null or not ml_private.stage3_empty_entry(s,target,next_cell,jsonb_build_array(target));result:=result||jsonb_build_array(next_cell);at_cell:=next_cell;exit when ml_private.runtime_data('web-v0.1.5','map')#>>array[at_cell,'region']='山洞';end loop;return result;
end $$;
create or replace function ml_private.stage3_carry_candidates(s jsonb,west integer,origin text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(jsonb_build_object('actor',t,'origin',s#>array['players',t#>>'{}','cell']) order by ord),'[]') from jsonb_array_elements(ml_private.stage3_role_targets(s,west,'role-active')) with ordinality x(t,ord) where s#>>array['players',west::text,'character']='character-040' and ml_private.distance_for_version('web-v0.1.5',origin,s#>>array['players',t#>>'{}','cell'])=1 $$;
create or replace function ml_private.stage3_carry_destinations(s jsonb,west integer,passenger integer,initial text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare result jsonb; begin
 if (s#>>array['players',west::text,'hp'])::int<=0 or (s#>>array['players',passenger::text,'hp'])::int<=0 or s#>>array['players',passenger::text,'cell']<>initial or not (ml_private.stage3_role_targets(s,west,'role-active') @> jsonb_build_array(passenger)) then return '[]';end if;
 select coalesce(jsonb_agg(c->'id' order by ord),'[]') into result from jsonb_array_elements(ml_private.runtime_data('web-v0.1.5','cells')) with ordinality x(c,ord) where ml_private.distance_for_version('web-v0.1.5',s#>>array['players',west::text,'cell'],c->>'id')=1 and ml_private.stage3_empty_entry(s,passenger,c->>'id');return result;
end $$;
