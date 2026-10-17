create or replace function ml_private.stage4_reserve_interrupt(s jsonb,cmd jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare a integer:=(cmd->>'actor')::int;p jsonb:=s->'players'->a;card text:=cmd->>'card';quoted jsonb;reserved integer:=0;begin
 perform ml_private.need(split_part(card,'#',1)='basic-017' and p->'hand' ? card and ml_private.stage4_on_board(s,a),'当前不能提交插队意图');
 perform ml_private.need(cmd->'targets'='[]'::jsonb and not(cmd ? 'as'),'插队不接受目标或转换');perform ml_private.need(p->>'character'<>'character-005','QB不能使用建民牌');
 perform ml_private.need((s->>'active')::int<>a or s#>>array['stage3','breadBlocked',a::text]<>'true','本个人回合不能主动出牌');perform ml_private.need(ml_private.stage4_location_card(s,a,'basic-017'),'当前位置禁止使用插队');
 quoted:=ml_private.stage3_card_cost(s,a,card);
 if (s->>'active')::int=a and s#>>'{movement,costDue}'='true' and jsonb_array_length(s#>'{movement,path}')>1 then reserved:=1;end if;
 perform ml_private.need((p->>'ap')::int>=(quoted->>'cost')::int+reserved,'插队费用不足或须保留移动结算AP');
 p:=p||jsonb_build_object('ap',(p->>'ap')::int-(quoted->>'cost')::int,'hand',(p->'hand')-card);s:=ml_private.put_player(s,a,p);s:=jsonb_set(s,'{resolving}',(s->'resolving')||jsonb_build_array(card));
 s:=jsonb_set(s,'{stage4,interrupts}',(s#>'{stage4,interrupts}')||jsonb_build_array(jsonb_build_object('actor',a,'card',card,'effect',quoted->'effect','team',p->'team')));
 return ml_private.emit(s,'interrupt-intent','S'||(a+1)||' 提交插队意图，支付'||(quoted->>'cost')||'AP，等待当前效果链结束',jsonb_build_object('actor',a,'card',card));
end $$;
create or replace function ml_private.stage4_begin_interrupt(s jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare intent jsonb;pending jsonb;idx text;phase text;boundary text;begin
 if jsonb_array_length(s->'queue')=1 and s#>>'{queue,0,kind}' in ('next','round-next') then boundary:=s#>>'{queue,0,kind}';end if;
 if s#>'{stage4,interruptTurn}'<>'null'::jsonb or s->'choice'<>'null'::jsonb or (jsonb_array_length(s->'queue')>0 and boundary is null) or jsonb_array_length(s#>'{cardStack,stack}')>0 or jsonb_array_length(s#>'{stage4,interrupts}')=0 then return s||jsonb_build_object('_interruptBegan',false);end if;
 intent:=s#>'{stage4,interrupts,0}';s:=jsonb_set(s,'{stage4,interrupts}',(s#>'{stage4,interrupts}')-0);
 if not ml_private.stage4_on_board(s,(intent->>'actor')::int) then
  s:=jsonb_set(s,'{resolving}',(s->'resolving')-(intent->>'card'));s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(intent->'card'));s:=ml_private.emit(s,'interrupt-expired','S'||((intent->>'actor')::int+1)||' 已离场或淘汰，插队意图失效');return s||jsonb_build_object('_interruptBegan',true);
 end if;
 phase:=case when s->'movement'<>'null'::jsonb then 'moving' else 'action' end;
 s:=ml_private.stage3_begin_card(s,(intent->>'actor')::int,intent->>'card','basic-017','[]',intent->'effect',at);idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;
 s:=jsonb_set(s,array['cardStack','stack',idx,'stage4'],jsonb_build_object('interrupt',true,'resumePhase',phase,'cardTeam',intent->'team')||case when boundary is not null then jsonb_build_object('finishBoundary',boundary) else '{}'::jsonb end);if boundary is not null then s:=jsonb_set(s,'{queue}','[]');end if;s:=jsonb_set(s,'{phase}','"resolving"');pending:=s#>'{cardStack,stack,-1}';
 s:=ml_private.emit(s,'interrupt-start','S'||((intent->>'actor')::int+1)||' 插队进入反制窗口');s:=jsonb_set(s,'{queue}',(s->'queue')||jsonb_build_array(ml_private.stage3_task('counter',jsonb_build_object('serial',pending->'serial')),ml_private.stage3_task('continue',jsonb_build_object('serial',pending->'serial'))));return s||jsonb_build_object('_interruptBegan',true);
end $$;
create or replace function ml_private.stage4_interrupt_task(s jsonb,t jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s#>'{cardStack,stack,-1}';history jsonb;team text;closed jsonb;active integer:=(s->>'active')::int;begin
 if c is null or c->>'definition'<>'basic-017' or t ? 'serial' and t->'serial'<>c->'serial' then return s||jsonb_build_object('_interruptHandled',false);end if;
 if t->>'action'='effect' then
  team:=c#>>'{stage4,cardTeam}';history:=coalesce(s#>array['stage3','combos',team],'[]');if not(history ? 'basic-017') then s:=jsonb_set(s,array['stage3','combos',team],history||jsonb_build_array('basic-017'));end if;
  s:=jsonb_set(s,'{stage4,interruptTurn}',c->'actor');s:=ml_private.emit(s,'interrupt','S'||((c->>'actor')::int+1)||' 插队成功，结束当前个人回合后开启新整轮');s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('cleanup',jsonb_build_object('serial',c->'serial'))));
 elsif t->>'action'='cleanup' then
  s:=ml_private.stage3_close_card(s);closed:=s->'_closed';s:=jsonb_set(s-'_closed','{attack}','null');s:=ml_private.finish(s,false,at);if s->>'phase'='over' then return s||jsonb_build_object('_interruptHandled',true);end if;
  if closed#>>'{stage4,finishBoundary}' is not null then s:=jsonb_set(s,'{phase}','"resolving"');if closed->>'countered'<>'true' and closed#>>'{stage4,finishBoundary}'='round-next' then s:=jsonb_set(s,'{stage4,interruptSkipEnd}','true');end if;s:=ml_private.stage3_prepend(s,jsonb_build_array(jsonb_build_object('kind',case when closed->>'countered'='true' then closed#>>'{stage4,finishBoundary}' else 'next' end)));
  elsif closed->>'countered'='true' then
   if not ml_private.stage3_alive(s,active) then s:=jsonb_set(s,'{phase}','"resolving"');s:=ml_private.stage3_prepend(s,jsonb_build_array(jsonb_build_object('kind','next')));
   else s:=jsonb_set(s,'{phase}',closed#>'{stage4,resumePhase}');if s#>'{clock,since}'='null'::jsonb then s:=jsonb_set(s,'{clock,since}',to_jsonb(at));end if;end if;
  else s:=jsonb_set(s,'{phase}','"resolving"');s:=ml_private.end_turn(s,at);end if;
 else return s||jsonb_build_object('_interruptHandled',false);
 end if;return s||jsonb_build_object('_interruptHandled',true);
end $$;

create or replace function ml_private.stage4_discard_interrupts(s jsonb) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare packet jsonb;begin
 for packet in select * from ml_private.arr(s#>'{stage4,interrupts}') loop s:=jsonb_set(s,'{resolving}',(s->'resolving')-(packet->>'card'));s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(packet->'card'));end loop;
 s:=jsonb_set(s,'{stage4,interrupts}','[]');return jsonb_set(s,'{stage4,interruptTurn}','null');
end $$;
