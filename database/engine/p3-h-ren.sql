-- N-10 preparation only: no dispatch/catalog activation or release migration.
create or replace function ml_private.p3h_ren_initial() returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$
 select '{"used":[false,false,false,false],"attempts":[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],"won":[[false,false,false,false],[false,false,false,false],[false,false,false,false],[false,false,false,false]],"pending":null}'::jsonb
$$;
create or replace function ml_private.p3h_ren_init(s jsonb) returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$
 select case when s#>'{stage3,h,ren}' is null then jsonb_set(s,'{stage3,h,ren}',ml_private.p3h_ren_initial()) else s end
$$;
create or replace function ml_private.p3h_ren_targets(s jsonb,a integer) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$
 select coalesce(jsonb_agg(v order by n),'[]') from jsonb_array_elements(s->'order') with ordinality q(v,n)
 where ml_private.p3h_enabled(s) and s#>>array['players',a::text,'character']='character-034' and ml_private.stage4_on_board(s,a) and ml_private.p3h_active_allowed(s,a)
 and (v#>>'{}')::int<>a and ml_private.stage4_on_board(s,(v#>>'{}')::int) and ml_private.stage3_same_near(s#>>array['players',a::text,'cell'],s#>>array['players',v#>>'{}','cell'])
 and coalesce(s#>>array['stage3','h','ren','won',a::text,v#>>'{}'],'false')='false'
 and ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',a,'roleModifiers','[]'::jsonb),(v#>>'{}')::int,s#>>array['players',v#>>'{}','character'])
$$;
create or replace function ml_private.p3h_ren_begin(s jsonb,a integer,target integer) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare r jsonb;attempt integer;d jsonb;begin
 perform ml_private.need(ml_private.p3h_enabled(s),'化学金牌教练仅限H版本');s:=ml_private.p3h_ren_init(s);r:=s#>'{stage3,h,ren}';
 perform ml_private.need(s->>'phase'='action' and s->'choice'='null'::jsonb and (s->>'active')::int=a and r#>>array['used',a::text]='false' and r->'pending'='null'::jsonb and ml_private.p3h_ren_targets(s,a) @> jsonb_build_array(target),'化学金牌教练角色、次数或目标不合法');
 attempt:=(r#>>array['attempts',a::text,target::text])::int+1;d:=jsonb_build_object('actor',a,'target',target,'attempt',attempt);r:=jsonb_set(r,array['used',a::text],'true');r:=jsonb_set(r,array['attempts',a::text,target::text],to_jsonb(attempt));r:=jsonb_set(r,'{pending}',d);return jsonb_set(s,'{stage3,h,ren}',r)||jsonb_build_object('_hRenOffer',d);
end $$;
create or replace function ml_private.p3h_ren_action(s jsonb,a integer) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$
 select jsonb_build_object('available',s->>'phase'='action' and s->'choice'='null'::jsonb and (s->>'active')::int=a and coalesce(s#>>array['stage3','h','ren','used',a::text],'false')='false' and jsonb_array_length(ml_private.p3h_ren_targets(s,a))>0,'used',coalesce(s#>array['stage3','h','ren','used',a::text],'false'::jsonb),'targets',ml_private.p3h_ren_targets(s,a),'attempts',coalesce(s#>array['stage3','h','ren','attempts',a::text],'[0,0,0,0]'::jsonb))
$$;
create or replace function ml_private.p3h_ren_public(s jsonb) returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$
 select case when s#>'{stage3,h,ren}' is null then 'null'::jsonb else jsonb_build_object('used',s#>'{stage3,h,ren,used}','attempts',s#>'{stage3,h,ren,attempts}','won',s#>'{stage3,h,ren,won}') end
$$;
create or replace function ml_private.p3h_ren_skill(s jsonb,cmd jsonb) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare a integer:=(cmd->>'actor')::int;target integer:=(cmd->>'target')::int;attempt integer;begin
 s:=ml_private.p3h_ren_begin(s,a,target);attempt:=(s#>>'{_hRenOffer,attempt}')::int;s:=s-'_hRenOffer';s:=ml_private.emit(s,'skill','S'||(a+1)||' 化学金牌教练：与S'||(target+1)||'第'||attempt||'次拼点');return jsonb_set(s,'{queue}',(s->'queue')||jsonb_build_array(ml_private.stage3_task('h-ren-duel',jsonb_build_object('actor',a,'target',target))));
end $$;
create or replace function ml_private.p3h_ren_gear_offer(s jsonb,a integer,source integer,card text) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$begin
 if not ml_private.stage4_on_board(s,a) or not ml_private.stage4_on_board(s,source) or not(s#>array['stage3','equipment',source::text] ? card) then return null;end if;
 return jsonb_build_object('options',ml_private.stage3_equipment_options(s,a,card),'paired',ml_private.p3g_piece_physical(s,card) is not null,'waterBlocked',ml_private.stage4_equipment_definition(s,card) in ('basic-063','basic-064') and ml_private.stage4_board_water(s,s#>>array['players',a::text,'cell'],a));
end $$;
create or replace function ml_private.p3h_ren_transfer(s jsonb,a integer,source integer,card text,replacement text default null) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare g jsonb:=ml_private.p3g_gear_snapshot(s,source,card);data jsonb:=jsonb_build_object('gear',g);jobs jsonb;begin
 if replacement is not null then data:=data||jsonb_build_object('replacement',replacement);end if;
 if ml_private.p3g_piece_physical(s,card) is not null then jobs:=jsonb_build_array(ml_private.stage3_task('g-paired-transfer',jsonb_build_object('actor',a,'data',data||jsonb_build_object('source',source))));
 else s:=ml_private.stage4_gear_detach(s,source,g,false);jobs:=jsonb_build_array(ml_private.stage3_task('gear-loss',jsonb_build_object('actor',source,'data',g)),ml_private.stage3_task('gear-transfer-install',jsonb_build_object('actor',a,'data',data)));end if;
 return s||jsonb_build_object('_hRenTasks',jobs);
end $$;
create or replace function ml_private.p3h_ren_task(s jsonb,t jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare action text:=t->>'action';a integer:=(t->>'actor')::int;target integer:=(t->>'target')::int;r jsonb;rolls jsonb:='[]';jobs jsonb:='[]';card text;offer jsonb;options jsonb;cells jsonb;gate jsonb;d jsonb:=coalesce(t->'data','{}');root text;begin
 if not ml_private.p3h_enabled(s) or action not in ('h-ren-duel','h-ren-gear','h-ren-retreat','h-ren-back','h-ren-expel') then return s||jsonb_build_object('_hHandled',false);end if;
 if action='h-ren-duel' then
  s:=ml_private.p3g_owned_die(s,'化学金牌教练本人一',a);rolls:=rolls||jsonb_build_array(s->'_roll');s:=s-'_roll';s:=ml_private.p3g_owned_die(s,'化学金牌教练本人二',a);rolls:=rolls||jsonb_build_array(s->'_roll');s:=s-'_roll';s:=ml_private.p3g_owned_die(s,'化学金牌教练对方',target);rolls:=rolls||jsonb_build_array(s->'_roll');s:=s-'_roll';s:=ml_private.p3h_ren_settle(s,rolls);r:=s->'_hRenResult';s:=s-'_hRenResult';
  s:=ml_private.emit(s,'skill','S'||(a+1)||' 化学金牌教练：'||(r->>'own')||'对'||(r->>'other')||'，'||case when r->>'win'='true' then '获胜，转移'||(r->>'ap')||'AP／'||(r->>'cards')||'张手牌' else '失败，自受'||(r->>'failure')||'伤' end);
  if r->>'win'='true' then for card in select v#>>'{}' from ml_private.arr(r->'equipment') v loop jobs:=jobs||jsonb_build_array(ml_private.stage3_task('h-ren-gear',jsonb_build_object('actor',a,'target',target,'data',jsonb_build_object('card',card))));end loop;
  else s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',a,'amount',r->'failure','source',a,'category','response')));jobs:=s->'_triggers';s:=s-'_triggers';end if;
  return ml_private.stage3_prepend(s,jobs)||jsonb_build_object('_hHandled',true);
 end if;
 if not ml_private.stage4_on_board(s,a) then return s||jsonb_build_object('_hHandled',true);end if;
 if action='h-ren-gear' then
  card:=d->>'card';offer:=ml_private.p3h_ren_gear_offer(s,a,target,card);if offer is null then return s||jsonb_build_object('_hHandled',true);end if;
  if offer->>'paired'='true' and (offer#>>'{options,allowed}'<>'true' or offer->>'waterBlocked'='true') then return ml_private.emit(s,'transfer','化学金牌教练：成对装备件无法合法安装，留在原装备区')||jsonb_build_object('_hHandled',true);end if;
  if offer#>>'{options,allowed}'='true' and offer#>>'{options,required}'='true' and offer->>'waterBlocked'<>'true' then s:=ml_private.select_choice(s,'h-ren-gear',a,at,jsonb_build_object('source',target,'cards',offer#>'{options,cards}','data',jsonb_build_object('card',card)));
  else s:=ml_private.p3h_ren_transfer(s,a,target,card);s:=ml_private.stage3_prepend(s,s->'_hRenTasks')-'_hRenTasks';end if;return s||jsonb_build_object('_hHandled',true);
 end if;
 if not ml_private.stage4_on_board(s,target) then return s||jsonb_build_object('_hHandled',true);end if;
 if action='h-ren-retreat' then
  options:='["pass"]';if jsonb_array_length(ml_private.p3h_ren_back_cells(s,a,target,s#>>array['players',a::text,'cell']))>0 then options:=options||'"source"'::jsonb;end if;if jsonb_array_length(ml_private.p3h_ren_back_cells(s,a,a,s#>>array['players',target::text,'cell']))>0 then options:=options||'"self"'::jsonb;end if;if jsonb_array_length(options)=3 then options:=options||'"both"'::jsonb;end if;
  if jsonb_array_length(options)>1 then s:=ml_private.select_choice(s,'h-ren-retreat',a,at,jsonb_build_object('source',target,'data',jsonb_build_object('options',options)));end if;return s||jsonb_build_object('_hHandled',true);
 end if;
 root:=coalesce(d->>'root','ren'||(s->>'batch')||'-'||a||'-'||target||'-'||(s->>'eventSerial'));s:=jsonb_set(s,'{stage3,e,current}',to_jsonb(root));cells:=case when action='h-ren-back' then ml_private.p3h_ren_back_cells(s,a,target,s#>>array['players',d->>'anchor','cell']) else ml_private.p3h_ren_expel_cells(s,a,target) end;
 if jsonb_array_length(cells)>0 then gate:=ml_private.p3e_gate(s,target,a,jsonb_build_array(t||jsonb_build_object('data',d||jsonb_build_object('root',root))),root);if gate is not null then s:=ml_private.stage3_prepend(s,gate);else s:=ml_private.select_choice(s,case when action='h-ren-back' then 'h-ren-back' else 'h-ren-expel' end,a,at,jsonb_build_object('source',target,'cells',cells,'data',d||jsonb_build_object('root',root)));end if;end if;return s||jsonb_build_object('_hHandled',true);
end $$;
create or replace function ml_private.p3h_ren_choose(s jsonb,cmd jsonb,at double precision,timeout boolean) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare c jsonb:=s->'choice';kind text:=c->>'kind';a integer:=(c->>'actor')::int;target integer:=(c->>'source')::int;d jsonb:=c->'data';card text;offer jsonb;option text;root text;cells jsonb;cell text:=cmd->>'cell';jobs jsonb:='[]';begin
 if not ml_private.p3h_enabled(s) or kind not in ('h-ren-gear','h-ren-retreat','h-ren-back','h-ren-expel') then return s||jsonb_build_object('_hHandled',false);end if;
 if kind='h-ren-gear' then
  if not timeout and cmd->>'accept' is distinct from 'false' then card:=d->>'card';offer:=ml_private.p3h_ren_gear_offer(s,a,target,card);if offer is not null then perform ml_private.need(offer#>>'{options,allowed}'='true' and offer->>'waterBlocked'<>'true' and cmd->>'card' is not null and c->'cards' ? (cmd->>'card') and offer#>'{options,cards}' ? (cmd->>'card'),'请选择仍合法的替换装备，或放弃该件');s:=ml_private.p3h_ren_transfer(s,a,target,card,cmd->>'card');s:=ml_private.stage3_prepend(s,s->'_hRenTasks')-'_hRenTasks';end if;end if;
 elsif kind='h-ren-retreat' then
  option:=case when timeout then 'pass' else coalesce(cmd->>'option','pass') end;perform ml_private.need(d->'options' ? option,'请选择合法后退方式');root:='ren'||(s->>'batch')||'-'||a||'-'||target||'-'||(s->>'eventSerial');
  if option in ('source','both') then jobs:=jobs||jsonb_build_array(ml_private.stage3_task('h-ren-back',jsonb_build_object('actor',a,'target',target,'data',jsonb_build_object('anchor',a,'root',root))));end if;
  if option in ('self','both') then jobs:=jobs||jsonb_build_array(ml_private.stage3_task('h-ren-back',jsonb_build_object('actor',a,'target',a,'data',jsonb_build_object('anchor',target,'root',root))));end if;s:=ml_private.stage3_prepend(s,jobs);
 elsif not timeout and cell is not null then
  cells:=case when kind='h-ren-back' then ml_private.p3h_ren_back_cells(s,a,target,s#>>array['players',d->>'anchor','cell']) else ml_private.p3h_ren_expel_cells(s,a,target) end;perform ml_private.need(c->'cells' ? cell and cells ? cell,'后退或厌蠢落点已失效');s:=jsonb_set(s,'{stage3,e,current}',d->'root');s:=s||jsonb_build_object('_eCause',jsonb_build_object('source',a,'root',ml_private.p3e_root(s)));s:=ml_private.stage3_relocate(s,target,cell,false,false);s:=ml_private.stage3_prepend(s,s->'_relocationTasks')-'_relocationTasks';
 end if;return s||jsonb_build_object('_hHandled',true);
end $$;
create or replace function ml_private.p3h_ren_settle(s jsonb,rolls jsonb) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare r jsonb;d jsonb;a integer;target integer;attempt integer;own integer;other integer;win boolean;ap integer:=0;cards integer:=0;gear jsonb:='[]';result jsonb;begin
 s:=ml_private.p3h_ren_init(s);r:=s#>'{stage3,h,ren}';d:=r->'pending';perform ml_private.need(ml_private.p3h_enabled(s) and d<>'null'::jsonb,'拼点记录已失效');
 perform ml_private.need(jsonb_array_length(rolls)=3 and not exists(select 1 from ml_private.arr(rolls) v where jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) or (v#>>'{}')::numeric not between 1 and 6),'拼点必须三个最终d6');
 a:=(d->>'actor')::int;target:=(d->>'target')::int;attempt:=(d->>'attempt')::int;perform ml_private.need(ml_private.stage4_on_board(s,a) and ml_private.stage4_on_board(s,target),'拼点参与者已离场');own:=greatest((rolls->>0)::int,(rolls->>1)::int);other:=(rolls->>2)::int;win:=own>other;r:=jsonb_set(r,'{pending}','null');
 if win then
  r:=jsonb_set(r,array['won',a::text,target::text],'true');ap:=(s#>>array['players',target::text,'ap'])::int;cards:=jsonb_array_length(s#>array['players',target::text,'hand']);gear:=s#>array['stage3','equipment',target::text];s:=jsonb_set(s,array['players',target::text,'ap'],'0');s:=ml_private.stage3_gain_ap(s,a,ap);s:=s-'_gain';s:=jsonb_set(s,array['players',a::text,'hand'],(s#>array['players',a::text,'hand'])||(s#>array['players',target::text,'hand']));s:=jsonb_set(s,array['players',target::text,'hand'],'[]');
 end if;
 result:=jsonb_build_object('actor',a,'target',target,'attempt',attempt,'own',own,'other',other,'win',win,'failure',case when win then 0 else least(3,attempt) end,'ap',ap,'cards',cards,'equipment',gear);return jsonb_set(s,'{stage3,h,ren}',r)||jsonb_build_object('_hRenResult',result);
end $$;
create or replace function ml_private.p3h_ren_start(s jsonb,a integer) returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$
 select case when ml_private.p3h_enabled(s) and s#>'{stage3,h,ren}' is not null then jsonb_set(s,array['stage3','h','ren','used',a::text],'false') else s end
$$;
create or replace function ml_private.p3h_ren_round_ap(s jsonb,a integer,amount integer) returns integer language sql immutable set search_path=pg_catalog,ml_private as $$
 select case when ml_private.p3h_enabled(s) and s#>>array['players',a::text,'character']='character-034' then greatest(0,amount-1) else amount end
$$;
create or replace function ml_private.p3h_ren_back_cells(s jsonb,a integer,mover integer,anchor text) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare origin text:=s#>>array['players',mover::text,'cell'];before integer;cell text;actual text;direction text;result jsonb:='[]';begin
 if not ml_private.p3h_enabled(s) or not ml_private.stage4_on_board(s,a) or not ml_private.stage4_on_board(s,mover) or not ml_private.character_effect_allowed(jsonb_build_object('origin','role-locked','actor',a,'roleModifiers','[]'::jsonb),mover,s#>>array['players',mover::text,'character']) then return result;end if;
 before:=ml_private.distance_for_version(s->>'version',origin,anchor);foreach direction in array array['up','right','down','left'] loop cell:=ml_private.stage3_direction_cell(origin,direction);if cell is not null and ml_private.stage4_board_empty(s,mover,cell,jsonb_build_array(mover)) and ml_private.stage3_can_enter(s,mover,cell) then actual:=ml_private.playtest_relocation_cell(s,mover,origin,cell);if actual is not null and ml_private.distance_for_version(s->>'version',actual,anchor)>before then result:=result||jsonb_build_array(cell);end if;end if;end loop;return result;
end $$;
create or replace function ml_private.p3h_ren_expel_cells(s jsonb,a integer,target integer) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare origin text:=ml_private.region_at(s->>'version',s#>>array['players',a::text,'cell']);cell text;region text;actual text;result jsonb:='[]';begin
 if not ml_private.p3h_enabled(s) or s#>>array['players',a::text,'character']<>'character-034' or not ml_private.stage4_on_board(s,a) or not ml_private.stage4_on_board(s,target) or not ml_private.stage3_same_near(s#>>array['players',a::text,'cell'],s#>>array['players',target::text,'cell']) or not ml_private.p3h_active_allowed(s,a) or not ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',a,'roleModifiers','[]'::jsonb),target,s#>>array['players',target::text,'character']) then return result;end if;
 for cell in select key from jsonb_each(ml_private.game_data(s,'map')) order by key loop
  region:=ml_private.region_at(s->>'version',cell);if region=origin or ml_private.neighbor_for_version(s->>'version',origin,region) or not ml_private.stage4_board_empty(s,target,cell,jsonb_build_array(target)) or not ml_private.stage3_can_enter(s,target,cell) then continue;end if;
  actual:=ml_private.playtest_relocation_cell(s,target,s#>>array['players',target::text,'cell'],cell);if actual is null then continue;end if;region:=ml_private.region_at(s->>'version',actual);if region<>origin and not ml_private.neighbor_for_version(s->>'version',origin,region) then result:=result||jsonb_build_array(cell);end if;
 end loop;return result;
end $$;
create or replace function ml_private.p3h_ren_injuries(s jsonb,hits jsonb) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare h jsonb;a integer;target integer;src integer;jobs jsonb:='[]';begin
 if not ml_private.p3h_enabled(s) then return jobs;end if;
 for h in select v from ml_private.arr(hits) v loop target:=(h->>'target')::int;src:=(h->>'source')::int;if (h->>'loss')::int<=0 or not ml_private.stage4_on_board(s,target) then continue;end if;
  if s#>>array['players',target::text,'character']='character-034' and src is not null and src<>target and ml_private.stage4_on_board(s,src) then jobs:=jobs||jsonb_build_array(ml_private.stage3_task('h-ren-retreat',jsonb_build_object('actor',target,'target',src)));end if;
  for a in select (v#>>'{}')::int from ml_private.arr(s->'order') v loop if jsonb_array_length(ml_private.p3h_ren_expel_cells(s,a,target))>0 then jobs:=jobs||jsonb_build_array(ml_private.stage3_task('h-ren-expel',jsonb_build_object('actor',a,'target',target)));end if;end loop;
 end loop;return jobs;
end $$;
