create or replace function ml_private.stage4_equipment_definition(s jsonb,card text) returns text language sql immutable as $$ select coalesce(s#>>array['stage4','copies',card],split_part(card,'#',1)) $$;
create or replace function ml_private.stage4_on_board(s jsonb,a integer) returns boolean language sql immutable as $$
 select coalesce((s#>>array['players',a::text,'hp'])::int>0,false) and coalesce(s#>>array['stage4','offMap',a::text],'false')<>'true' $$;
create or replace function ml_private.stage4_board_effect(s jsonb,a integer,effect jsonb,tag text default null) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select s->'players'->a is not null and ml_private.character_effect_allowed(effect,a,s#>>array['players',a::text,'character'])
 and not(s#>>array['players',a::text,'character']='character-006' and (effect->>'actor')::int<>a and effect->>'faction'<>'机械猴子')
 and not(s#>>array['players',a::text,'character']='character-005' and coalesce(tag,'')='建民') $$;
create or replace function ml_private.stage4_board_water(s jsonb,cell text,a integer default null) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=ml_private.game_data(s,'map')->cell;e jsonb;begin
 if c is null then return false;end if;e:=s#>array['stage4','water',c->>'region'];
 return c->>'terrain'='water' or e is not null and (a is null or ml_private.stage4_board_effect(s,a,e->'effect'));
end $$;
create or replace function ml_private.stage4_board_entry(s jsonb,a integer,cell text) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=ml_private.game_data(s,'map')->cell;b jsonb;begin
 if c is null or coalesce((s#>>'{classic,farmClosed}')::boolean,(s->>'farmClosed')::boolean,false) and c->>'region'='高唐农场' then return false;end if;
 if ml_private.stage4_board_water(s,cell,a) and exists(select 1 from ml_private.arr(coalesce(s#>array['stage3','equipment',a::text],'[]')) v where ml_private.stage4_equipment_definition(s,v#>>'{}') in ('basic-063','basic-064')) then return false;end if;
 for b in select * from ml_private.arr(coalesce(s#>'{stage4,blocks}','[]')) loop
  if b->>'region'=c->>'region' and (s#>>array['players',b->>'owner','hp'])::int>0 and (s#>>array['stage3','starts',b->>'owner'])::int<(b->>'until')::int and a<>(b->>'owner')::int
   and not(s->>'mode'='team' and s#>array['players',a::text,'team']=s#>array['players',b->>'owner','team']) and not(b->'exempt' @> jsonb_build_array(a)) and ml_private.stage4_board_effect(s,a,b->'effect','建民') then return false;end if;
 end loop;return true;
end $$;
create or replace function ml_private.stage4_board_empty(s jsonb,a integer,cell text,ignored jsonb default '[]') returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.stage4_board_entry(s,a,cell) and not exists(select 1 from ml_private.arr(s->'players') p where ml_private.stage4_on_board(s,(p->>'seat')::int) and p->>'cell'=cell and not(ignored @> jsonb_build_array(p->'seat'))) $$;
create or replace function ml_private.stage4_single_protected(s jsonb,src integer,target integer) returns boolean language sql stable as $$
 select src<>target and coalesce(s#>array['stage4','toiletUntil',target::text]<>'null'::jsonb,false) and (s#>array['stage4','toiletEffects',target::text] is null or ml_private.stage4_board_effect(s,src,s#>array['stage4','toiletEffects',target::text])) $$;
create or replace function ml_private.stage4_lmm_target(s jsonb,a integer,candidates jsonb) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select (v#>>'{}')::int from jsonb_array_elements(candidates) with ordinality q(v,ord)
 where ml_private.stage4_on_board(s,(v#>>'{}')::int) and (v#>>'{}')::int<>a and (s->>'mode'<>'team' or s#>array['players',v#>>'{}','team']<>s#>array['players',a::text,'team']) and coalesce(s#>array['stage4','lmmUntil',v#>>'{}']<>'null'::jsonb,false) and (s#>array['stage4','lmmEffects',v#>>'{}'] is null or ml_private.stage4_board_effect(s,a,s#>array['stage4','lmmEffects',v#>>'{}'])) order by coalesce((s#>>array['stage4','lmmSerial',v#>>'{}'])::int,0) desc,ord limit 1 $$;
create or replace function ml_private.stage4_expire_board(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare r jsonb:=s->'stage4';blocks jsonb;begin
 if (r#>>array['toiletUntil',a::text])::int<=(s#>>array['stage3','starts',a::text])::int then r:=jsonb_set(r,array['toiletUntil',a::text],'null');r:=jsonb_set(r,'{toiletEffects}',(r->'toiletEffects')-a::text);end if;
 if (r#>>array['lmmUntil',a::text])::int<=(s#>>array['stage3','starts',a::text])::int then r:=jsonb_set(r,array['lmmUntil',a::text],'null');r:=jsonb_set(r,'{lmmEffects}',(r->'lmmEffects')-a::text);end if;
 select coalesce(jsonb_agg(b order by ord),'[]') into blocks from jsonb_array_elements(r->'blocks') with ordinality q(b,ord) where (s#>>array['players',b->>'owner','hp'])::int>0 and (s#>>array['stage3','starts',b->>'owner'])::int<(b->>'until')::int;
 return jsonb_set(s,'{stage4}',jsonb_set(r,'{blocks}',blocks));
end $$;
create or replace function ml_private.stage4_desert(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare e jsonb:=s#>array['stage4','deserts',ml_private.game_data(s,'map')#>>array[s#>>array['players',a::text,'cell'],'region']];begin
 if ml_private.stage4_on_board(s,a) and e is not null and ml_private.stage4_board_effect(s,a,e->'effect') then return e;end if;return null;
end $$;
create or replace function ml_private.stage4_region_distance(s jsonb,a integer,region text) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select min(ml_private.distance_for_version(s->>'version',s#>>array['players',a::text,'cell'],c->>'id')) from ml_private.arr(ml_private.game_data(s,'cells')) c where c->>'region'=region $$;
create or replace function ml_private.stage4_forced_paths(s jsonb,a integer,region text,step_limit integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare origin text:=s#>>array['players',a::text,'cell'];distances jsonb;parents jsonb:='{}';queue jsonb;goals jsonb:='[]';goal integer:=1000;from_cell text;d integer;c jsonb;next_distance integer;result jsonb;begin
 if not ml_private.stage4_on_board(s,a) or step_limit<1 then return '[]';end if;
 if ml_private.game_data(s,'map')#>>array[origin,'region']=region then return '[[]]';end if;
 distances:=jsonb_build_object(origin,0);queue:=jsonb_build_array(origin);
 while jsonb_array_length(queue)>0 loop
  from_cell:=queue->>0;queue:=queue-0;d:=(distances->>from_cell)::int;if d>=goal then continue;end if;
  if from_cell<>origin and ml_private.game_data(s,'map')#>>array[from_cell,'region']='山洞' then continue;end if;
  for c in select * from ml_private.arr(ml_private.game_data(s,'cells')) loop
   if ml_private.distance_for_version(s->>'version',from_cell,c->>'id')<>1 or not ml_private.stage4_board_empty(s,a,c->>'id',jsonb_build_array(a)) then continue;end if;
   next_distance:=d+1;if distances ? (c->>'id') and (distances->>(c->>'id'))::int<next_distance then continue;end if;
   if not(distances ? (c->>'id')) then distances:=jsonb_set(distances,array[c->>'id'],to_jsonb(next_distance));queue:=queue||jsonb_build_array(c->'id');parents:=jsonb_set(parents,array[c->>'id'],'[]');end if;
   parents:=jsonb_set(parents,array[c->>'id'],(parents->(c->>'id'))||jsonb_build_array(from_cell));
   if c->>'region'=region then goal:=next_distance;if not(goals ? (c->>'id')) then goals:=goals||jsonb_build_array(c->'id');end if;end if;
  end loop;
 end loop;
 with recursive routes(cell,tail) as (
  select v#>>'{}','[]'::jsonb from ml_private.arr(goals) v where (distances->>(v#>>'{}'))::int=goal
  union all select p#>>'{}',jsonb_build_array(r.cell)||r.tail from routes r cross join lateral ml_private.arr(coalesce(parents->r.cell,'[]')) p where r.cell<>origin
 ), paths as (
  select distinct (select coalesce(jsonb_agg(v order by ord),'[]') from jsonb_array_elements(tail) with ordinality q(v,ord) where ord<=step_limit) path from routes where cell=origin
 ) select coalesce(jsonb_agg(path order by path::text),'[]') into result from paths;return result;
end $$;
