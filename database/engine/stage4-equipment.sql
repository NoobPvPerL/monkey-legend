-- Shared lifecycle for replacement, theft, breakage and loss choices.
create or replace function ml_private.stage4_gear_snapshot(s jsonb,a integer,card text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ begin
 perform ml_private.need(s#>array['stage3','equipment',a::text] ? card,'装备已不在该玩家装备区');
 return jsonb_build_object('card',card,'definition',ml_private.stage4_equipment_definition(s,card),'effect',s#>array['stage3','equipmentSources',card])||case when s#>array['stage4','durability',card] is not null then jsonb_build_object('durability',s#>array['stage4','durability',card]) else '{}'::jsonb end;
end $$;
create or replace function ml_private.stage4_validate_equipment(s jsonb,cmd jsonb) returns void language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare a integer:=(cmd->>'actor')::int;card text:=cmd->>'card';definition text:=split_part(card,'#',1);options jsonb:=ml_private.stage3_equipment_options(s,a,card);owner integer;begin
 perform ml_private.need(options->>'allowed'='true' and (options->>'required'<>'true' or cmd ? 'replacement') and (not(cmd ? 'replacement') or options->'cards' ? (cmd->>'replacement')),'请先选择合法装备替换对象');
 perform ml_private.need(definition='basic-073' or not(cmd ? 'copy'),'只有Bob能复制坐骑');
 if definition='basic-073' then
  select (q->>'seat')::int into owner from ml_private.arr(s->'players') q where (q->>'seat')::int<>a and ml_private.stage4_on_board(s,(q->>'seat')::int) and s#>array['stage3','equipment',q->>'seat'] ? (cmd->>'copy') limit 1;
  perform ml_private.need(owner is not null and split_part(cmd->>'copy','#',1)<>'basic-073' and ml_private.rule_card(s,cmd->>'copy')->>'slot'='mount','Bob须指定他人已装备的非Bob坐骑');definition:=split_part(cmd->>'copy','#',1);
 end if;
 perform ml_private.need(definition not in ('basic-063','basic-064') or not ml_private.stage4_board_water(s,s#>>array['players',a::text,'cell'],a),'水中不能装备禁水坐骑');
end $$;
create or replace function ml_private.stage4_validate_steal(s jsonb,cmd jsonb) returns void language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare a integer:=(cmd->>'actor')::int;t integer:=(cmd#>>'{targets,0}')::int;options jsonb;begin
 perform ml_private.need(cmd->>'take' in ('hand','equipment'),'请选择拿手牌或装备');
 if cmd->>'take'='hand' then perform ml_private.need(not(cmd ? 'item') and not(cmd ? 'replacement'),'拿手牌不接受装备参数');return;end if;
 perform ml_private.need(jsonb_typeof(cmd->'item')='string' and s#>array['stage3','equipment',t::text] ? (cmd->>'item'),'请选择目标的一件公开装备');
 options:=ml_private.stage3_equipment_options(s,a,cmd->>'item');
 perform ml_private.need(options->>'allowed'<>'true' or (options->>'required'<>'true' or cmd ? 'replacement') and (not(cmd ? 'replacement') or options->'cards' ? (cmd->>'replacement')),'请明确被偷装备的替换对象');
 if options->>'allowed'<>'true' then perform ml_private.need(not(cmd ? 'replacement'),'同名装备只能拿入手牌');end if;
end $$;
create or replace function ml_private.stage4_gear_movement(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare double_move boolean;begin
 double_move:=ml_private.stage3_equipped(s,a,'basic-066') and s#>array['stage3','previousBasic',a::text]='false'::jsonb;double_move:=coalesce(double_move,false);
 s:=jsonb_set(s,array['stage3','doubleMove',a::text],to_jsonb(double_move));return jsonb_set(s,array['players',a::text,'moved'],to_jsonb((s#>>array['stage3','basicUsed',a::text])::int>=case when double_move then 2 else 1 end));
end $$;
create or replace function ml_private.stage4_gear_detach(s jsonb,a integer,g jsonb,discard boolean) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare card text:=g->>'card';begin
 if g->>'definition'='basic-069' then s:=jsonb_set(s,array['stage4','terrainIgnore',a::text],'false');end if;
 s:=jsonb_set(s,array['stage3','equipment',a::text],(s#>array['stage3','equipment',a::text])-card);
 s:=jsonb_set(s,'{stage3,equipmentSources}',(s#>'{stage3,equipmentSources}')-card);s:=jsonb_set(s,'{stage4,watches}',(s#>'{stage4,watches}')-card);s:=jsonb_set(s,'{stage4,copies}',(s#>'{stage4,copies}')-card);s:=jsonb_set(s,'{stage4,durability}',(s#>'{stage4,durability}')-card);
 if discard then s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(card));else s:=jsonb_set(s,'{resolving}',(s->'resolving')||jsonb_build_array(card));end if;return ml_private.stage4_gear_movement(s,a);
end $$;
create or replace function ml_private.stage4_can_install(s jsonb,a integer,g jsonb) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.stage4_on_board(s,a) and ml_private.stage3_equipment_options(s,a,g->>'card')->>'allowed'='true' and ml_private.stage3_equipment_options(s,a,g->>'card')->>'required'<>'true' and (g->>'definition' not in ('basic-063','basic-064') or not ml_private.stage4_board_water(s,s#>>array['players',a::text,'cell'],a)) $$;
create or replace function ml_private.stage4_gear_install(s jsonb,a integer,g jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare card text:=g->>'card';durability integer:=(g->>'durability')::int;begin
 s:=jsonb_set(s,'{resolving}',(s->'resolving')-card);s:=jsonb_set(s,array['stage3','equipment',a::text],(s#>array['stage3','equipment',a::text])||jsonb_build_array(card));
 s:=jsonb_set(s,array['stage3','equipmentSources',card],(g->'effect')||jsonb_build_object('actor',a,'faction',s#>array['players',a::text,'faction'],'origin','equipment'));
 if split_part(card,'#',1)<>g->>'definition' then s:=jsonb_set(s,array['stage4','copies',card],g->'definition');end if;
 durability:=coalesce(durability,case when g->>'definition'='basic-051' then 3 when g->>'definition'='basic-070' then 2 else null end);
 if g->>'definition'='basic-069' then s:=jsonb_set(s,array['stage4','terrainIgnore',a::text],'false');end if;
 if g->>'definition'='basic-060' then s:=jsonb_set(s,array['stage4','watches',card],jsonb_build_object('current',null,'previous',null,'usedTurn',null));end if;
 if durability is not null then s:=jsonb_set(s,array['stage4','durability',card],to_jsonb(durability));end if;s:=ml_private.stage4_gear_movement(s,a);
 return ml_private.emit(s,'equip','S'||(a+1)||' 装备'||(ml_private.rule_card(s,card)->>'name'));
end $$;
create or replace function ml_private.stage4_equipment_task(s jsonb,t jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$
declare action text:=t->>'action';a integer:=coalesce((t->>'actor')::int,(s->>'active')::int);c jsonb;g jsonb;old jsonb;effect jsonb;definition text;cells jsonb;targets jsonb;target integer;options jsonb;tasks jsonb:='[]';data jsonb;card text;idx text;i integer;hand jsonb;index integer;here jsonb;there jsonb;q jsonb;hits jsonb:='[]';begin
 if action='gear-end' then
  if not ml_private.stage4_on_board(s,a) then return s||jsonb_build_object('_gearHandled',true);end if;here:=ml_private.game_data(s,'map')->(s#>>array['players',a::text,'cell']);
  for card in select v#>>'{}' from ml_private.arr(s#>array['stage3','equipment',a::text]) v loop
   definition:=ml_private.stage4_equipment_definition(s,card);effect:=(s#>array['stage3','equipmentSources',card])||jsonb_build_object('origin','equipment');
   if definition not in ('basic-050','basic-064') or definition='basic-050' and here->>'region'='教学楼' then continue;end if;
   for q in select * from ml_private.arr(s->'players') loop target:=(q->>'seat')::int;there:=ml_private.game_data(s,'map')->(q->>'cell');
    if target=a or not ml_private.stage4_on_board(s,target) or s->>'mode'='team' and q->'team'=s#>array['players',a::text,'team'] or not ml_private.stage3_card_allowed(s,target,definition,effect) then continue;end if;
    if (case when definition='basic-050' then here->'region'=there->'region' else (here->'row'=there->'row' or here->'col'=there->'col') and not ml_private.stage3_equipped(s,target,'basic-063') end) then hits:=hits||jsonb_build_array(jsonb_build_object('target',target,'amount',1,'source',a,'category','response'));end if;
   end loop;
  end loop;s:=ml_private.damage(s,hits);s:=ml_private.stage3_prepend(s,s->'_triggers');return (s-'_triggers')||jsonb_build_object('_gearHandled',true);
 elsif action='gear-loss' then
  g:=t->'data';definition:=g->>'definition';effect:=(g->'effect')||jsonb_build_object('origin','equipment');
  if not ml_private.stage4_on_board(s,a) or not ml_private.stage3_card_allowed(s,a,g->>'card',effect) then return s||jsonb_build_object('_gearHandled',true);end if;
  if definition='basic-063' then select coalesce(jsonb_agg(v->'id' order by ord),'[]') into cells from jsonb_array_elements(ml_private.game_data(s,'cells')) with ordinality q(v,ord) where v->>'region'='山洞' and ml_private.stage4_board_empty(s,a,v->>'id',jsonb_build_array(a));end if;
  if definition='basic-052' then select coalesce(jsonb_agg(v->'seat' order by ord),'[]') into targets from jsonb_array_elements(s->'players') with ordinality q(v,ord) where (v->>'seat')::int<>a and ml_private.stage4_on_board(s,(v->>'seat')::int) and ml_private.stage3_card_allowed(s,(v->>'seat')::int,g->>'card',effect);end if;
  if definition in ('basic-054','basic-059') or jsonb_array_length(cells)>0 or jsonb_array_length(targets)>0 then s:=ml_private.select_choice(s,'gear-loss',a,at,jsonb_build_object('data',g)||case when cells is not null then jsonb_build_object('cells',cells) else '{}'::jsonb end||case when targets is not null then jsonb_build_object('targets',targets) else '{}'::jsonb end);end if;
  return s||jsonb_build_object('_gearHandled',true);
 elsif action='gear-transfer-install' then
  data:=t->'data';g:=data->'gear';
  if data ? 'replacement' and coalesce(data->>'replaced','false')<>'true' then options:=ml_private.stage3_equipment_options(s,a,g->>'card');
   if ml_private.stage4_on_board(s,a) and options->>'allowed'='true' and options->'cards' ? (data->>'replacement') then
    old:=ml_private.stage4_gear_snapshot(s,a,data->>'replacement');s:=ml_private.stage4_gear_detach(s,a,old,true);
    s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('gear-loss',jsonb_build_object('actor',a,'data',old)),ml_private.stage3_task('gear-transfer-install',jsonb_build_object('actor',a,'data',data||jsonb_build_object('replaced',true)))));return s||jsonb_build_object('_gearHandled',true);
   end if;
  end if;
  if ml_private.stage4_can_install(s,a,g) then s:=ml_private.stage4_gear_install(s,a,g);
  else s:=jsonb_set(s,'{resolving}',(s->'resolving')-(g->>'card'));if ml_private.stage3_alive(s,a) then s:=jsonb_set(s,array['players',a::text,'hand'],(s#>array['players',a::text,'hand'])||jsonb_build_array(g->'card'));else s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(g->'card'));end if;s:=ml_private.emit(s,'transfer','S'||(a+1)||' 装配条件失效，装备转入'||case when ml_private.stage3_alive(s,a) then '手牌' else '弃牌堆' end);end if;
  return s||jsonb_build_object('_gearHandled',true);
 end if;
 if action='equip-install' then
  c:=s#>'{cardStack,stack,-1}';a:=(c->>'actor')::int;idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;
  if ml_private.stage4_on_board(s,a) then
   g:=jsonb_build_object('card',c->'card','definition',coalesce(c#>>'{stage4,copy}',split_part(c->>'card','#',1)),'effect',c->'effect');
   if ml_private.stage4_can_install(s,a,g) then s:=ml_private.stage4_gear_install(s,a,g);else s:=jsonb_set(s,'{resolving}',(s->'resolving')-(g->>'card'));s:=jsonb_set(s,array['players',a::text,'hand'],(s#>array['players',a::text,'hand'])||jsonb_build_array(g->'card'));end if;s:=jsonb_set(s,array['cardStack','stack',idx,'installed'],'true');
  end if;return s||jsonb_build_object('_gearHandled',true);
 end if;
 if action<>'effect' then return s||jsonb_build_object('_gearHandled',false);end if;
 c:=s#>'{cardStack,stack,-1}';a:=(c->>'actor')::int;definition:=c->>'definition';
 if definition='basic-024' then
  s:=ml_private.stage3_record_combo(s,a,definition);select (v#>>'{}')::int into target from ml_private.arr(ml_private.stage4_map_targets(s,c)) v limit 1;
  if target is not null then
   if c#>>'{stage4,take}'='hand' then
    for i in 1..2 loop hand:=s#>array['players',target::text,'hand'];exit when jsonb_array_length(hand)=0;s:=ml_private.int(s,jsonb_array_length(hand));index:=(s->>'_int')::int;s:=s-'_int';card:=hand->>index;s:=jsonb_set(s,array['players',target::text,'hand'],hand-index);s:=jsonb_set(s,array['players',a::text,'hand'],(s#>array['players',a::text,'hand'])||jsonb_build_array(card));end loop;s:=ml_private.emit(s,'transfer','S'||(a+1)||' 转学手册随机拿取手牌');
   elsif s#>array['stage3','equipment',target::text] ? (c#>>'{stage4,item}') then
    g:=ml_private.stage4_gear_snapshot(s,target,c#>>'{stage4,item}');s:=ml_private.stage4_gear_detach(s,target,g,false);tasks:=jsonb_build_array(ml_private.stage3_task('gear-loss',jsonb_build_object('actor',target,'data',g)),ml_private.stage3_task('gear-transfer-install',jsonb_build_object('actor',a,'data',jsonb_build_object('gear',g)||case when c ? 'replacement' then jsonb_build_object('replacement',c->'replacement') else '{}'::jsonb end)));s:=ml_private.emit(s,'transfer','S'||(a+1)||' 转学手册拿取公开装备');
   end if;
  end if;s:=ml_private.stage3_prepend(s,tasks||jsonb_build_array(ml_private.stage3_task('cleanup',jsonb_build_object('serial',c->'serial'))));return s||jsonb_build_object('_gearHandled',true);
 end if;
 if ml_private.rule_card(s,c->>'card')->>'type'<>'equipment' or coalesce(c->>'converted','false')='true' then return s||jsonb_build_object('_gearHandled',false);end if;
 s:=ml_private.stage3_record_combo(s,a,definition);
 if ml_private.stage4_on_board(s,a) and ml_private.stage3_card_allowed(s,a,definition,c->'effect') then
  if c ? 'replacement' and s#>array['stage3','equipment',a::text] ? (c->>'replacement') then g:=ml_private.stage4_gear_snapshot(s,a,c->>'replacement');s:=ml_private.stage4_gear_detach(s,a,g,true);tasks:=tasks||jsonb_build_array(ml_private.stage3_task('gear-loss',jsonb_build_object('actor',a,'data',g)));end if;tasks:=tasks||jsonb_build_array(ml_private.stage3_task('equip-install',jsonb_build_object('serial',c->'serial')));
 end if;s:=ml_private.stage3_prepend(s,tasks||jsonb_build_array(ml_private.stage3_task('cleanup',jsonb_build_object('serial',c->'serial'))));return s||jsonb_build_object('_gearHandled',true);
end $$;
create or replace function ml_private.stage4_gear_loss_choose(s jsonb,cmd jsonb,at double precision,timeout boolean) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s->'choice';a integer:=(c->>'actor')::int;g jsonb:=c->'data';definition text:=g->>'definition';cell text:=cmd->>'cell';target integer:=(cmd->>'target')::int;begin
 if timeout or not ml_private.stage4_on_board(s,a) then return s;end if;
 if cmd->>'accept'='true' and definition='basic-054' then s:=ml_private.heal(s,a,2);
 elsif cmd->>'accept'='true' and definition='basic-059' then s:=ml_private.heal(s,a,1);
 elsif cell is not null and definition='basic-063' then perform ml_private.need(c->'cells' ? cell and ml_private.stage4_board_empty(s,a,cell,jsonb_build_array(a)),'山洞落点不合法');s:=ml_private.stage3_relocate(s,a,cell,true);s:=ml_private.stage3_prepend(s,s->'_relocationTasks');s:=s-'_relocationTasks';
 elsif target is not null and definition='basic-052' then perform ml_private.need(c->'targets' @> jsonb_build_array(target) and ml_private.stage4_on_board(s,target),'粉笔失去目标不合法');s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',target,'amount',1,'source',a,'category','response')));s:=ml_private.stage3_prepend(s,s->'_triggers');s:=s-'_triggers';end if;return s;
end $$;
