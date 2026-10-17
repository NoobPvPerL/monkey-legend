-- Stage-four development dispatcher extensions. Installed only in local tests
-- until all milestones are promoted by the final numbered release migration.
create or replace function ml_private.stage4_initial(players jsonb) returns jsonb language sql immutable as $$
 select jsonb_build_object('buffSources','{}'::jsonb,'terrainIgnore','[false,false,false,false]'::jsonb,'watches','{}'::jsonb,'gearMarks','{}'::jsonb,'tongPending','{}'::jsonb,'tongBlocked','{}'::jsonb,'copies','{}'::jsonb,'durability','{}'::jsonb,'costs',jsonb_build_object('turn',0,'locks','{}'::jsonb),
 'tea',jsonb_build_array(false,false,false,false),'dodge',jsonb_build_array(false,false,false,false),
 'exerciseFree',jsonb_build_array(false,false,false,false),'exerciseGuard',jsonb_build_array(false,false,false,false),
 'downPending',jsonb_build_array(false,false,false,false),'drawBlocked',jsonb_build_array(false,false,false,false),
 'interrupts','[]'::jsonb,'interruptTurn',null,'interruptSkipEnd',false,'offMap',jsonb_build_array(false,false,false,false),'toiletUntil',jsonb_build_array(null,null,null,null),'lmmUntil',jsonb_build_array(null,null,null,null),'toiletEffects','{}'::jsonb,'lmmEffects','{}'::jsonb,'lmmSerial',jsonb_build_array(0,0,0,0),'water','{}'::jsonb,'deserts','{}'::jsonb,'blocks','[]'::jsonb,
 'baseFactions',(select jsonb_agg(p->'faction' order by ord) from jsonb_array_elements(players) with ordinality q(p,ord)),
 'conversion',jsonb_build_array(null,null,null,null),'baseTeams',(select jsonb_agg(p->'team' order by ord) from jsonb_array_elements(players) with ordinality q(p,ord))) $$;

create or replace function ml_private.stage3_turn_start(s jsonb,a integer) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare gear text;prior jsonb;begin
 s:=ml_private.stage3_turn_start_before_stage4(s,a);
 if s->>'version'='web-v0.1.7' then
  for gear in select v#>>'{}' from ml_private.arr(s#>array['stage3','equipment',a::text]) v loop if ml_private.stage4_equipment_definition(s,gear)='basic-060' then prior:=s#>array['stage4','watches',gear];s:=jsonb_set(s,array['stage4','watches',gear],jsonb_build_object('current',s#>array['players',a::text,'cell'],'previous',prior->'current','usedTurn',null));end if;end loop;
  s:=jsonb_set(s,'{stage4,gearMarks}','{}');s:=jsonb_set(s,'{stage4,tongBlocked}',(s#>'{stage4,tongBlocked}')-a::text);if s#>array['stage4','tongPending',a::text] is not null then s:=jsonb_set(s,array['stage4','tongBlocked',a::text],s#>array['stage4','tongPending',a::text]);end if;s:=jsonb_set(s,'{stage4,tongPending}',(s#>'{stage4,tongPending}')-a::text);
  s:=jsonb_set(s,'{stage4,costs}',ml_private.stage4_cost_turn(s#>'{stage4,costs}',(s#>>'{stage3,turn}')::bigint));
  s:=jsonb_set(s,array['stage4','drawBlocked',a::text],s#>array['stage4','downPending',a::text]);
  s:=jsonb_set(s,array['stage4','downPending',a::text],'false');s:=ml_private.stage4_expire_board(s,a);
 end if;return s;
end $$;

create or replace function ml_private.stage3_damage(s jsonb,hits jsonb,environment boolean default false,skip_pursuit boolean default false)
returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$ begin
 if s->>'version'='web-v0.1.7' then
  select coalesce(jsonb_agg(case when (not environment and s#>>array['players',h->>'target','character']='character-037') or ml_private.stage3_equipped(s,(h->>'target')::int,'basic-059') then h||jsonb_build_object('amount',least(1,(h->>'amount')::int)) else h end order by ord),'[]') into hits
  from jsonb_array_elements(hits) with ordinality q(h,ord) where ml_private.stage4_on_board(s,(h->>'target')::int);
 end if;return ml_private.stage3_damage_before_stage4(s,hits,environment,skip_pursuit);
end $$;

create or replace function ml_private.stage4_quote(s jsonb,a integer,card text) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare roll integer;result jsonb;begin
 perform ml_private.need(s#>array['players',a::text,'hand'] ? card,'手中没有该实体牌');
 if ml_private.stage4_cost_needs_roll(s#>'{stage4,costs}',card) then
  if jsonb_array_length(s#>'{random,dice}')>0 then roll:=(s#>>'{random,dice,0}')::integer;s:=jsonb_set(s,'{random,dice}',(s#>'{random,dice}')-0);
  else s:=ml_private.int(s,6);roll:=(s->>'_int')::integer+1;s:=s-'_int';end if;
 end if;
 result:=ml_private.stage4_cost_quote(s#>'{stage4,costs}',a,card,s#>array['players',a::text,'hand'],roll);
 s:=jsonb_set(s,'{stage4,costs}',result->'ledger');
 if result#>'{quote,die}'<>'null'::jsonb then s:=jsonb_set(s,array['stage3','costLocks',card],jsonb_build_object('turn',s#>'{stage3,turn}','cost',result#>'{quote,cost}'));end if;return s;
end $$;

create or replace function ml_private.stage3_skill(s jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ begin
 if s->>'version'='web-v0.1.7' and cmd->>'kind' in ('watch','flight','gift','terrain') then s:=ml_private.stage4_equipment_skill(s,cmd,at);return s-'_equipmentSkill';end if;
 if s->>'version'='web-v0.1.7' and cmd->>'kind'='quote-cost' then return ml_private.stage4_quote(s,(cmd->>'actor')::int,cmd->>'card');end if;
 return ml_private.stage3_skill_before_stage4(s,cmd,at);
end $$;

create or replace function ml_private.stage4_targets(s jsonb,a integer,card text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$
 select case when split_part(card,'#',1)='basic-007' then ml_private.targets(s,a,card) else (select coalesce(jsonb_agg(p->'seat' order by ord),'[]') from jsonb_array_elements(s->'players') with ordinality q(p,ord)
 where ml_private.stage4_on_board(s,(p->>'seat')::int) and (split_part(card,'#',1) in ('basic-029','basic-030','basic-035','basic-036') or (p->>'seat')::int<>a) and
 (split_part(card,'#',1)<>'basic-035' or s#>>array['stage4','conversion',p->>'seat']='monkey') and (split_part(card,'#',1)<>'basic-036' or s#>>array['stage4','conversion',p->>'seat']='dimon') and ml_private.stage4_location_card(s,a,split_part(card,'#',1))
 and (split_part(card,'#',1)<>'basic-007' or s->>'mode'='ffa' or p->'team'<>s#>array['players',a::text,'team'])
 and (split_part(card,'#',1)<>'basic-018' or ml_private.game_data(s,'map')#>>array[p->>'cell','region']<>'云上学府')
 and (split_part(card,'#',1) not in ('basic-007','basic-019') or ml_private.game_data(s,'map')#>>array[p->>'cell','region']=ml_private.game_data(s,'map')#>>array[s#>>array['players',a::text,'cell'],'region']
 or ml_private.neighbor_for_version(s->>'version',ml_private.game_data(s,'map')#>>array[p->>'cell','region'],ml_private.game_data(s,'map')#>>array[s#>>array['players',a::text,'cell'],'region']))) end $$;

create or replace function ml_private.stage3_play(s jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$
declare a integer:=(cmd->>'actor')::int;p jsonb:=s->'players'->a;card text:=cmd->>'card';definition text:=split_part(card,'#',1);
 d jsonb;tea boolean;free boolean;targets jsonb:=cmd->'targets';cells jsonb;raw integer;quoted jsonb;effect jsonb;exposed jsonb;fee jsonb;pending jsonb;idx text;begin
 if s->>'version'<>'web-v0.1.7' then return ml_private.stage3_play_before_stage4(s,cmd,at);end if;
 d:=ml_private.stage4_content()#>array['cards',definition];
 perform ml_private.need(d is not null and p->'hand' ? card,'手中没有该实体牌');
 perform ml_private.need(s#>>array['stage3','breadBlocked',a::text]<>'true','本回合不能主动出牌');
 tea:=definition='basic-002' and not(cmd ? 'as') and s#>>array['stage4','tea',a::text]='true';
 if not(cmd ? 'as') and d->>'type'='equipment' then perform ml_private.stage4_validate_equipment(s,cmd);end if;
 if d->>'inherited'='true' and not tea or cmd->>'as'='elbow' then
  free:=not(cmd ? 'as') and definition in ('basic-003','basic-004','basic-005') and s#>>array['stage4','exerciseFree',a::text]='true';
  -- Cost override is an internal flag consumed by the generated frozen delegate.
  if free then s:=s||jsonb_build_object('_stage4Free',true);end if;
  s:=ml_private.stage3_play_before_stage4(s,cmd,at);s:=s-'_stage4Free';
  if free then s:=jsonb_set(s,array['stage4','exerciseFree',a::text],'false');end if;
  if not(cmd ? 'as') and definition='basic-009' and s#>>array['stage4','dodge',a::text]='true' then
   idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;s:=jsonb_set(s,array['cardStack','stack',idx,'stage4'],jsonb_build_object('dodge',true));s:=jsonb_set(s,array['cardStack','stack',idx,'effect','roleModifiers'],(s#>array['cardStack','stack',idx,'effect','roleModifiers'])||coalesce(s#>array['stage4','buffSources',a||':dodge','roleModifiers'],'[]'));s:=jsonb_set(s,array['stage4','dodge',a::text],'false');
  end if;idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;s:=jsonb_set(s,array['cardStack','stack',idx,'stage4'],coalesce(s#>array['cardStack','stack',idx,'stage4'],'{}')||jsonb_build_object('officeExempt',(select coalesce(jsonb_agg(v->'seat' order by ord),'[]') from jsonb_array_elements(s->'players') with ordinality q(v,ord) where not ml_private.stage4_location_effect(s,(v->>'seat')::int,s#>>array['cardStack','stack',idx,'definition']))));return s;
 end if;
 perform ml_private.need(tea or d->>'type'='equipment' or definition in ('basic-024','basic-007','basic-011','basic-012','basic-014','basic-018','basic-019','basic-022','basic-025','basic-029','basic-030','basic-035','basic-036','basic-040','basic-042','basic-043','basic-044','basic-048','basic-013','basic-020','basic-021','basic-023','basic-026','basic-031','basic-032','basic-033','basic-034'),'该牌的阶段四里程碑尚未接通');
 perform ml_private.need(not(cmd ? 'as'),'转换请按牢大肘击流程');
 perform ml_private.need(p->>'character'<>'character-005' or not(d->'tags' ? '建民'),'QB不能使用建民牌');
 perform ml_private.need(ml_private.stage4_location_card(s,a,definition),'当前位置禁止使用此牌');
 perform ml_private.need((select count(distinct x) from ml_private.arr(targets) x)=jsonb_array_length(targets),'目标不能重复');
 if tea then
  perform ml_private.need(jsonb_array_length(targets)=1 and exists(select 1 from ml_private.arr(s->'players') v where v->'seat'=targets->0 and (v->>'seat')::int<>a and ml_private.stage4_on_board(s,(v->>'seat')::int) and not ml_private.stage4_single_protected(s,a,(v->>'seat')::int) and ml_private.game_data(s,'map')#>>array[v->>'cell','region']=ml_private.game_data(s,'map')#>>array[p->>'cell','region']),'冰红茶肘击须指定同地区其他角色');
  cells:=ml_private.stage3_elbow_cells(ml_private.stage3_board(s),a,(targets->>0)::int);
  perform ml_private.need(jsonb_array_length(cells)=0 or (cmd ? 'direction') and cells ? ml_private.stage3_direction_cell(s#>>array['players',targets->>0,'cell'],cmd->>'direction'),'请先指定合法撞飞方向');
 elsif definition in ('basic-007','basic-018','basic-019','basic-022','basic-029','basic-030','basic-035','basic-036','basic-021','basic-024') then
  perform ml_private.need(jsonb_array_length(targets)=1 and ml_private.stage4_targets(s,a,card) @> targets,'目标不合法');
 else
  perform ml_private.need(targets='[]'::jsonb,'此牌不接受外部目标');
  if definition in ('basic-011','basic-012','basic-014','basic-013','basic-031','basic-026') then select coalesce(jsonb_agg(v->'seat' order by ord),'[]') into targets from jsonb_array_elements(s->'players') with ordinality q(v,ord) where ml_private.stage4_on_board(s,(v->>'seat')::int) and (definition not in ('basic-013','basic-031','basic-026') or (v->>'seat')::int<>a) and (definition<>'basic-026' or s->>'mode'='ffa' or v->'team'<>p->'team') and not(v->>'character'='character-027' and jsonb_array_length(v->'hand')=1);elsif definition='basic-040' then select coalesce(jsonb_agg(v->'seat' order by ord),'[]') into targets from jsonb_array_elements(s->'players') with ordinality q(v,ord) where (v->>'hp')::int>0 and v->>'faction'='帝汶家族';else targets:=jsonb_build_array(a);end if;
 end if;
 if definition='basic-024' then perform ml_private.stage4_validate_steal(s,cmd);end if;
 if definition in ('basic-023','basic-032','basic-033') then perform ml_private.need(jsonb_typeof(cmd->'region')='string' and ml_private.version_catalog(s->>'version')#>'{mapDefinition,regions}' ? (cmd->>'region'),'请选择合法地区');end if;
 if tea then raw:=0;
 elsif d#>>'{cost,kind}'='variable' then
  perform ml_private.need(jsonb_typeof(cmd->'x')='number' and (cmd->>'x')::numeric=trunc((cmd->>'x')::numeric),'X必须为正整数');
  raw:=(ml_private.stage4_cost_quote(s#>'{stage4,costs}',a,card,p->'hand',null,(cmd->>'x')::bigint)#>>'{quote,cost}')::int;
 elsif d#>>'{cost,kind}'='fixed' then raw:=(d#>>'{cost,value}')::int;
 else raw:=(s#>>array['stage4','costs','locks',card,'cost'])::int;end if;
 perform ml_private.need(raw is not null,'请先锁定随机费用');
 if tea or d#>>'{cost,kind}'='variable' then quoted:=jsonb_build_object('cost',raw,'effect',jsonb_build_object('origin','card','actor',a,'faction',p->'faction','roleModifiers',case when tea then coalesce(s#>array['stage4','buffSources',a||':tea','roleModifiers'],'[]')||case when p->>'character'='character-023' then jsonb_build_array(jsonb_build_object('actor',a,'kind','other')) else '[]'::jsonb end else '[]'::jsonb end));
 else quoted:=ml_private.stage3_card_cost(s,a,card,raw);end if;
 fee:=ml_private.stage4_fee_plan((p->>'ap')::int,(quoted->>'cost')::int,false,d#>>'{cost,kind}'='variable');
 exposed:=ml_private.stage3_jj_targets(s,a,card,targets,ml_private.stage4_attack_effect(s,a,card,quoted->'effect'));
 p:=p||jsonb_build_object('ap',(p->>'ap')::int-(fee->>'spend')::int,'hand',(p->'hand')-card);if d->>'type'='attack' or tea then p:=p||jsonb_build_object('attacks',(p->>'attacks')::int+1);end if;s:=ml_private.put_player(s,a,p);
 if (fee->>'gain')::int>0 then s:=ml_private.stage3_gain_ap(s,a,(fee->>'gain')::int);s:=s-'_gain';end if;
 s:=s||jsonb_build_object('resolving',(s->'resolving')||jsonb_build_array(card),'clock',jsonb_build_object('remaining',60000,'since',at));
 s:=ml_private.stage3_begin_card(s,a,card,definition,exposed->'targets',exposed->'effect',at);idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;pending:=s#>array['cardStack','stack',idx];
 pending:=pending||jsonb_build_object('stage4',jsonb_build_object('officeExempt',(select coalesce(jsonb_agg(v->'seat' order by ord),'[]') from jsonb_array_elements(s->'players') with ordinality q(v,ord) where not ml_private.stage4_location_effect(s,(v->>'seat')::int,definition)))||case when d#>>'{cost,kind}'='variable' then jsonb_build_object('x',raw) else '{}'::jsonb end||case when cmd ? 'region' then jsonb_build_object('region',cmd->'region') else '{}'::jsonb end);
 if cmd ? 'replacement' then pending:=pending||jsonb_build_object('replacement',cmd->'replacement');end if;
 if definition='basic-024' then pending:=jsonb_set(pending,'{stage4}',(pending->'stage4')||jsonb_build_object('take',cmd->'take')||case when cmd ? 'item' then jsonb_build_object('item',cmd->'item') else '{}'::jsonb end);end if;
 if definition='basic-073' then pending:=jsonb_set(pending,'{stage4,copy}',to_jsonb(split_part(cmd->>'copy','#',1)));pending:=jsonb_set(pending,'{effect,roleModifiers}',(pending#>'{effect,roleModifiers}')||(s#>array['stage3','equipmentSources',cmd->>'copy','roleModifiers']));end if;
 if tea then if cmd ? 'direction' then pending:=pending||jsonb_build_object('pushDirection',cmd->'direction');end if;s:=jsonb_set(s,array['stage4','tea',a::text],'false');end if;
 s:=jsonb_set(s,array['cardStack','stack',idx],pending);
 s:=ml_private.emit(s,'play','S'||(a+1)||' 使用'||(d->>'name')||'，支付'||(fee->>'spend')||'AP'||case when (fee->>'gain')::int>0 then '，获得'||(fee->>'gain')||'AP' else '' end,jsonb_build_object('actor',a,'card',card,'targets',exposed->'targets'));
 s:=jsonb_set(s,'{phase}','"resolving"');return ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('counter',jsonb_build_object('serial',pending->'serial')),ml_private.stage3_task('continue',jsonb_build_object('serial',pending->'serial'))));
end $$;

create or replace function ml_private.stage3_handle_task(s jsonb,t jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s#>'{cardStack,stack,-1}';definition text:=c->>'definition';d jsonb;targets jsonb;exercise boolean;target integer;paid integer;power integer;amount integer;hits jsonb:='[]';after_tasks jsonb:='[]';begin
 if s->>'version'='web-v0.1.7' then s:=ml_private.stage4_movement_task(s,t,at);if s->>'_movementHandled'='true' then return s-'_movementHandled';end if;s:=s-'_movementHandled';s:=ml_private.stage4_combat_task(s,t,at);if s->>'_combatHandled'='true' then return s-'_combatHandled';end if;s:=s-'_combatHandled';s:=ml_private.stage4_equipment_task(s,t,at);if s->>'_gearHandled'='true' then return s-'_gearHandled';end if;s:=s-'_gearHandled';s:=ml_private.stage4_counter_task(s,t,at);if s->>'_stage4Handled'='true' then return s-'_stage4Handled';end if;s:=s-'_stage4Handled';s:=ml_private.stage4_interrupt_task(s,t,at);if s->>'_interruptHandled'='true' then return s-'_interruptHandled';end if;s:=s-'_interruptHandled';s:=ml_private.stage4_map_task(s,t,at);if s->>'_boardHandled'='true' then return s-'_boardHandled';end if;s:=s-'_boardHandled';end if;
 if s->>'version'<>'web-v0.1.7' or t->>'action'<>'effect' then return ml_private.stage3_handle_task_before_stage4(s,t,at);end if;
 exercise:=definition in ('basic-003','basic-004','basic-005') and exists(select 1 from ml_private.arr(c->'targets') v where s#>>array['stage4','exerciseGuard',v#>>'{}']='true');
 if definition not in ('basic-007','basic-011','basic-012','basic-014','basic-018','basic-019','basic-022','basic-025','basic-029','basic-030','basic-035','basic-036','basic-040','basic-042','basic-043','basic-044','basic-048','basic-013','basic-020','basic-021','basic-023','basic-026','basic-031','basic-032','basic-033','basic-034') and not(definition='basic-009' and c#>>'{stage4,dodge}'='true') and not exercise then return ml_private.stage3_handle_task_before_stage4(s,t,at);end if;
 d:=ml_private.stage4_content()#>array['cards',definition];s:=ml_private.stage3_record_combo(s,(c->>'actor')::int,definition);targets:=ml_private.stage3_available_targets(s,c);
 for target in select (v#>>'{}')::int from ml_private.arr(targets) v loop
  if definition in ('basic-011','basic-012','basic-014') then null;
  elsif definition='basic-007' then hits:=hits||jsonb_build_array(jsonb_build_object('target',target,'amount',case when s#>>array['players',target::text,'character']='character-037' then 3 else 2 end,'source',c->'actor','category','attack'));
  elsif definition='basic-009' then hits:=hits||jsonb_build_array(jsonb_build_object('target',target,'amount',2,'source',c->'actor','category','attack'));
  elsif exercise then
   if s#>>array['stage4','exerciseGuard',target::text]='true' then s:=jsonb_set(s,array['stage4','exerciseGuard',target::text],'false');s:=ml_private.emit(s,'buff','S'||(target+1)||' 农夫三拳免本次搏击操AP扣减');
   else power:=(ml_private.rule_card(s,c->>'card')->>'power')::int;paid:=least((s#>>array['players',target::text,'ap'])::int,power);s:=jsonb_set(s,array['players',target::text,'ap'],to_jsonb((s#>>array['players',target::text,'ap'])::int-paid));
    if paid<power then hits:=hits||jsonb_build_array(jsonb_build_object('target',target,'amount',power-paid,'source',c->'actor','category','attack'));end if;end if;
  elsif definition='basic-018' then s:=jsonb_set(s,array['stage4','downPending',target::text],'true');s:=jsonb_set(s,array['stage3','coffeeRound',target::text],'true');s:=jsonb_set(s,array['stage3','coffeeUntilStart',target::text],to_jsonb((s#>>array['stage3','starts',target::text])::int+1));
  elsif definition='basic-019' then amount:=least(2,(s#>>array['players',target::text,'ap'])::int);s:=jsonb_set(s,array['players',target::text,'ap'],to_jsonb((s#>>array['players',target::text,'ap'])::int-amount));s:=ml_private.stage3_gain_ap(s,(c->>'actor')::int,amount);s:=ml_private.emit(s-'_gain','ap','借我张纸拿取'||amount||'AP');
  elsif definition='basic-022' then s:=jsonb_set(s,array['stage3','breadPending',target::text],'true');
  elsif definition='basic-025' then s:=ml_private.draw(s,target,coalesce((c#>>'{stage4,x}')::int,0));
  elsif definition in ('basic-029','basic-030','basic-035','basic-036') then s:=ml_private.stage4_change_faction(s,target,case when definition='basic-029' then 'monkey' when definition='basic-030' then 'dimon' else null end);s:=ml_private.emit(s,'faction','S'||(target+1)||' 当前归属：'||(s#>>array['players',target::text,'faction'])||case when s->>'mode'='team' then '／'||(s#>>array['players',target::text,'team'])||'队' else '' end);
  elsif definition='basic-048' then s:=ml_private.die(s,'油泼');amount:=(s->>'_roll')::int;s:=s-'_roll';
   if amount=6 then s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',target,'amount',1,'source',c->'actor','category','attack')));after_tasks:=after_tasks||(s->'_triggers');s:=s-'_triggers';
   else s:=ml_private.heal(s,target,(s#>>array['players',target::text,'maxHp'])::int-(s#>>array['players',target::text,'hp'])::int,true);end if;
  else s:=ml_private.heal(s,target,case when definition='basic-040' and s#>>array['players',target::text,'character']='character-040' then (s#>>array['players',target::text,'maxHp'])::int-(s#>>array['players',target::text,'hp'])::int else 1 end,true);
   if definition='basic-042' then s:=jsonb_set(s,array['stage4','buffSources',target||':tea'],c->'effect');s:=jsonb_set(s,array['stage4','tea',target::text],'true');end if;
   if definition='basic-043' then s:=jsonb_set(s,array['stage4','buffSources',target||':dodge'],c->'effect');s:=jsonb_set(s,array['stage4','dodge',target::text],'true');end if;
   if definition='basic-044' then s:=jsonb_set(s,array['stage4','buffSources',target||':exerciseFree'],c->'effect');s:=jsonb_set(s,array['stage4','exerciseFree',target::text],'true');s:=jsonb_set(s,array['stage4','exerciseGuard',target::text],'true');end if;
  end if;
 end loop;
 if definition in ('basic-007','basic-009') or exercise then s:=ml_private.damage(s,hits);after_tasks:=after_tasks||(s->'_triggers');s:=s-'_triggers';end if;
 if definition in ('basic-011','basic-012','basic-014') then for target in select (x#>>'{}')::int from ml_private.arr(s->'order') x where targets @> jsonb_build_array(x) loop after_tasks:=after_tasks||jsonb_build_array(ml_private.stage3_task('stage4-deliver',jsonb_build_object('actor',target,'serial',c->'serial')));end loop;end if;
 s:=ml_private.emit(s,'effect',(d->>'name')||'结算');return ml_private.stage3_prepend(s,after_tasks||jsonb_build_array(ml_private.stage3_task('cleanup',jsonb_build_object('serial',c->'serial'))));
end $$;

create or replace function ml_private.stage4_change_faction(s jsonb,target integer,kind text) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ begin
 perform ml_private.need(s ? 'stage4' and ml_private.stage3_alive(s,target),'阵营变更目标无效');
 s:=jsonb_set(s,array['stage4','conversion',target::text],coalesce(to_jsonb(kind),'null'::jsonb));
 s:=jsonb_set(s,array['players',target::text,'faction'],case when kind is null then s#>array['stage4','baseFactions',target::text] else to_jsonb(case when kind='monkey' then '机械猴子' else '帝汶家族' end) end);
 if s->>'mode'='team' then s:=jsonb_set(s,array['players',target::text,'team'],case when kind is null then s#>array['stage4','baseTeams',target::text] else to_jsonb(case when kind='monkey' then 'A' else 'B' end) end);end if;return s;
end $$;
