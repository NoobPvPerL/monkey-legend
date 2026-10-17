-- Source for 012; existing installed migrations remain immutable.
create or replace function ml_private.classic_water(s jsonb,cell text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(ml_private.game_data(s,'map')->cell->>'terrain'='water',false) $$;
create or replace function ml_private.classic_native(s jsonb,a integer) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce((ml_private.version_catalog(s->>'version')#>>array['characterTraits',s->'players'->a->>'character','waterNative'])::boolean,false) $$;
create or replace function ml_private.classic_enter(s jsonb,cell text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.game_data(s,'map') ? cell and not (coalesce((s#>>'{classic,farmClosed}')::boolean,false) and ml_private.region_at(s->>'version',cell)='高唐农场') $$;
create or replace function ml_private.classic_relocated(s jsonb,a integer,origin text,cell text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ begin
 if s->>'version'='web-v0.1.4' and ml_private.region_at(s->>'version',origin)<>ml_private.region_at(s->>'version',cell) then s:=jsonb_set(s,array['classic','exposure',a::text],jsonb_build_object('region',null,'streak',0)); end if; return s;
end $$;
create or replace function ml_private.classic_owes_water(s jsonb,a integer,origin text default null) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select s->>'version'='web-v0.1.4' and not ml_private.classic_native(s,a) and ml_private.classic_water(s,s->'players'->a->>'cell') and (origin is null or not ml_private.classic_water(s,origin)) and (s->'players'->a->>'hp')::int>0 and jsonb_array_length(s->'players'->a->'hand')>0 $$;
create or replace function ml_private.classic_pick(s jsonb,pool jsonb,amount integer,scripted boolean default false) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare selected jsonb:='[]'; item jsonb; idx integer; begin
 while jsonb_array_length(pool)>0 and jsonb_array_length(selected)<amount loop
  if scripted and jsonb_array_length(s#>'{random,bombs}')>0 then item:=s#>'{random,bombs,0}'; s:=jsonb_set(s,'{random,bombs}',(s#>'{random,bombs}')-0); select ordinality::int-1 into idx from jsonb_array_elements(pool) with ordinality where value=item; perform ml_private.need(idx is not null,'注入轰炸地区无效或重复');
  else s:=ml_private.int(s,jsonb_array_length(pool)); idx:=(s->>'_int')::int; s:=s-'_int'; item:=pool->idx; end if;
  selected:=selected||jsonb_build_array(item); pool:=pool-idx;
 end loop; return s||jsonb_build_object('_picked',selected);
end $$;
create or replace function ml_private.classic_refresh(s jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare pool jsonb; safe jsonb; begin
 select coalesce(jsonb_agg(key),'[]') into pool from jsonb_each(ml_private.version_catalog(s->>'version')#>'{mapDefinition,regions}') where value->>'exposure'='indoor' and not (s#>'{classic,poison}' ? key);
 -- JSONB object iteration sorts keys; use map first-occurrence order to match TS.
 select coalesce(jsonb_agg(q.region order by q.first_cell),'[]') into pool from (select c->>'region' region,min(ord) first_cell from jsonb_array_elements(ml_private.game_data(s,'cells')) with ordinality t(c,ord) where pool ? (c->>'region') group by c->>'region') q;
 s:=ml_private.classic_pick(s,pool,2); s:=jsonb_set(s,'{classic,poison}',(s#>'{classic,poison}')||(s->'_picked')); s:=s-'_picked';
 s:=jsonb_set(s,'{classic,farmClosed}',to_jsonb((s->>'round')::int>=5)); s:=jsonb_set(s,'{classic,bombs}','[]');
 select coalesce(jsonb_agg(c->'id'),'[]') into safe from ml_private.arr(ml_private.game_data(s,'cells')) c where not (s#>'{classic,poison}' ? (c->>'region'));
 return s||jsonb_build_object('safe',safe,'bomb',null,'forecast',null);
end $$;
create or replace function ml_private.classic_environment(s jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare pool jsonb; hits jsonb:='[]'; p jsonb; a integer; region text; old jsonb; danger boolean; streak integer; amount integer; loss integer; begin
 select jsonb_agg(q.region order by q.first_cell) into pool from (select c->>'region' region,min(ord) first_cell from jsonb_array_elements(ml_private.game_data(s,'cells')) with ordinality t(c,ord) where ml_private.version_catalog(s->>'version')#>>array['mapDefinition','regions',c->>'region','exposure']='outdoor' group by c->>'region') q;
 s:=ml_private.classic_pick(s,pool,2,true);s:=jsonb_set(s,'{classic,bombs}',s->'_picked');s:=s-'_picked';
 for a in 0..3 loop p:=s->'players'->a; if (p->>'hp')::int<=0 then continue; end if;
  region:=ml_private.region_at(s->>'version',p->>'cell');old:=s#>array['classic','exposure',a::text];danger:=s#>'{classic,poison}' ? region or s#>'{classic,bombs}' ? region;
  streak:=case when not danger then 0 when old->>'region'=region then (old->>'streak')::int+1 else 1 end;
  amount:=case when danger then power(2,least(30,streak-1))::int else 0 end;loss:=least((p->>'hp')::int,greatest(0,amount-(p->>'shield')::int));
  s:=jsonb_set(s,array['classic','exposure',a::text],case when loss>0 then jsonb_build_object('region',region,'streak',streak) else jsonb_build_object('region',null,'streak',0) end);
  hits:=hits||jsonb_build_array(jsonb_build_object('target',a,'amount',amount,'source',null,'category','environment'));
 end loop;return s||jsonb_build_object('_hits',hits);
end $$;
create or replace function ml_private.classic_landings(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare origin jsonb; cell jsonb; nearc jsonb; dr integer; dc integer; r integer; coln integer; result jsonb:='[]'; begin
 if s->>'version'<>'web-v0.1.4' or not ml_private.classic_native(s,a) then return '[]'; end if;
 origin:=ml_private.game_data(s,'map')->(s->'players'->a->>'cell');if origin->>'terrain'<>'land' then return '[]'; end if;
 for dr,dc in select * from (values(1,0),(-1,0),(0,1),(0,-1)) d(x,y) loop
  r:=(origin->>'row')::int+dr;coln:=(origin->>'col')::int+dc;cell:=ml_private.game_data(s,'map')->('r'||r||'c'||coln);if cell->>'terrain' is distinct from 'water' then continue; end if;
  while cell->>'terrain'='water' loop r:=r+dr;coln:=coln+dc;cell:=ml_private.game_data(s,'map')->('r'||r||'c'||coln);end loop;
  if cell is null then continue;end if;
  if ml_private.classic_enter(s,cell->>'id') and not ml_private.occupied(s,cell->>'id',-1) then result:=result||jsonb_build_array(cell->'id');
  elsif ml_private.occupied(s,cell->>'id',-1) then
   for nearc in select * from ml_private.arr(ml_private.game_data(s,'cells')) loop if nearc->>'terrain'='land' and ml_private.distance_for_version(s->>'version',cell->>'id',nearc->>'id')=1 and ml_private.classic_enter(s,nearc->>'id') and not ml_private.occupied(s,nearc->>'id',-1) then result:=result||jsonb_build_array(nearc->'id');end if;end loop;
  end if;
 end loop;
 return (select coalesce(jsonb_agg(c->'id'),'[]') from ml_private.arr(ml_private.game_data(s,'cells')) c where result ? (c->>'id'));
end $$;
create or replace function ml_private.classic_step_cost(s jsonb,a integer,cell text) returns integer language plpgsql stable
set search_path=pg_catalog,ml_private as $$ begin
 if not ml_private.classic_enter(s,cell) then return null;end if;
 if ml_private.classic_landings(s,a) ? cell then return 1;end if;
 if ml_private.distance_for_version(s->>'version',s->'players'->a->>'cell',cell)=1 then return case when ml_private.classic_water(s,cell) then 2 else 1 end;end if;return null;
end $$;
create or replace function ml_private.classic_walk(s jsonb,path jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare a integer:=(s->>'active')::int; p jsonb:=s->'players'->a; m jsonb:=s->'movement'; cell text; origin text; cost integer; idx integer:=0; check_s jsonb; begin
 s:=jsonb_set(s,'{phase}','"moving"');
 check_s:=s;
 for cell in select x#>>'{}' from ml_private.arr(path) x loop
  perform ml_private.need(ml_private.legal_steps(check_s) ? cell,'移动路径不合法：检查步数、占用、封闭地区或越水落点');
  cost:=ml_private.classic_step_cost(check_s,a,cell);check_s:=jsonb_set(check_s,'{movement,remaining}',to_jsonb((check_s#>>'{movement,remaining}')::int-cost));check_s:=ml_private.put_player(check_s,a,(check_s->'players'->a)||jsonb_build_object('cell',cell));
  if ml_private.location_stops(check_s->>'version',cell) then check_s:=jsonb_set(check_s,'{movement,remaining}','0');end if;
 end loop;
 for cell in select x#>>'{}' from ml_private.arr(path) x loop
  perform ml_private.need(ml_private.legal_steps(s) ? cell,'移动路径不合法：检查步数、占用、封闭地区或越水落点');
  origin:=p->>'cell';cost:=ml_private.classic_step_cost(s,a,cell);m:=m||jsonb_build_object('remaining',(m->>'remaining')::int-cost,'path',(m->'path')||to_jsonb(cell));p:=p||jsonb_build_object('cell',cell);s:=ml_private.put_player(s,a,p);s:=ml_private.classic_relocated(s,a,origin,cell);
  if not ml_private.occupied(s,cell,a) then m:=m||jsonb_build_object('lastEmpty',cell);end if;
  if ml_private.location_stops(s->>'version',cell) then m:=jsonb_set(m,'{remaining}','0');end if;
  s:=jsonb_set(s,'{movement}',m);s:=ml_private.emit(s,'move',ml_private.name(s,a)||' → '||cell||'，消耗'||cost||'步，余'||(m->>'remaining'));idx:=idx+1;
  if ml_private.classic_owes_water(s,a,origin) then
   s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','walk','path',(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(path) with ordinality t(x,n) where n>idx)))||(s->'queue'));
   return ml_private.select_choice(s,'water-discard',a,at,jsonb_build_object('count',1,'cards',p->'hand'));
  end if;
 end loop;
 if (m->>'remaining')::int=0 then s:=ml_private.settle_movement(s);s:=s||jsonb_build_object('movement',null,'phase','action');end if;
 return ml_private.resume(s,at);
end $$;
