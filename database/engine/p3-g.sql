-- Approved G checkpoint helpers. Composed into local candidate migration029.
-- The eventual029 patch supplies the ordinary dispatch/start callbacks and the
-- integer alias; clients never supply checkpoints, transcripts or final dice.
create or replace function ml_private.p3g_enabled(s jsonb) returns boolean language sql immutable set search_path=pg_catalog,ml_private as $$select s->>'version'='web-v0.1.18'$$;
create or replace function ml_private.p3g_initial_state() returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$select '{"invisEndTurn":[null,null,null,null],"programUsed":[false,false,false,false],"counterUsed":[false,false,false,false],"invisible":[false,false,false,false],"face":[0,0,0,0],"marks":[null,null,null,null],"forecast":null,"pairs":{},"gearBreadReadyAt":{},"gearTerrain":{}}'::jsonb$$;
create or replace function ml_private.p3g_prime(s jsonb,a integer) returns boolean language sql immutable set search_path=pg_catalog,ml_private as $$select ml_private.p3g_enabled(s) and s#>>array['players',a::text,'character']='character-021'$$;
create or replace function ml_private.p3g_start(s jsonb,a integer) returns jsonb language plpgsql immutable set search_path=pg_catalog,ml_private as $$declare marks jsonb;begin
 if not ml_private.p3g_enabled(s) then return s;end if;perform ml_private.need(s#>'{stage3,g}' is not null,'G批状态缺失');select jsonb_agg(case when v=to_jsonb(a) then 'null'::jsonb else v end order by n) into marks from jsonb_array_elements(s#>'{stage3,g,marks}') with ordinality q(v,n);s:=jsonb_set(s,'{stage3,g}',(s#>'{stage3,g}')||jsonb_build_object('programUsed','[false,false,false,false]'::jsonb,'counterUsed','[false,false,false,false]'::jsonb,'marks',marks));s:=jsonb_set(s,array['stage3','g','face',a::text],'0');return jsonb_set(s,array['stage3','g','invisible',a::text],'false');end $$;
create or replace function ml_private.p3g_prime_quote(s jsonb,a integer,quote jsonb) returns jsonb language plpgsql immutable set search_path=pg_catalog,ml_private as $$declare effect jsonb:=quote->'effect';begin
 if ml_private.p3g_prime(s,a) and coalesce(quote->>'gPrimeQuoted','false')<>'true' then effect:=jsonb_set(effect,'{roleModifiers}',coalesce(effect->'roleModifiers','[]')||jsonb_build_array(jsonb_build_object('actor',a,'kind','active')));quote:=quote||jsonb_build_object('cost',(quote->>'cost')::bigint+1,'effect',effect,'gPrimeQuoted',true);end if;return quote;end $$;
create or replace function ml_private.p3g_prime_quote(s jsonb,a integer,cost bigint,effect jsonb) returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$select ml_private.p3g_prime_quote(s,a,jsonb_build_object('cost',cost,'effect',effect))$$;

create or replace function ml_private.p3g_free_quote(s jsonb,a integer,definition text,cost bigint,effect jsonb,variable boolean default false) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare role text:=s#>>array['players',a::text,'character'];profile jsonb;begin
 if not ml_private.p3g_enabled(s) or variable or cost<=0 then return jsonb_build_object('cost',cost,'effect',effect);end if;profile:=ml_private.version_catalog(s->>'version');
 if role='character-022' and profile#>array['runtimeData','cardTags',definition] ? '建民' or role='character-033' and profile#>array['runtimeData','cardTags',definition] ? '外星' or role='character-049' and profile#>>array['runtimeData','cards',definition,'type']='food' then cost:=0;effect:=jsonb_set(effect,'{roleModifiers}',(effect->'roleModifiers')||jsonb_build_array(jsonb_build_object('actor',a,'kind','cost')));end if;
 return jsonb_build_object('cost',cost,'effect',effect);end $$;
create or replace function ml_private.p3g_submission_tasks(s jsonb,c jsonb) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare profile jsonb:=ml_private.version_catalog(s->>'version');definition text:=c->>'definition';tags jsonb;food boolean;result jsonb:='[]';v jsonb;a integer;role text;begin
 if not ml_private.p3g_enabled(s) then return result;end if;tags:=profile#>array['runtimeData','cardTags',definition];food:=profile#>>array['runtimeData','cards',definition,'type']='food';
 for v in select * from ml_private.arr(s->'order') loop a:=(v#>>'{}')::int;role:=s#>>array['players',a::text,'character'];if not ml_private.stage4_on_board(s,a) then continue;end if;
 if role='character-022' and tags ? '建民' then result:=result||jsonb_build_array(ml_private.stage3_task('g-jianmin',jsonb_build_object('actor',a,'serial',c->'serial')));
 elsif role='character-049' and v<>c->'actor' and food then result:=result||jsonb_build_array(ml_private.stage3_task('g-store-discard',jsonb_build_object('actor',a,'serial',c->'serial')));end if;end loop;return result;end $$;
create or replace function ml_private.p3g_counter_actor(s jsonb,c jsonb) returns integer language sql stable set search_path=pg_catalog,ml_private as $$select (v#>>'{}')::int from jsonb_array_elements(s->'order') with ordinality q(v,n) where v<>c->'actor' and ml_private.stage4_on_board(s,(v#>>'{}')::int) and s#>>array['players',v#>>'{}','character']='character-009' and s#>>array['stage3','g','counterUsed',v#>>'{}']='false' and (s#>>array['players',v#>>'{}','ap'])::int>=1 and ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',v,'roleModifiers','[]'::jsonb),(c->>'actor')::int,s#>>array['players',c->>'actor','character']) order by n limit 1$$;
create or replace function ml_private.p3g_white_targets(s jsonb,a integer) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$select coalesce(jsonb_agg(v order by n),'[]') from jsonb_array_elements(s->'order') with ordinality q(v,n) where (v#>>'{}')::int<>a and ml_private.stage4_on_board(s,(v#>>'{}')::int) and jsonb_array_length(s#>array['players',v#>>'{}','hand'])>0 and (s->>'mode'='ffa' or s#>array['players',v#>>'{}','team']<>s#>array['players',a::text,'team']) and ml_private.character_effect_allowed(jsonb_build_object('origin','role-locked','actor',a,'roleModifiers','[]'::jsonb),(v#>>'{}')::int,s#>>array['players',v#>>'{}','character'])$$;
create or replace function ml_private.p3g_dog_targets(s jsonb,a integer) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$select coalesce(jsonb_agg(q->'seat' order by n),'[]') from jsonb_array_elements(s->'players') with ordinality r(q,n) where ml_private.p3g_enabled(s) and ml_private.stage4_on_board(s,a) and s#>>array['players',a::text,'character']='character-022' and ml_private.stage4_on_board(s,(q->>'seat')::int) and not exists(select 1 from ml_private.arr(s->'players') east where east->>'character'='character-010' and (east->'seat'=q->'seat' or s->>'mode'='team' and east->'team'=q->'team')) and ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',a,'roleModifiers','[]'::jsonb),(q->>'seat')::int,q->>'character')$$;
create or replace function ml_private.p3g_dog(s jsonb,a integer,target integer,direction text) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin
 perform ml_private.need(ml_private.p3g_enabled(s) and ml_private.p3g_dog_targets(s,a) @> jsonb_build_array(target),'狗头军师角色或目标不合法');perform ml_private.need(direction in ('up','right','down','left'),'请指定狗头军师正交方向');perform ml_private.need((s#>>array['players',a::text,'ap'])::int>=1,'狗头军师需要1AP');s:=ml_private.p3d_pay(s,a,1);s:=jsonb_set(s,'{queue}',(s->'queue')||jsonb_build_array(ml_private.stage3_task('g-dog-move',jsonb_build_object('actor',a,'target',target,'data',jsonb_build_object('direction',direction)))));return ml_private.emit(s,'skill','S'||(a+1)||' 狗头军师支付1AP，推动S'||(target+1));end $$;
create or replace function ml_private.p3g_card_task(s jsonb,t jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare c jsonb:=s#>'{cardStack,stack,-1}';a integer:=coalesce((t->>'actor')::int,(c->>'actor')::int);position text:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;jobs jsonb;counter integer;handled boolean:=false;targets jsonb;target integer;cell text;begin
 if not ml_private.p3g_enabled(s) then return s||jsonb_build_object('_gCardHandled',false);end if;
 if t->>'action'='g-dog-move' then target:=(t->>'target')::int;if ml_private.p3g_dog_targets(s,a) @> jsonb_build_array(target) then cell:=ml_private.stage3_direction_cell(s#>>array['players',target::text,'cell'],t#>>'{data,direction}');if cell is not null and ml_private.stage4_board_empty(s,target,cell,jsonb_build_array(target)) then s:=s||jsonb_build_object('_eCause',jsonb_build_object('source',a),'_gearReactiveSkip',true);s:=ml_private.stage3_relocate(s,target,cell,false,false);s:=ml_private.stage3_prepend(s,s->'_relocationTasks');s:=s-'_relocationTasks'-'_gearReactiveSkip';else s:=ml_private.emit(s,'move','S'||(target+1)||' 狗头军师位移受阻，原地');end if;end if;return s||jsonb_build_object('_gCardHandled',true);end if;
 if t->>'action'='g-white-eye' then targets:=ml_private.p3g_white_targets(s,a);if ml_private.stage4_on_board(s,a) and s#>>array['players',a::text,'character']='character-009' and jsonb_array_length(targets)>0 then s:=ml_private.select_choice(s,'g-white-eye',a,at,jsonb_build_object('targets',targets,'count',least(2,jsonb_array_length(targets))));end if;return s||jsonb_build_object('_gCardHandled',true);end if;
 if c is null or t ? 'serial' and t->'serial'<>c->'serial' then return s||jsonb_build_object('_gCardHandled',false);end if;
 if t->>'action'='counter' and coalesce(c->>'gSubmitted','false')<>'true' then c:=c||jsonb_build_object('gSubmitted',true);s:=jsonb_set(s,array['cardStack','stack',position],c);jobs:=ml_private.p3g_submission_tasks(s,c);if jsonb_array_length(jobs)>0 then s:=ml_private.stage3_prepend(s,jobs||jsonb_build_array(ml_private.stage3_task('g-submit-resume',jsonb_build_object('serial',c->'serial'))));handled:=true;end if;
 elsif t->>'action'='g-jianmin' then if ml_private.stage4_on_board(s,a) then s:=ml_private.draw(s,a,1);end if;handled:=true;
 elsif t->>'action'='g-store-discard' then if ml_private.stage4_on_board(s,a) and jsonb_array_length(s#>array['players',a::text,'hand'])>0 then s:=ml_private.select_choice(s,'g-discard',a,at,jsonb_build_object('count',1,'cards',s#>array['players',a::text,'hand'],'data',jsonb_build_object('serial',c->'serial')));end if;handled:=true;
 elsif t->>'action'='g-submit-resume' then if c->'counter'<>'null'::jsonb then s:=jsonb_set(s,array['cardStack','stack',position,'counter','deadline'],to_jsonb(at+30000));end if;s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('counter',jsonb_build_object('serial',c->'serial'))));handled:=true;
 elsif t->>'action'='continue' and c->>'countered'<>'true' and coalesce(c->>'gCounterOffered','false')<>'true' then s:=jsonb_set(s,array['cardStack','stack',position,'gCounterOffered'],'true');counter:=ml_private.p3g_counter_actor(s,c);if counter is not null then s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('continue',jsonb_build_object('serial',c->'serial'))));s:=ml_private.select_choice(s,'g-counter',counter,at,jsonb_build_object('source',c->'actor','data',jsonb_build_object('serial',c->'serial')));handled:=true;end if;
 end if;return s||jsonb_build_object('_gCardHandled',handled);end $$;
create or replace function ml_private.p3g_card_choose(s jsonb,cmd jsonb,at double precision,timeout boolean) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare choice jsonb:=s->'choice';a integer:=(choice->>'actor')::int;cards jsonb;c jsonb;position text;roll integer;legal jsonb;targets jsonb;picked jsonb;target integer;hand jsonb;idx integer;card text;begin
 if not ml_private.p3g_enabled(s) then return s||jsonb_build_object('_gCardHandled',false);end if;
 if choice->>'kind'='g-white-eye' then
  legal:=ml_private.p3g_white_targets(s,a);if timeout then select coalesce(jsonb_agg(v order by n),'[]') into targets from jsonb_array_elements(legal) with ordinality q(v,n) where n<=2;else targets:=coalesce(cmd->'targets','[]');end if;
  perform ml_private.need(jsonb_array_length(targets)<=2 and (select count(distinct v) from ml_private.arr(targets) v)=jsonb_array_length(targets) and not exists(select 1 from ml_private.arr(targets) v where not(legal @> jsonb_build_array(v))),'白眼最多选择两名不同合法对手');
  for picked in select * from ml_private.arr(targets) loop target:=(picked#>>'{}')::int;hand:=s#>array['players',target::text,'hand'];s:=ml_private.p3g_int(s,jsonb_array_length(hand));idx:=(s->>'_int')::int;s:=s-'_int';card:=hand->>idx;s:=jsonb_set(s,array['players',target::text,'hand'],hand-idx);s:=jsonb_set(s,array['players',a::text,'hand'],(s#>array['players',a::text,'hand'])||jsonb_build_array(card));s:=ml_private.emit(s,'transfer','S'||(a+1)||' 白眼从S'||(target+1)||' 随机拿1张');end loop;
 elsif choice->>'kind'='g-discard' then
  if timeout then select coalesce(jsonb_agg(v order by v),'[]') into cards from (select v from ml_private.arr(s#>array['players',a::text,'hand']) v order by v limit (choice->>'count')::int) q;else cards:=coalesce(cmd->'cards','[]');end if;
  perform ml_private.need(jsonb_array_length(cards)=(choice->>'count')::int and (select count(distinct v) from ml_private.arr(cards) v)=jsonb_array_length(cards) and not exists(select 1 from ml_private.arr(cards) v where not(s#>array['players',a::text,'hand'] @> jsonb_build_array(v))),'店长请选择准确数量的不同手牌弃置');s:=jsonb_set(s,array['players',a::text,'hand'],coalesce((select jsonb_agg(v order by n) from jsonb_array_elements(s#>array['players',a::text,'hand']) with ordinality q(v,n) where not(cards @> jsonb_build_array(v))),'[]'));s:=ml_private.exercise_discard(s,cards);s:=ml_private.emit(s,'discard','S'||(a+1)||' 店长弃'||jsonb_array_length(cards)||'张牌');
 elsif choice->>'kind'='g-counter' then
  if not timeout and cmd->>'accept'='true' then c:=s#>'{cardStack,stack,-1}';perform ml_private.need(c is not null and c->'serial'=choice#>'{data,serial}' and ml_private.p3g_counter_actor(s,c)=a,'好奇怪哦次数或目标已失效');s:=ml_private.p3d_pay(s,a,1);s:=jsonb_set(s,array['stage3','g','counterUsed',a::text],'true');s:=ml_private.p3g_die(s,'好奇怪哦',a);roll:=(s->>'_roll')::int;s:=s-'_roll';if roll<=3 then position:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;s:=jsonb_set(s,array['cardStack','stack',position,'countered'],'true');end if;s:=ml_private.emit(s,'skill','S'||(a+1)||' 好奇怪哦支付1AP，'||case when roll<=3 then '本份逻辑牌失效' else '判定失败' end);end if;
 else return s||jsonb_build_object('_gCardHandled',false);end if;return s||jsonb_build_object('_gCardHandled',true);end $$;

create or replace function ml_private.p3g_begin_pair(s jsonb,physical text) returns jsonb language plpgsql immutable set search_path=pg_catalog,ml_private as $$begin
 if not ml_private.p3g_enabled(s) then return s;end if;perform ml_private.need(s#>'{stage3,g,pairs}' is not null,'G装备账本缺失');
 if s#>array['stage3','g','pairs',physical] is null then s:=jsonb_set(s,array['stage3','g','pairs',physical],jsonb_build_object('parts',jsonb_build_array(physical||'~g1',physical||'~g2'),'removed','[]'::jsonb,'open',true));end if;return s;end $$;
create or replace function ml_private.p3g_piece_physical(s jsonb,piece text) returns text language sql immutable set search_path=pg_catalog,ml_private as $$select key from jsonb_each(coalesce(s#>'{stage3,g,pairs}','{}')) p where p.value->'parts' ? piece limit 1$$;
create or replace function ml_private.p3g_gear_snapshot(s jsonb,a integer,card text) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare g jsonb:=ml_private.stage4_gear_snapshot(s,a,card);begin
 if ml_private.p3g_enabled(s) and g->>'definition'='basic-054' then g:=g||jsonb_build_object('breadRemaining',greatest(0,coalesce((s#>>array['stage3','g','gearBreadReadyAt',card])::int,0)-(s#>>array['stage3','starts',a::text])::int));end if;return g;end $$;
create or replace function ml_private.p3g_bread_equipment(s jsonb,a integer,requested text default null) returns text language sql stable set search_path=pg_catalog,ml_private as $$select v#>>'{}' from jsonb_array_elements(s#>array['stage3','equipment',a::text]) with ordinality q(v,n) where (requested is null or v#>>'{}'=requested) and ml_private.stage4_equipment_definition(s,v#>>'{}')='basic-054' and ml_private.character_effect_allowed((s#>array['stage3','equipmentSources',v#>>'{}'])||jsonb_build_object('origin','equipment'),a,s#>>array['players',a::text,'character']) and (s#>>array['stage3','starts',a::text])::int>=coalesce((s#>>array['stage3','g','gearBreadReadyAt',v#>>'{}'])::int,0) order by n limit 1$$;
create or replace function ml_private.p3g_bread(s jsonb,a integer,target integer,requested text default null) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare card text:=ml_private.p3g_bread_equipment(s,a,requested);begin
 perform ml_private.need(card is not null and a<>target and (s#>>array['players',target::text,'hp'])::int>0,'面包技能暂不可用或目标不合法');s:=jsonb_set(s,array['stage3','g','gearBreadReadyAt',card],to_jsonb((s#>>array['stage3','starts',a::text])::int+2));return jsonb_set(s,array['stage3','breadPending',target::text],'true');end $$;
create or replace function ml_private.p3g_bread_install(s jsonb,a integer,g jsonb) returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$select case when ml_private.p3g_enabled(s) and g->>'definition'='basic-054' then jsonb_set(s,array['stage3','g','gearBreadReadyAt',g->>'card'],to_jsonb((s#>>array['stage3','starts',a::text])::int+coalesce((g->>'breadRemaining')::int,0))) else s end$$;
create or replace function ml_private.p3g_discard_entries(s jsonb,card text) returns jsonb language plpgsql immutable set search_path=pg_catalog,ml_private as $$declare physical text;pair jsonb;part jsonb;active jsonb;begin
 if not ml_private.p3g_enabled(s) then return s||jsonb_build_object('_gDiscardEntries',jsonb_build_array(card));end if;perform ml_private.need(s#>'{stage3,g,pairs}' is not null,'G装备账本缺失');s:=(s#-array['stage3','g','gearBreadReadyAt',card])#-array['stage3','g','gearTerrain',card];physical:=ml_private.p3g_piece_physical(s,card);
 if physical is not null then
  pair:=s#>array['stage3','g','pairs',physical];if not(pair->'removed' ? card) then pair:=jsonb_set(pair,'{removed}',(pair->'removed')||jsonb_build_array(card));end if;
  s:=jsonb_set(s,array['stage3','g','pairs',physical],pair);
  if pair->>'open'='true' or jsonb_array_length(pair->'removed')<>jsonb_array_length(pair->'parts') then return s||jsonb_build_object('_gDiscardEntries','[]'::jsonb);end if;
  s:=s#-array['stage3','g','pairs',physical];return s||jsonb_build_object('_gDiscardEntries',jsonb_build_array(physical));
 end if;
 perform ml_private.need(not(card ~ '#[0-9]{2}~g[12]$'),'成对装备件缺少实体来源');pair:=s#>array['stage3','g','pairs',card];if pair is null then return s||jsonb_build_object('_gDiscardEntries',jsonb_build_array(card));end if;
 pair:=jsonb_set(pair,'{open}','false');select coalesce(jsonb_agg(piece),'[]') into active from jsonb_array_elements(coalesce(s#>'{stage3,equipment}','[]')) items cross join lateral jsonb_array_elements(items) piece;active:=active||coalesce(s->'resolving','[]');
 for part in select * from ml_private.arr(pair->'parts') loop if not(active @> jsonb_build_array(part)) and not(pair->'removed' @> jsonb_build_array(part)) then pair:=jsonb_set(pair,'{removed}',(pair->'removed')||jsonb_build_array(part));end if;end loop;
 if jsonb_array_length(pair->'removed')<>jsonb_array_length(pair->'parts') then s:=jsonb_set(s,array['stage3','g','pairs',card],pair);return s||jsonb_build_object('_gDiscardEntries','[]'::jsonb);end if;
 s:=s#-array['stage3','g','pairs',card];return s||jsonb_build_object('_gDiscardEntries',jsonb_build_array(card));end $$;
create or replace function ml_private.p3g_now(s jsonb,at double precision) returns double precision language sql immutable set search_path=pg_catalog,ml_private as $$select case when s#>>'{_gReplay,continued}'='true' then greatest(at,(s#>>'{_gReplay,now}')::double precision) else at end$$;
create or replace function ml_private.p3g_at(s jsonb,at double precision) returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$select case when s ? '_gReplay' then jsonb_set(s,'{_gReplay,logicalAt}',to_jsonb(ml_private.p3g_now(s,at))) else s end$$;

create or replace function ml_private.p3g_int(s jsonb,bound integer) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare trace jsonb:=s#>'{random,_gTrace}';old jsonb;i integer;v integer;begin
 perform ml_private.need(bound>0,'随机范围无效');
 if trace is not null then
  i:=(trace->>'index')::int;old:=trace->'entries'->i;
  if old is not null then
   perform ml_private.need((old->>'bound')::int=bound and jsonb_typeof(old->'value')='number' and (old->>'value')::numeric=trunc((old->>'value')::numeric) and (old->>'value')::numeric>=0 and (old->>'value')::numeric<bound,'G随机续接范围不一致');
   s:=jsonb_set(s,'{random,seed}',old->'seed');s:=jsonb_set(s,'{random,_gTrace,index}',to_jsonb(i+1));return s||jsonb_build_object('_int',old->'value');
  end if;
 end if;
 s:=ml_private.int_before_p3g(s,bound);v:=(s->>'_int')::int;
 if trace is not null then
  trace:=trace||jsonb_build_object('index',i+1,'entries',(trace->'entries')||jsonb_build_array(jsonb_build_object('bound',bound,'value',v,'seed',s#>'{random,seed}')));s:=jsonb_set(s,'{random,_gTrace}',trace);
 end if;return s;end $$;

create or replace function ml_private.p3g_raw_die(s jsonb) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare v integer;begin
 if jsonb_array_length(s#>'{random,dice}')>0 then v:=(s#>>'{random,dice,0}')::int;s:=jsonb_set(s,'{random,dice}',(s#>'{random,dice}')-0);
 else s:=ml_private.p3g_int(s,6);v:=(s->>'_int')::int+1;s:=s-'_int';end if;
 perform ml_private.need(v between 1 and 6,'测试骰子必须1—6');return s||jsonb_build_object('_roll',v);end $$;

create or replace function ml_private.p3g_terrain_setting(s jsonb,cmd jsonb) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare a integer:=(cmd->>'actor')::int;cards jsonb;card text;begin
 select coalesce(jsonb_agg(v order by n),'[]') into cards from jsonb_array_elements(s#>array['stage3','equipment',a::text]) with ordinality q(v,n) where ml_private.stage4_equipment_definition(s,v#>>'{}')='basic-069' and ml_private.stage3_card_allowed(s,a,v#>>'{}',(s#>array['stage3','equipmentSources',v#>>'{}'])||jsonb_build_object('origin','equipment'));
 perform ml_private.need(ml_private.stage4_on_board(s,a) and jsonb_array_length(cards)>0 and jsonb_typeof(cmd->'accept')='boolean' and (cmd->>'card' is null or cards ? (cmd->>'card')),'唐车设置不可用或选项无效');
 for card in select v#>>'{}' from ml_private.arr(cards) v where cmd->>'card' is null or v#>>'{}'=cmd->>'card' loop s:=jsonb_set(s,array['stage3','g','gearTerrain',card],cmd->'accept');end loop;
 return jsonb_set(s,array['stage4','terrainIgnore',a::text],to_jsonb(exists(select 1 from ml_private.arr(cards) v where s#>>array['stage3','g','gearTerrain',v#>>'{}']='true')));end $$;
create or replace function ml_private.p3g_side_intent(s jsonb,cmd jsonb,at double precision,silent boolean) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare ev jsonb:=s->'events';serial jsonb:=s->'eventSerial';begin
 if cmd->>'type'='play' and split_part(cmd->>'card','#',1)='basic-017' then s:=ml_private.stage4_reserve_interrupt(s,cmd);
 elsif cmd->>'type'='skill' and cmd->>'kind'='terrain' then s:=ml_private.stage4_equipment_skill(s,cmd,at);s:=s-'_equipmentSkill';if ml_private.p3g_enabled(s) then s:=ml_private.p3g_terrain_setting(s,cmd);end if;
 else return s||jsonb_build_object('_gSideHandled',false);end if;
 if silent then s:=s||jsonb_build_object('events',ev,'eventSerial',serial);end if;return s||jsonb_build_object('_gSideHandled',true);end $$;

create or replace function ml_private.p3g_after_die(s jsonb,reason text,owner integer,raw integer) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare r jsonb:=s->'_gReplay';idx integer;old jsonb;programmer integer;ev jsonb;intent jsonb;reroll integer;math boolean;begin
 if not ml_private.p3g_enabled(s) then return s||jsonb_build_object('_roll',raw);end if;
 perform ml_private.need(r is not null,'G骰子缺少续接上下文');idx:=(r->>'index')::int;s:=jsonb_set(s,'{_gReplay,index}',to_jsonb(idx+1));
 select v into old from jsonb_array_elements(r->'steps') v where (v->>'index')::int=idx limit 1;
 if old is not null then
  perform ml_private.need((old->>'owner')::int is not distinct from owner and old->>'reason'=reason and (old->>'raw')::int=raw,'G骰子续接身份不一致');
  if old->>'programmed'='true' then
   perform ml_private.need(old->'programmer'<>'null'::jsonb,'G编程来源缺失');s:=ml_private.p3g_raw_die(s);reroll:=(s->>'_roll')::int;s:=s-'_roll';perform ml_private.need(reroll=(old->>'reroll')::int,'G编程续接随机不一致');s:=jsonb_set(s,array['stage3','g','programUsed',old->>'programmer'],'true');
  end if;
  for intent in select * from ml_private.arr(old->'intents') loop s:=ml_private.p3g_side_intent(s,intent->'command',(intent->>'at')::double precision,true);perform ml_private.need(s->>'_gSideHandled'='true','G等待期间意图续接失败');s:=s-'_gSideHandled';end loop;
  for ev in select * from ml_private.arr(old->'events') loop s:=s||jsonb_build_object('eventSerial',(s->>'eventSerial')::int+1);s:=jsonb_set(s,'{events}',(s->'events')||jsonb_build_array(ev||jsonb_build_object('seq',s->'eventSerial')));end loop;
  s:=s||jsonb_build_object('choiceSerial',old->'choiceSerial','clock',jsonb_build_object('remaining',old->'remaining','since',null));s:=jsonb_set(s,'{_gReplay}',(s->'_gReplay')||jsonb_build_object('continued',true,'now',old->'at','logicalAt',old->'at'));return s||jsonb_build_object('_roll',old->'final');
 end if;
 select (v#>>'{}')::int into programmer from jsonb_array_elements(s->'order') with ordinality q(v,n)
 where (v#>>'{}')::int is distinct from owner and ml_private.stage4_on_board(s,(v#>>'{}')::int) and s#>>array['players',v#>>'{}','character']='character-033' and s#>>array['stage3','g','programUsed',v#>>'{}']='false' and (owner is null or ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',(v#>>'{}')::int,'roleModifiers','[]'::jsonb),owner,s#>>array['players',owner::text,'character'])) order by n limit 1;
 math:=owner is not null and ml_private.stage4_on_board(s,owner) and s#>>array['players',owner::text,'character']='character-042';
 if programmer is not null or math then raise exception using errcode='P3G01',message='G骰子等待权威选择',detail=jsonb_build_object('state',s,'index',idx,'owner',owner,'reason',reason,'raw',raw,'programmer',programmer)::text;end if;
 return s||jsonb_build_object('_roll',raw);end $$;

create or replace function ml_private.p3g_die(s jsonb,reason text,owner integer) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare raw integer;begin
 s:=ml_private.p3g_raw_die(s);raw:=(s->>'_roll')::int;s:=s-'_roll';s:=ml_private.emit(s,'dice',reason||'：d6 = '||raw,to_jsonb(raw));return ml_private.p3g_after_die(s,reason,owner,raw);end $$;
create or replace function ml_private.p3g_owned_die(s jsonb,reason text,owner integer) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin if ml_private.p3g_enabled(s) then return ml_private.p3g_die(s,reason,owner);end if;return ml_private.die(s,reason);end $$;

create or replace function ml_private.p3g_capture(err jsonb,driver jsonb,steps jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare s jsonb:=err->'state';random jsonb:=coalesce(s#>'{random,_gTrace,entries}','[]');waiting jsonb;begin
 at:=coalesce((s#>>'{_gReplay,logicalAt}')::double precision,at);
 s:=(s-'_gReplay')#-'{random,_gTrace}';waiting:=jsonb_build_object('index',err->'index','owner',err->'owner','reason',err->'reason','raw',err->'raw','value',err->'raw','programmer',err->'programmer','programmed',false,'reroll',null,'eventStart',jsonb_array_length(s->'events'));
 s:=jsonb_set(s,'{stage3,g,dice}',jsonb_build_object('driver',driver,'steps',steps,'random',random,'waiting',waiting));
 return ml_private.select_choice(s,case when err->'programmer'<>'null'::jsonb then 'g-program' else 'g-math' end,coalesce((err->>'programmer')::int,(err->>'owner')::int),at,jsonb_build_object('data',jsonb_build_object('owner',err->'owner','reason',err->'reason','value',err->'raw')));end $$;

create or replace function ml_private.p3g_execute(driver jsonb,steps jsonb,random jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare s jsonb:=driver->'base';v jsonb;detail text;begin
 s:=s||jsonb_build_object('_gReplay',jsonb_build_object('index',0,'steps',steps,'now',at,'continued',false,'logicalAt',driver->'at'));s:=jsonb_set(s,'{random,_gTrace}',jsonb_build_object('index',0,'entries',random));
 begin
  if driver->>'kind'='initial' then v:=jsonb_build_object('state',ml_private.p3g_initial_core(s,(driver->>'at')::double precision),'ok',true);
  else v:=ml_private.p3g_dispatch_core(s,driver->'command',(driver->>'at')::double precision);end if;
  if v->>'ok'='true' then s:=v->'state';s:=((s-'_gReplay')#-'{random,_gTrace}')#-'{stage3,g,dice}';v:=jsonb_set(v,'{state}',s);end if;return v;
 exception when sqlstate 'P3G01' then
  get stacked diagnostics detail=pg_exception_detail;return jsonb_build_object('state',ml_private.p3g_capture(detail::jsonb,driver,steps,at),'ok',true);
 end;end $$;

create or replace function ml_private.p3g_initial(s jsonb,at double precision) returns jsonb language sql volatile set search_path=pg_catalog,ml_private as $$select ml_private.p3g_execute(jsonb_build_object('kind','initial','base',s,'at',at),'[]','[]',at)->'state'$$;

create or replace function ml_private.p3g_dispatch_step(previous jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare flow jsonb:=previous#>'{stage3,g,dice}';s jsonb;v jsonb;c jsonb:=previous->'choice';pending jsonb;w jsonb;step jsonb;events jsonb;timeout boolean;choice_at double precision;a integer;option text;begin
 if flow is null then
  v:=ml_private.p3g_execute(jsonb_build_object('kind','command','base',previous,'command',cmd,'at',at),'[]','[]',at);
  if v->>'ok'<>'true' then return jsonb_build_object('state',previous,'ok',false,'error',v->'error');end if;
  s:=v->'state';if s#>'{stage3,g,dice}' is not null then s:=s||jsonb_build_object('seen',(previous->'seen')||jsonb_build_array(cmd->'id'),'revision',(previous->>'revision')::int+1,'time',at);v:=jsonb_set(v,'{state}',s);end if;return v;
 end if;
 perform ml_private.need(jsonb_typeof(cmd)='object' and jsonb_typeof(cmd->'id')='string' and length(cmd->>'id')>0 and not(previous->'seen' ? (cmd->>'id')),'重复命令');
 perform ml_private.need(cmd->'revision'=previous->'revision','命令版本过期');
 perform ml_private.need(jsonb_typeof(cmd->'actor')='number' and (cmd->>'actor')::numeric=trunc((cmd->>'actor')::numeric) and (cmd->>'actor')::numeric between 0 and 3,'座位/命令版本必须为有效整数');a:=(cmd->>'actor')::int;
 perform ml_private.need(at is not null and at not in ('NaN'::double precision,'Infinity'::double precision,'-Infinity'::double precision) and at>=(previous->>'time')::double precision,'时钟必须单调');
 if coalesce(cmd->>'type','') not in ('choose','tick') then
  perform ml_private.need(at<(c->>'deadline')::double precision,'命令已超时，请先处理时钟事件');s:=ml_private.p3g_side_intent(previous,cmd,at,false);perform ml_private.need(s->>'_gSideHandled'='true','请先完成改骰选择');s:=s-'_gSideHandled';
  s:=jsonb_set(s,'{stage3,g,dice,waiting,intents}',coalesce(s#>'{stage3,g,dice,waiting,intents}','[]')||jsonb_build_array(jsonb_build_object('command',cmd,'at',at)));s:=s||jsonb_build_object('seen',(s->'seen')||jsonb_build_array(cmd->'id'),'revision',(s->>'revision')::int+1,'time',at);return jsonb_build_object('state',s,'ok',true);
 end if;
 if cmd->>'type'='tick' and at<(c->>'deadline')::double precision then return jsonb_build_object('state',previous,'ok',true);end if;
 timeout:=cmd->>'type'='tick';choice_at:=case when timeout then (c->>'deadline')::double precision else at end;
 if not timeout then
  perform ml_private.need(at<(c->>'deadline')::double precision,'命令已超时，请先处理时钟事件');perform ml_private.need(cmd->'choice'=c->'id','选择窗口已过期');perform ml_private.need(a=(c->>'actor')::int,'请交给待选择的座位操作');perform ml_private.need(not(cmd ? 'accept') or jsonb_typeof(cmd->'accept')='boolean','发动选项必须为布尔值');
 end if;
 s:=previous;pending:=flow;w:=pending->'waiting';
 if c->>'kind'='g-program' then
  if not timeout and cmd->>'accept'='true' then
   perform ml_private.need(w->'programmer'=c->'actor' and ml_private.stage4_on_board(s,a) and s#>>array['stage3','g','programUsed',a::text]='false','编程次数或来源无效');
   s:=jsonb_set(s,array['stage3','g','programUsed',a::text],'true');w:=w||jsonb_build_object('programmed',true);
   s:=jsonb_set(s,'{random,_gTrace}',jsonb_build_object('index',jsonb_array_length(pending->'random'),'entries',pending->'random'));s:=ml_private.p3g_raw_die(s);w:=w||jsonb_build_object('value',s->'_roll','reroll',s->'_roll');pending:=jsonb_set(pending,'{random}',s#>'{random,_gTrace,entries}');s:=(s-'_roll')#-'{random,_gTrace}';s:=ml_private.emit(s,'dice','编程：d6 = '||(w->>'value'),w->'value');
  end if;
  if timeout then s:=ml_private.emit(s,'timeout','S'||((c->>'actor')::int+1)||' 编程选择超时');end if;
  if w->'owner'<>'null'::jsonb and ml_private.stage4_on_board(s,(w->>'owner')::int) and s#>>array['players',w->>'owner','character']='character-042' then
   pending:=jsonb_set(pending,'{waiting}',w);s:=jsonb_set(s,'{stage3,g,dice}',pending);s:=ml_private.select_choice(s,'g-math',(w->>'owner')::int,choice_at,jsonb_build_object('data',jsonb_build_object('owner',w->'owner','reason',w->'reason','value',w->'value')));s:=s||jsonb_build_object('seen',(s->'seen')||jsonb_build_array(cmd->'id'),'revision',(s->>'revision')::int+1,'time',at);return jsonb_build_object('state',s,'ok',true);
  end if;
 else
  perform ml_private.need(c->>'kind'='g-math' and w->'owner'=c->'actor','不是当前数学天才窗口');
  if not timeout and cmd ? 'option' then
   perform ml_private.need(jsonb_typeof(cmd->'option')='string' and cmd->>'option' ~ '^[1-6]$','数学天才点数须1—6');option:=cmd->>'option';w:=jsonb_set(w,'{value}',to_jsonb(option::int));s:=ml_private.emit(s,'skill','S'||((c->>'actor')::int+1)||' 数学天才：最终点数'||option);
  end if;
  if timeout then s:=ml_private.emit(s,'timeout','S'||((c->>'actor')::int+1)||' 数学天才选择超时');end if;
 end if;
 select coalesce(jsonb_agg(ev order by n),'[]') into events from jsonb_array_elements(s->'events') with ordinality q(ev,n) where n>(w->>'eventStart')::int;
 step:=(w-'value'-'eventStart')||jsonb_build_object('final',w->'value','events',events,'choiceSerial',s->'choiceSerial','remaining',s#>'{clock,remaining}','at',choice_at);
 v:=ml_private.p3g_execute(pending->'driver',(pending->'steps')||jsonb_build_array(step),pending->'random',choice_at);if v->>'ok'<>'true' then return jsonb_build_object('state',previous,'ok',false,'error',v->'error');end if;
 s:=v->'state';s:=s||jsonb_build_object('seen',(previous->'seen')||jsonb_build_array(cmd->'id'),'revision',(previous->>'revision')::int+1,'time',at);return jsonb_set(v,'{state}',s);
 exception when others then return jsonb_build_object('state',previous,'ok',false,'error',sqlerrm);end $$;

create or replace function ml_private.p3g_dispatch(previous jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare v jsonb;s jsonb;base jsonb;next jsonb;deadline double precision;i integer:=0;begin
 v:=ml_private.p3g_dispatch_step(previous,cmd,at);if v->>'ok'<>'true' or cmd->>'type'<>'tick' or v->'state'=previous then return v;end if;s:=v->'state';
 while s->>'phase'<>'over' loop
  deadline:=coalesce((s#>>'{choice,deadline}')::double precision,(s#>>'{clock,since}')::double precision+(s#>>'{clock,remaining}')::double precision,'Infinity'::double precision);exit when deadline>at;
  perform ml_private.need(i<999,'G超时流程未收敛');i:=i+1;base:=s||jsonb_build_object('seen',previous->'seen','revision',previous->'revision','time',previous->'time');next:=ml_private.p3g_dispatch_step(base,cmd,at);
  if next->>'ok'<>'true' then return jsonb_build_object('state',previous,'ok',false,'error',next->'error');end if;exit when next->'state'=base;s:=next->'state';
 end loop;
 s:=s||jsonb_build_object('seen',(previous->'seen')||jsonb_build_array(cmd->'id'),'revision',(previous->>'revision')::int+1,'time',at);return jsonb_build_object('state',s,'ok',true);
 exception when others then return jsonb_build_object('state',previous,'ok',false,'error',sqlerrm);end $$;

-- Observer helpers; the staging patch adds these to refresh/environment and player/watch projections.
create or replace function ml_private.p3g_reserve_forecast(s jsonb) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin
 if not ml_private.p3g_enabled(s) then return s;end if;
 if exists(select 1 from ml_private.arr(s->'players') p where p->>'character'='character-012' and (p->>'hp')::int>0) then
  s:=ml_private.classic_pick(s,ml_private.patch_bomb_regions(s),2,true);s:=jsonb_set(s,'{stage3,g,forecast}',jsonb_build_object('round',s->'round','regions',s->'_picked'));return s-'_picked';
 end if;return jsonb_set(s,'{stage3,g,forecast}','null');end $$;
create or replace function ml_private.p3g_public_state(s jsonb,viewer integer) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$select jsonb_build_object('programUsed',s#>'{stage3,g,programUsed}','counterUsed',s#>'{stage3,g,counterUsed}','invisible',s#>'{stage3,g,invisible}','face',s#>'{stage3,g,face}','marks',s#>'{stage3,g,marks}','gearBreadReadyAt',s#>'{stage3,g,gearBreadReadyAt}','gearTerrain',s#>'{stage3,g,gearTerrain}')||case when viewer=-1 or s#>>array['players',viewer::text,'character']='character-012' then jsonb_build_object('forecast',s#>'{stage3,g,forecast}') else '{}'::jsonb end$$;
create or replace function ml_private.p3g_card_target_allowed(s jsonb,a integer,target integer,definition text) returns boolean language sql stable set search_path=pg_catalog,ml_private as $$select not ml_private.p3g_enabled(s) or a=target or coalesce(s#>>array['stage3','g','invisible',target::text],'false')<>'true' or coalesce((ml_private.version_catalog(s->>'version')#>>array['runtimeData','cards',definition,'group'])::boolean,false)$$;
create or replace function ml_private.p3g_end_tasks(s jsonb) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$select case when ml_private.p3g_enabled(s) and ml_private.stage4_on_board(s,(s->>'active')::int) and s#>>array['players',s->>'active','character']='character-012' then jsonb_build_array(ml_private.stage3_task('g-invisible',jsonb_build_object('actor',s->'active'))) else '[]'::jsonb end$$;
create or replace function ml_private.p3g_observer_task(s jsonb,t jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare a integer:=(t->>'actor')::int;begin
 if not ml_private.p3g_enabled(s) or t->>'action'<>'g-invisible' then return s||jsonb_build_object('_gObserverHandled',false);end if;
 if ml_private.stage4_on_board(s,a) and s#>>array['players',a::text,'character']='character-012' and s#>array['stage3','g','invisEndTurn',a::text] is distinct from s#>'{stage3,turn}' then s:=jsonb_set(s,array['stage3','g','invisEndTurn',a::text],s#>'{stage3,turn}');s:=ml_private.select_choice(s,'g-invisible',a,at,jsonb_build_object('deadline',at+30000));end if;return s||jsonb_build_object('_gObserverHandled',true);end $$;
create or replace function ml_private.p3g_observer_choose(s jsonb,cmd jsonb,at double precision,timeout boolean) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare a integer:=(s#>>'{choice,actor}')::int;roll integer;begin
 if not ml_private.p3g_enabled(s) or s#>>'{choice,kind}'<>'g-invisible' then return s||jsonb_build_object('_gObserverHandled',false);end if;
 if not timeout and cmd->>'accept'='true' and ml_private.stage4_on_board(s,a) and s#>>array['players',a::text,'character']='character-012' then s:=ml_private.p3g_die(s,'隐身',a);roll:=(s->>'_roll')::int;s:=s-'_roll';if roll>=4 then s:=jsonb_set(s,array['stage3','g','invisible',a::text],'true');end if;s:=ml_private.emit(s,'skill','S'||(a+1)||' 隐身'||case when roll>=4 then '成功，至自己下次个人开始' else '判定未生效' end);end if;return s||jsonb_build_object('_gObserverHandled',true);end $$;
