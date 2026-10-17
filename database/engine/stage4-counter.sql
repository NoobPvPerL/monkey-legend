create or replace function ml_private.stage4_counter_cards(s jsonb,a integer,c jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare target jsonb:=ml_private.stage4_content()#>array['cards',c->>'definition'];d jsonb;card text;q jsonb;cost integer;result jsonb:='[]';begin
 if target is null or not ml_private.stage4_on_board(s,a) then return result;end if;
 for card in select x#>>'{}' from ml_private.arr(s#>array['players',a::text,'hand']) x loop
  d:=ml_private.stage4_content()#>array['cards',split_part(card,'#',1)];
  if not (d->>'id'='basic-027' and target->>'type'='tactic' or d->>'id'='basic-028' and target->'tags' ? '建民' or d->>'id'='basic-038' and target->>'type'='food') then continue;end if;
  if not ml_private.stage4_location_card(s,a,d->>'id') then continue;end if;
  q:=s#>array['stage4','costs','locks',card];
  if d#>>'{cost,kind}' in ('die','tiers') and coalesce(q->'turn'<>s#>'{stage3,turn}',true) then result:=result||jsonb_build_array(card);continue;end if;
  cost:=(ml_private.stage3_card_cost(s,a,card,(q->>'cost')::int)->>'cost')::int;
  if cost<=(s#>>array['players',a::text,'ap'])::int then result:=result||jsonb_build_array(card);end if;
 end loop;return result;
end $$;

create or replace function ml_private.stage4_counter_task(s jsonb,t jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s#>'{cardStack,stack,-1}';parent jsonb;action text:=t->>'action';eligible jsonb:='[]';tasks jsonb:='[]';a integer;cards jsonb;idx text;begin
 if c is null or t ? 'serial' and t->'serial'<>c->'serial' then return s||jsonb_build_object('_stage4Handled',false);end if;
 if action='continue' then
  if c->>'countered'='true' or c->'responseTo'<>'null'::jsonb and not(c#>'{stage4,counter}' is not null) then return s||jsonb_build_object('_stage4Handled',false);end if;
  for a in select (x#>>'{}')::int from ml_private.arr(s->'order') x loop if jsonb_array_length(ml_private.stage4_counter_cards(s,a,c))>0 then eligible:=eligible||jsonb_build_array(a);end if;end loop;
  if jsonb_array_length(eligible)>0 then
   idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;s:=jsonb_set(s,array['cardStack','stack',idx,'stage4'],coalesce(c->'stage4','{}')||jsonb_build_object('counterOffered',true));
   for a in select (x#>>'{}')::int from ml_private.arr(eligible) x loop tasks:=tasks||jsonb_build_array(ml_private.stage3_task('stage4-counter-window',jsonb_build_object('actor',a,'serial',c->'serial')));end loop;
   s:=ml_private.stage3_prepend(s,tasks||jsonb_build_array(ml_private.stage3_task('stage4-counter-resume',jsonb_build_object('serial',c->'serial'))));return s||jsonb_build_object('_stage4Handled',true);
  end if;
  if c#>'{stage4,counter}' is not null then s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('stage4-counter-effect',jsonb_build_object('serial',c->'serial')),ml_private.stage3_task('cleanup',jsonb_build_object('serial',c->'serial'))));return s||jsonb_build_object('_stage4Handled',true);end if;
  return s||jsonb_build_object('_stage4Handled',false);
 elsif action='stage4-counter-window' then
  a:=(t->>'actor')::int;if c->>'countered'<>'true' then cards:=ml_private.stage4_counter_cards(s,a,c);if jsonb_array_length(cards)>0 then s:=ml_private.select_choice(s,'card-counter',a,at,jsonb_build_object('cards',cards,'data',jsonb_build_object('serial',c->'serial')));end if;end if;
 elsif action='stage4-counter-resume' then
  if c#>'{stage4,counter}' is not null and c->>'countered'<>'true' then s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('stage4-counter-effect',jsonb_build_object('serial',c->'serial')),ml_private.stage3_task('cleanup',jsonb_build_object('serial',c->'serial'))));
  else s:=ml_private.stage3_handle_task_before_stage4(s,ml_private.stage3_task('continue',jsonb_build_object('serial',c->'serial')),at);end if;
 elsif action='stage4-counter-effect' then
  parent:=s#>'{cardStack,stack,-2}';perform ml_private.need(parent is not null and parent->'serial'=c->'responseTo','反制父牌已过期');
  if c->>'countered'<>'true' and ml_private.stage3_card_allowed(s,(parent->>'actor')::int,c->>'definition',c->'effect') then
   idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;s:=jsonb_set(s,array['cardStack','stack',idx,'stage4'],coalesce(c->'stage4','{}')||jsonb_build_object('counterEffective',true));
   if c->>'definition'='basic-028' then s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',parent->'actor','amount',1,'source',c->'actor','category','response')));s:=ml_private.stage3_prepend(s,s->'_triggers');s:=s-'_triggers';end if;
   if c->>'definition'='basic-038' then s:=ml_private.heal(s,(c->>'actor')::int,1,true);end if;
   s:=ml_private.emit(s,'counter','S'||((c->>'actor')::int+1)||' '||(ml_private.stage4_content()#>>array['cards',c->>'definition','name'])||'抵消'||(ml_private.stage4_content()#>>array['cards',parent->>'definition','name']));
  end if;
 elsif action='stage4-deliver' then
  a:=(t->>'actor')::int;if ml_private.stage3_alive(s,a) then
   select coalesce(jsonb_agg(card order by ord),'[]') into cards from jsonb_array_elements(s#>array['players',a::text,'hand']) with ordinality q(card,ord)
   where case when c->>'definition'='basic-011' then ml_private.stage4_content()#>>array['cards',split_part(card#>>'{}','#',1),'type']='attack'
   else ml_private.stage4_content()#>array['cards',split_part(card#>>'{}','#',1),'tags'] ? case when c->>'definition'='basic-012' then '外星' else '普通' end end;
   if jsonb_array_length(cards)>0 then s:=ml_private.select_choice(s,'forced-card',a,at,jsonb_build_object('cards',cards,'source',c->'actor','data',jsonb_build_object('serial',c->'serial')));
   else s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',a,'amount',1,'source',c->'actor','category','attack','directHp',true)));s:=ml_private.stage3_prepend(s,s->'_triggers');s:=s-'_triggers';end if;
  end if;
 else return s||jsonb_build_object('_stage4Handled',false);
 end if;return s||jsonb_build_object('_stage4Handled',true);
end $$;

create or replace function ml_private.stage3_close_card(s jsonb) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare cards jsonb:=s#>'{cardStack,stack}';c jsonb:=cards->-1;parent jsonb:=cards->-2;begin
 if s->>'version'<>'web-v0.1.7' or c#>'{stage4,counter}' is null then return ml_private.stage3_close_card_before_stage4(s);end if;
 perform ml_private.need(c->'counter'='null'::jsonb,'反制尚未结束');perform ml_private.need(parent->'serial'=c->'responseTo','响应父牌已过期');
 if c->>'countered'<>'true' and c#>>'{stage4,counterEffective}'='true' then cards:=jsonb_set(cards,array[(jsonb_array_length(cards)-2)::text,'countered'],'true');end if;
 s:=jsonb_set(s,'{cardStack,stack}',cards-(jsonb_array_length(cards)-1));s:=jsonb_set(s,'{resolving}',(s->'resolving')-(c->>'card'));
 return jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(c->'card'))||jsonb_build_object('_closed',c);
end $$;

create or replace function ml_private.choose(s jsonb,cmd jsonb,at double precision,timeout boolean default false) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s->'choice';a integer:=(c->>'actor')::int;card text:=cmd->>'card';parent jsonb;d jsonb;q jsonb;quoted jsonb;fee jsonb;child jsonb;idx text;begin
 if s->>'version'<>'web-v0.1.7' or c->>'kind' not in ('card-counter','forced-card','board-path','board-cell','board-guess','board-tax','board-return','gear-loss','gear-cloak','gear-reflect','gear-chalk','gear-plant','gear-react','gear-push','gear-terrain') then return ml_private.choose_before_stage4(s,cmd,at,timeout);end if;
 perform ml_private.need(cmd->'choice'=c->'id','选择窗口已过期');perform ml_private.need((cmd->>'actor')::int=a,'请交给待选择的座位操作');
 if c->>'kind' in ('gear-react','gear-push','gear-terrain') then s:=ml_private.stage4_movement_choose(s,cmd,at,timeout);
 elsif c->>'kind' in ('gear-cloak','gear-reflect','gear-chalk','gear-plant') then s:=ml_private.stage4_combat_choose(s,cmd,at,timeout);
 elsif c->>'kind'='gear-loss' then s:=ml_private.stage4_gear_loss_choose(s,cmd,at,timeout);
 elsif c->>'kind' in ('board-path','board-cell','board-guess','board-tax','board-return') then s:=ml_private.stage4_map_choose(s,cmd,at,timeout);
 elsif c->>'kind'='forced-card' then
  if card is not null and card<>'' then
   perform ml_private.need(c->'cards' ? card and s#>array['players',a::text,'hand'] ? card,'必须交出符合要求的手牌');s:=jsonb_set(s,array['players',a::text,'hand'],(s#>array['players',a::text,'hand'])-card);s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(card));s:=ml_private.emit(s,'deliver','S'||(a+1)||' 交出1张牌（不发动牌效）');
  else s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',a,'amount',1,'source',c->'source','category','attack','directHp',true)));s:=ml_private.stage3_prepend(s,s->'_triggers');s:=s-'_triggers';end if;
 elsif card is not null and card<>'' and not timeout then
  parent:=s#>'{cardStack,stack,-1}';perform ml_private.need(ml_private.stage4_counter_cards(s,a,parent) ? card,'此牌不能反制当前效果');d:=ml_private.stage4_content()#>array['cards',split_part(card,'#',1)];q:=s#>array['stage4','costs','locks',card];
  if d#>>'{cost,kind}' in ('die','tiers') then perform ml_private.need(q->'turn'=s#>'{stage3,turn}','请先锁定响应牌费用');end if;
  quoted:=ml_private.stage3_card_cost(s,a,card,(q->>'cost')::int);fee:=ml_private.stage4_fee_plan((s#>>array['players',a::text,'ap'])::int,(quoted->>'cost')::int);
  s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((s#>>array['players',a::text,'ap'])::int-(fee->>'spend')::int));if (fee->>'gain')::int>0 then s:=ml_private.stage3_gain_ap(s,a,(fee->>'gain')::int);s:=s-'_gain';end if;
  s:=jsonb_set(s,array['players',a::text,'hand'],(s#>array['players',a::text,'hand'])-card);s:=jsonb_set(s,'{resolving}',(s->'resolving')||jsonb_build_array(card));
  s:=ml_private.stage3_begin_card(s,a,card,d->>'id',jsonb_build_array(parent->'actor'),quoted->'effect',at,(parent->>'serial')::int);idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;
  s:=jsonb_set(s,array['cardStack','stack',idx,'stage4'],jsonb_build_object('counter',case when d->>'id'='basic-027' then 'tactic' when d->>'id'='basic-028' then 'jianmin' else 'food' end));child:=s#>'{cardStack,stack,-1}';
  s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('counter',jsonb_build_object('serial',child->'serial')),ml_private.stage3_task('continue',jsonb_build_object('serial',child->'serial'))));
  s:=ml_private.emit(s,'response','S'||(a+1)||' 使用'||(d->>'name')||'，支付'||(fee->>'spend')||'AP'||case when (fee->>'gain')::int>0 then '，获得'||(fee->>'gain')||'AP' else '' end);
 end if;
 if timeout then s:=ml_private.emit(s,'timeout',ml_private.name(s,a)||' 选择超时：'||(c->>'kind'));end if;
 s:=s||jsonb_build_object('choice',null,'phase','resolving');s:=ml_private.pump(s,at);
 if s->'choice'='null'::jsonb and jsonb_array_length(s->'queue')=0 and s->>'phase'='resolving' and s->'movement'='null'::jsonb and ml_private.stage3_alive(s,(s->>'active')::int) then s:=jsonb_set(s,'{phase}','"action"');s:=ml_private.resume(s,at);end if;return s;
end $$;
