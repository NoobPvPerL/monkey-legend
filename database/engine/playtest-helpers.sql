-- Revision19 helpers. No changes to previously released migrations/components.
create or replace function ml_private.playtest_role_choice(s jsonb,kind text) returns boolean language sql immutable as $$
 select s->>'version'='web-v0.1.8' and kind in ('draw-start','draw-end','lemon-reward','lemon-support','runner-roll','runner-pay','teleport','easy','qb-pursuit','east-start','xiao-overflow','xie-ledger','elbow-push','west-carry') $$;
create or replace function ml_private.playtest_north_targets(s jsonb,targets jsonb,branch text default null,automatic boolean default false) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$
declare north integer;result jsonb;begin
 if s->>'version'<>'web-v0.1.8' then return targets;end if;
 select (v#>>'{}')::int into north from ml_private.arr(targets) v where s#>>array['players',v#>>'{}','character']='character-006';
 if north is null or not exists(select 1 from ml_private.arr(targets) v where (v#>>'{}')::int<>north and s#>>array['players',v#>>'{}','faction']<>'机械猴子') then return targets;end if;
 perform ml_private.need(automatic and branch in ('north','others'),'北帝汶与其他非机械猴子不能同时指定；请选择目标分支');
 select coalesce(jsonb_agg(v order by ord),'[]') into result from jsonb_array_elements(targets) with ordinality q(v,ord)
 where case when branch='north' then (v#>>'{}')::int=north or s#>>array['players',v#>>'{}','faction']='机械猴子' else (v#>>'{}')::int<>north end;
 return result;
end $$;
create or replace function ml_private.playtest_relocation_cell(s jsonb,a integer,origin text,destination text,ignored jsonb default '[]') returns text language plpgsql stable set search_path=pg_catalog,ml_private as $$
declare startcell jsonb:=ml_private.game_data(s,'map')->origin;cell jsonb:=ml_private.game_data(s,'map')->destination;dr integer;dc integer;begin
 if s->>'version'<>'web-v0.1.8' then return destination;end if;
 if startcell is null or cell is null then return null;end if;
 dr:=sign((cell->>'row')::int-(startcell->>'row')::int);dc:=sign((cell->>'col')::int-(startcell->>'col')::int);
 loop
  if not ml_private.stage4_board_entry(s,a,cell->>'id') or exists(select 1 from ml_private.arr(s->'players') p where (p->>'seat')::int<>a and not ignored @> jsonb_build_array(p->'seat') and ml_private.stage4_on_board(s,(p->>'seat')::int) and p->'cell'=cell->'id') then return null;end if;
  if not ml_private.classic_native(s,a) or not ml_private.stage4_board_water(s,cell->>'id',a) then return cell->>'id';end if;
  if dr=0 and dc=0 then return null;end if;
  cell:=ml_private.game_data(s,'map')->('r'||((cell->>'row')::int+dr)||'c'||((cell->>'col')::int+dc));if cell is null then return null;end if;
 end loop;
end $$;
create or replace function ml_private.playtest_nearest_shore(s jsonb,a integer,reserved jsonb default '[]') returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$
 with candidates as (select c->>'id' id,ml_private.distance_for_version(s->>'version',s#>>array['players',a::text,'cell'],c->>'id') dist from ml_private.arr(ml_private.game_data(s,'cells')) c
 where not ml_private.stage4_board_water(s,c->>'id',a) and ml_private.stage4_board_empty(s,a,c->>'id',jsonb_build_array(a)) and not reserved ? (c->>'id'))
 select coalesce(jsonb_agg(id order by id),'[]') from candidates where dist=(select min(dist) from candidates) $$;
create or replace function ml_private.playtest_flood(s jsonb,region text,owner integer,effect jsonb) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$
declare prior jsonb:=s#>array['stage4','water',region];reserved jsonb:='[]';plans jsonb:='[]';tasks jsonb:='[]';a integer;cells jsonb;plan jsonb;begin
 s:=jsonb_set(s,array['stage4','water',region],jsonb_build_object('owner',owner,'effect',effect));
 for a in select (v#>>'{}')::int from ml_private.arr(s->'order') v loop
  if ml_private.stage4_on_board(s,a) and ml_private.classic_native(s,a) and ml_private.stage4_board_water(s,s#>>array['players',a::text,'cell'],a) then
   cells:=ml_private.playtest_nearest_shore(s,a,reserved);
   if jsonb_array_length(cells)=0 then
    if prior is null then s:=s#-array['stage4','water',region];else s:=jsonb_set(s,array['stage4','water',region],prior);end if;
    return ml_private.emit(s,'effect','汶泽无合法岸边，地形变化未生效')||jsonb_build_object('_floodFailed',true);
   end if;
   plans:=plans||jsonb_build_array(jsonb_build_object('actor',a,'cells',cells));reserved:=reserved||jsonb_build_array(cells->0);
  end if;
 end loop;
 for plan in select * from ml_private.arr(plans) loop
  select coalesce(jsonb_agg(v order by v),'[]') into cells from ml_private.arr(plan->'cells') v where not exists(select 1 from jsonb_array_elements(reserved) with ordinality r(x,ord) where x=v and plans->(ord::int-1)->'actor'<>plan->'actor');
  tasks:=tasks||jsonb_build_array(ml_private.stage3_task('board-shore',jsonb_build_object('actor',plan->'actor','data',jsonb_build_object('cells',cells))));
 end loop;
 return s||jsonb_build_object('_shoreTasks',tasks);
end $$;
