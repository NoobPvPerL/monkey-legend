create or replace function ml_private.stage4_arrival_tasks(s jsonb,a integer,origin text,cell text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select case when ml_private.game_data(s,'map')#>>array[origin,'region'] is distinct from ml_private.game_data(s,'map')#>>array[cell,'region'] and ml_private.stage4_desert(s,a) is not null then jsonb_build_array(ml_private.stage3_task('board-desert',jsonb_build_object('actor',a))) else '[]'::jsonb end||ml_private.stage4_reactive_arrival(s,a,origin,cell) $$;
create or replace function ml_private.stage4_return(s jsonb,a integer,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare cells jsonb;begin
 select coalesce(jsonb_agg(c->'id' order by ord),'[]') into cells from jsonb_array_elements(ml_private.game_data(s,'cells')) with ordinality q(c,ord) where ml_private.stage4_board_empty(s,a,c->>'id',jsonb_build_array(a));
 if jsonb_array_length(cells)>0 then return ml_private.select_choice(s,'board-return',a,at,jsonb_build_object('cells',cells));end if;
 return jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','next'))||(select coalesce(jsonb_agg(t order by ord),'[]') from jsonb_array_elements(s->'queue') with ordinality q(t,ord) where not(t->>'kind'='turn-start' and (t->>'actor')::int=a)));
end $$;
create or replace function ml_private.stage4_queue_path(s jsonb,a integer,path jsonb,serial integer) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare tasks jsonb;snapshots jsonb;begin
 snapshots:=ml_private.stage3_carry_candidates(s,a,s#>>array['players',a::text,'cell']);
 select coalesce(jsonb_agg(ml_private.stage3_task('board-step',jsonb_build_object('actor',a,'serial',serial,'data',jsonb_build_object('cell',v))) order by ord),'[]') into tasks from jsonb_array_elements(path) with ordinality q(v,ord);
 if jsonb_array_length(snapshots)>0 then tasks:=tasks||jsonb_build_array(ml_private.stage3_task('board-force-carry',jsonb_build_object('actor',a,'serial',serial,'data',snapshots)));end if;
 return ml_private.stage3_prepend(s,tasks);
end $$;
create or replace function ml_private.stage4_pay(s jsonb,a integer,owner integer,mode text,card text,pay_ap boolean) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare missing boolean:=false;amount integer;begin
 if mode='tribute' or mode='desert' and pay_ap then
  amount:=least(1,(s#>>array['players',a::text,'ap'])::int);s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((s#>>array['players',a::text,'ap'])::int-amount));
  if amount>0 and (s#>>array['players',owner::text,'hp'])::int>0 then s:=ml_private.stage3_gain_ap(s,owner,amount);s:=s-'_gain';end if;missing:=amount<1;
 end if;
 if mode<>'desert' or not pay_ap then
  if card is not null then perform ml_private.need(s#>array['players',a::text,'hand'] ? card,'手中没有所选上交牌');s:=jsonb_set(s,array['players',a::text,'hand'],(s#>array['players',a::text,'hand'])-card);
   if (s#>>array['players',owner::text,'hp'])::int>0 then s:=jsonb_set(s,array['players',owner::text,'hand'],(s#>array['players',owner::text,'hand'])||jsonb_build_array(card));else s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(card));end if;
  else missing:=true;end if;
 end if;
 s:=ml_private.emit(s,'tax','S'||(a+1)||' '||case when mode='desert' then '沙漠税' when mode='lmm' then 'LMM交牌' else '上课铃上交' end||case when missing then '，资源不足受1伤' else '' end);
 if missing then s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',a,'amount',1,'source',owner,'category','attack','directHp',true)));s:=ml_private.stage3_prepend(s,s->'_triggers');s:=s-'_triggers';end if;return s;
end $$;
create or replace function ml_private.stage4_map_task(s jsonb,t jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s#>'{cardStack,stack,-1}';action text:=t->>'action';a integer:=coalesce((t->>'actor')::int,(s->>'active')::int);target integer;definition text:=c->>'definition';targets jsonb;tasks jsonb:='[]';cards jsonb;cells jsonb;paths jsonb;options jsonb;desert jsonb;region text;cell text;roll integer;max_distance integer;effect jsonb;idx text;begin
 if action='board-desert' then desert:=ml_private.stage4_desert(s,a);if desert is not null then
  if jsonb_array_length(s#>array['players',a::text,'hand'])>0 or (s#>>array['players',a::text,'ap'])::int>0 then s:=ml_private.select_choice(s,'board-tax',a,at,jsonb_build_object('cards',s#>array['players',a::text,'hand'],'source',desert->'owner','data',jsonb_build_object('mode','desert')));
  else s:=ml_private.stage4_pay(s,a,(desert->>'owner')::int,'desert',null,false);end if;end if;return s||jsonb_build_object('_boardHandled',true);
 elsif action='board-pay' then if ml_private.stage4_on_board(s,a) then
  if jsonb_array_length(s#>array['players',a::text,'hand'])>0 then s:=ml_private.select_choice(s,'board-tax',a,at,jsonb_build_object('cards',s#>array['players',a::text,'hand'],'source',t->'source','data',jsonb_build_object('mode',t#>'{data,mode}')));
  else s:=ml_private.stage4_pay(s,a,(t->>'source')::int,t#>>'{data,mode}',null,false);end if;end if;return s||jsonb_build_object('_boardHandled',true);
 end if;
 if action like 'board-%' then
  if c is null or t ? 'serial' and t->'serial'<>c->'serial' then return s||jsonb_build_object('_boardHandled',true);end if;
  if action='board-force' then
   paths:=ml_private.stage4_forced_paths(s,a,t#>>'{data,region}',(t#>>'{data,steps}')::int);
   if jsonb_array_length(paths)>1 then select jsonb_object_agg((ord-1)::text,v) into options from jsonb_array_elements(paths) with ordinality q(v,ord);s:=ml_private.select_choice(s,'board-path',a,at,jsonb_build_object('options',options,'data',jsonb_build_object('serial',c->'serial')));
   elsif jsonb_array_length(coalesce(paths->0,'[]'))>0 then s:=ml_private.stage4_queue_path(s,a,paths->0,(c->>'serial')::int);end if;
  elsif action='board-step' then
   cell:=t#>>'{data,cell}';
   if not ml_private.stage4_on_board(s,a) or ml_private.distance_for_version(s->>'version',s#>>array['players',a::text,'cell'],cell)<>1 or not ml_private.stage4_board_empty(s,a,cell,jsonb_build_array(a)) then
    s:=jsonb_set(s,'{queue}',(select coalesce(jsonb_agg(v order by ord),'[]') from jsonb_array_elements(s->'queue') with ordinality q(v,ord) where not(coalesce(v->>'action','')='board-step' and (v->>'actor')::int=a and v->'serial'=c->'serial')));
   else s:=ml_private.stage3_relocate(s,a,cell,false,false);s:=ml_private.stage3_prepend(s,s->'_relocationTasks');s:=s-'_relocationTasks';
    if ml_private.game_data(s,'map')#>>array[cell,'region']='山洞' then s:=jsonb_set(s,'{queue}',(select coalesce(jsonb_agg(v order by ord),'[]') from jsonb_array_elements(s->'queue') with ordinality q(v,ord) where not(coalesce(v->>'action','')='board-step' and (v->>'actor')::int=a and v->'serial'=c->'serial')));end if;
   end if;
  elsif action='board-force-carry' then s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('carry',jsonb_build_object('actor',a,'data',t->'data'))));
  elsif action='board-force-after' then
   targets:=ml_private.stage4_map_targets(s,c);
   if definition='basic-013' then
    select max(ml_private.stage4_region_distance(s,(v#>>'{}')::int,'操场')) into max_distance from ml_private.arr(targets) v where v<>c->'actor';
    select coalesce(jsonb_agg(jsonb_build_object('target',v,'amount',1,'source',c->'actor','category','attack','directHp',true)),'[]') into tasks from ml_private.arr(targets) v where v<>c->'actor' and ml_private.stage4_region_distance(s,(v#>>'{}')::int,'操场')=max_distance;
    s:=ml_private.damage(s,tasks);s:=ml_private.stage3_prepend(s,s->'_triggers');s:=s-'_triggers';
   else
    select coalesce(jsonb_agg(ml_private.stage3_task('board-pay',jsonb_build_object('actor',v,'source',c->'actor','data',jsonb_build_object('mode','tribute'))) order by ord),'[]') into tasks
    from jsonb_array_elements(s->'order') with ordinality q(v,ord) where targets @> jsonb_build_array(v) and v<>c->'actor' and s#>array['players',v#>>'{}','team']<>s#>array['players',c->>'actor','team'] and ml_private.game_data(s,'map')#>>array[s#>>array['players',v#>>'{}','cell'],'region']='教学楼';s:=ml_private.stage3_prepend(s,tasks);
   end if;
  elsif action='board-teleport' then
   target:=(t->>'target')::int;if ml_private.stage4_on_board(s,target) and ml_private.stage4_on_board(s,(c->>'actor')::int) then
    select coalesce(jsonb_agg(candidate->'id' order by ord),'[]') into cells from jsonb_array_elements(ml_private.game_data(s,'cells')) with ordinality q(candidate,ord) where ml_private.stage4_board_empty(s,target,candidate->>'id',jsonb_build_array(target));
    if jsonb_array_length(cells)>0 then s:=ml_private.select_choice(s,'board-cell',(c->>'actor')::int,at,jsonb_build_object('cells',cells,'source',target,'data',jsonb_build_object('serial',c->'serial')));end if;end if;
  else raise exception '未知阶段四地图任务';end if;return s||jsonb_build_object('_boardHandled',true);
 end if;
 if action<>'effect' or definition not in ('basic-013','basic-020','basic-021','basic-023','basic-026','basic-031','basic-032','basic-033','basic-034') then return s||jsonb_build_object('_boardHandled',false);end if;
 a:=(c->>'actor')::int;targets:=ml_private.stage4_map_targets(s,c);s:=ml_private.stage3_record_combo(s,a,definition);
 if definition='basic-020' then for target in select (v#>>'{}')::int from ml_private.arr(targets) v loop s:=jsonb_set(s,array['stage4','toiletUntil',target::text],to_jsonb((s#>>array['stage3','starts',target::text])::int+1));s:=jsonb_set(s,array['stage4','toiletEffects',target::text],c->'effect');end loop;end if;
 if definition='basic-026' then
  s:=jsonb_set(s,array['stage4','lmmUntil',a::text],to_jsonb((s#>>array['stage3','starts',a::text])::int+1));s:=jsonb_set(s,array['stage4','lmmEffects',a::text],c->'effect');s:=jsonb_set(s,array['stage4','lmmSerial',a::text],c->'serial');
  select coalesce(jsonb_agg(ml_private.stage3_task('board-pay',jsonb_build_object('actor',v,'source',a,'data',jsonb_build_object('mode','lmm'))) order by ord),'[]') into tasks from jsonb_array_elements(s->'order') with ordinality q(v,ord) where targets @> jsonb_build_array(v);
 end if;
 if definition='basic-034' then for target in select (v#>>'{}')::int from ml_private.arr(targets) v loop
  s:=jsonb_set(s,array['stage4','offMap',target::text],'true');s:=jsonb_set(s,array['classic','exposure',target::text],jsonb_build_object('region',null,'streak',0));s:=jsonb_set(s,array['classic','caveEnds',target::text],'0');s:=ml_private.emit(s,'off-map','S'||(target+1)||' 移出地图，等待下个个人开始返回');end loop;end if;
 if definition='basic-023' then
  select coalesce(jsonb_agg(v order by ord),'[]') into cards from jsonb_array_elements(s#>'{stage4,blocks}') with ordinality q(v,ord) where not((v->>'owner')::int=a and v->'region'=c#>'{stage4,region}');
  cards:=cards||jsonb_build_array(jsonb_build_object('region',c#>'{stage4,region}','owner',a,'effect',c->'effect','until',(s#>>array['stage3','starts',a::text])::int+1,'exempt',coalesce(c#>'{stage4,officeExempt}','[]')));s:=jsonb_set(s,'{stage4,blocks}',cards);
 end if;
 if definition='basic-032' then s:=jsonb_set(s,array['stage4','deserts',c#>>'{stage4,region}'],jsonb_build_object('owner',a,'effect',c->'effect'));end if;
 if definition='basic-033' then
  s:=jsonb_set(s,array['stage4','water',c#>>'{stage4,region}'],jsonb_build_object('owner',a,'effect',c->'effect'));
  for target in select (v#>>'{}')::int from ml_private.arr(s->'order') v loop
   if ml_private.stage4_on_board(s,target) and ml_private.game_data(s,'map')#>>array[s#>>array['players',target::text,'cell'],'region']=c#>>'{stage4,region}' and ml_private.stage4_board_effect(s,target,c->'effect') and not ml_private.classic_native(s,target) and jsonb_array_length(s#>array['players',target::text,'hand'])>0 then tasks:=tasks||jsonb_build_array(jsonb_build_object('kind','water','actor',target,'data',jsonb_build_object('entry',true)));end if;
  end loop;
 end if;
 if definition in ('basic-013','basic-031') then
  region:=case when definition='basic-013' then '操场' else '教学楼' end;
  select coalesce(jsonb_agg(ml_private.stage3_task('board-force',jsonb_build_object('actor',v,'serial',c->'serial','data',jsonb_build_object('region',region,'steps',case when definition='basic-013' then 1 else 3 end))) order by ord),'[]') into tasks from jsonb_array_elements(s->'order') with ordinality q(v,ord) where targets @> jsonb_build_array(v);
  tasks:=tasks||jsonb_build_array(ml_private.stage3_task('board-force-after',jsonb_build_object('serial',c->'serial')));
 end if;
 if definition='basic-021' and jsonb_array_length(targets)>0 then
  if jsonb_array_length(s#>'{random,dice}')>0 then roll:=(s#>>'{random,dice,0}')::int;s:=jsonb_set(s,'{random,dice}',(s#>'{random,dice}')-0);else s:=ml_private.int(s,6);roll:=(s->>'_int')::int+1;s:=s-'_int';end if;
  idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;s:=jsonb_set(s,array['cardStack','stack',idx,'stage4','guessDie'],to_jsonb(roll));s:=ml_private.select_choice(s,'board-guess',(targets->>0)::int,at,jsonb_build_object('source',a,'data',jsonb_build_object('serial',c->'serial')));
 end if;
 s:=ml_private.emit(s,'effect',definition||'地图效果结算');s:=ml_private.stage3_prepend(s,tasks||jsonb_build_array(ml_private.stage3_task('cleanup',jsonb_build_object('serial',c->'serial'))));return s||jsonb_build_object('_boardHandled',true);
end $$;
create or replace function ml_private.stage4_map_targets(s jsonb,c jsonb) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(v order by ord),'[]') from jsonb_array_elements(c->'targets') with ordinality q(v,ord) where ml_private.stage4_on_board(s,(v#>>'{}')::int) and not(c->'cancelled' @> jsonb_build_array(v)) and ml_private.stage3_card_allowed(s,(v#>>'{}')::int,c->>'definition',c->'effect') and not(coalesce(c#>'{stage4,officeExempt}','[]') @> jsonb_build_array(v)) $$;
create or replace function ml_private.stage4_map_choose(s jsonb,cmd jsonb,at double precision,timeout boolean) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare choice jsonb:=s->'choice';a integer:=(choice->>'actor')::int;kind text:=choice->>'kind';option text:=cmd->>'option';mode text:=choice#>>'{data,mode}';card text:=cmd->>'card';ap boolean;pending jsonb;roll integer;cell text:=cmd->>'cell';cells jsonb;origin text;jobs jsonb;begin
 if kind='board-path' then
  if option is null and timeout then select key into option from jsonb_each(choice->'options') order by key::int limit 1;end if;perform ml_private.need(option is not null and choice->'options' ? option,'请选择一条合法路径');return ml_private.stage4_queue_path(s,a,choice->'options'->option,(choice#>>'{data,serial}')::int);
 elsif kind='board-tax' then
  ap:=mode='desert' and (cmd->>'action'='ap' or timeout and (s#>>array['players',a::text,'ap'])::int>0);ap:=coalesce(ap,false);
  if card is null and timeout then select v#>>'{}' into card from ml_private.arr(s#>array['players',a::text,'hand']) v order by v#>>'{}' limit 1;end if;
  if mode='desert' then perform ml_private.need(case when ap then (s#>>array['players',a::text,'ap'])::int>0 else card is not null and choice->'cards' ? card end,'请选择1AP或一张手牌');else perform ml_private.need(card is not null and choice->'cards' ? card,'请选择一张上交牌');end if;
  return ml_private.stage4_pay(s,a,(choice->>'source')::int,mode,card,ap);
 elsif kind='board-guess' then
  pending:=s#>'{cardStack,stack,-1}';roll:=(pending#>>'{stage4,guessDie}')::int;perform ml_private.need(timeout or jsonb_typeof(cmd->'guess')='number' and (cmd->>'guess')::numeric=trunc((cmd->>'guess')::numeric) and (cmd->>'guess')::int between 1 and 6,'请选择1—6');
  s:=ml_private.emit(s,'dice','卫汶找你：d6 = '||roll,to_jsonb(roll));if timeout or (cmd->>'guess')::int<>roll then s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('board-teleport',jsonb_build_object('target',a,'serial',pending->'serial'))));end if;return s;
 elsif kind='board-cell' then
  if cell is not null then perform ml_private.need(choice->'cells' ? cell and ml_private.stage4_board_empty(s,(choice->>'source')::int,cell,jsonb_build_array(choice->'source')),'传送落点不合法');s:=ml_private.stage3_relocate(s,(choice->>'source')::int,cell,false);s:=ml_private.stage3_prepend(s,s->'_relocationTasks');s:=s-'_relocationTasks';end if;return s;
 elsif kind='board-return' then
  select coalesce(jsonb_agg(v order by ord),'[]') into cells from jsonb_array_elements(choice->'cells') with ordinality q(v,ord) where ml_private.stage4_board_empty(s,a,v#>>'{}',jsonb_build_array(a));perform ml_private.need(jsonb_array_length(cells)>0,'当前无合法返回格');
  if timeout then s:=ml_private.int(s,jsonb_array_length(cells));cell:=cells->>(s->>'_int')::int;s:=s-'_int';end if;perform ml_private.need(cell is not null and cells ? cell,'请选择合法返回格');
  s:=jsonb_set(s,array['stage4','offMap',a::text],'false');origin:=s#>>array['players',a::text,'cell'];s:=ml_private.stage3_relocate(s,a,cell,false);jobs:=s->'_relocationTasks';s:=s-'_relocationTasks';
  if origin=cell and ml_private.stage4_board_water(s,cell,a) and not ml_private.classic_native(s,a) and jsonb_array_length(s#>array['players',a::text,'hand'])>0 then jobs:=jsonb_build_array(jsonb_build_object('kind','water','actor',a,'data',jsonb_build_object('entry',true)))||jobs;end if;
  if origin=cell and ml_private.stage4_desert(s,a) is not null then jobs:=jobs||jsonb_build_array(ml_private.stage3_task('board-desert',jsonb_build_object('actor',a)));end if;
  s:=ml_private.stage3_prepend(s,jobs);return ml_private.emit(s,'return','S'||(a+1)||' 返回地图'||cell);
 end if;raise exception '未知阶段四地图选择';
end $$;
