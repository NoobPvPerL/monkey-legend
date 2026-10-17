create or replace function ml_private.stage3_begin_card(s jsonb,a integer,card text,definition text,targets jsonb,effect jsonb,at double precision,response_to integer default null) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare flow jsonb:=s->'cardStack'; parent jsonb:=(flow->'stack')->-1; easy integer; pending jsonb;begin
 perform ml_private.need(at>=0 and at<'Infinity'::double precision,'卡牌窗口时钟无效');
 perform ml_private.need(s->'resolving' ? card and not exists(select 1 from ml_private.arr(flow->'stack') c where c->>'card'=card),'待结算实体牌无效');
 if response_to is not null then perform ml_private.need((parent->>'serial')::int=response_to and parent->'counter'='null'::jsonb,'父牌尚不可响应');end if;
 select (p->>'seat')::int into easy from ml_private.arr(s->'players') p where (p->>'hp')::int>0 and p->>'character'='character-002' and (p->>'ap')::int>=1 limit 1;
 pending:=jsonb_build_object('serial',(flow->>'serial')::int+1,'actor',a,'card',card,'definition',definition,'targets',targets,'effect',effect,'cancelled','[]'::jsonb,'elbows','[]'::jsonb,'countered',false,'counter',case when easy is null then null else jsonb_build_object('actor',easy,'deadline',at+10000) end,'responseTo',response_to,'responseActor',case when response_to is null then null else a end);
 return jsonb_set(s,'{cardStack}',jsonb_build_object('serial',pending->'serial','stack',(flow->'stack')||jsonb_build_array(pending)));
end $$;
create or replace function ml_private.stage3_counter_card(s jsonb,a integer,accept boolean,at double precision,rolled integer) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare stack jsonb:=s#>'{cardStack,stack}'; position text:=(jsonb_array_length(stack)-1)::text; pending jsonb:=stack->-1; counter_window jsonb:=pending->'counter'; p jsonb:=s->'players'->a; result jsonb; begin
 perform ml_private.need(counter_window<>'null'::jsonb and (counter_window->>'actor')::int=a,'不是当前反制者');perform ml_private.need(at<=(counter_window->>'deadline')::double precision,'反制窗口已过期');
 if not accept or at=(counter_window->>'deadline')::double precision then pending:=jsonb_set(pending,'{counter}','null');result:='{"attempted":false,"roll":null,"cancelled":false,"done":true}';
 else
  perform ml_private.need((p->>'hp')::int>0 and p->>'character'='character-002' and (p->>'ap')::int>=1,'反制费用不足');perform ml_private.need(rolled between 1 and 6,'反制骰子无效');
  s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((p->>'ap')::int-1));pending:=jsonb_set(pending,'{countered}',to_jsonb(rolled>=3));
  if rolled>=3 or (p->>'ap')::int=1 then pending:=jsonb_set(pending,'{counter}','null');end if;
  result:=jsonb_build_object('attempted',true,'roll',rolled,'cancelled',pending->'countered','done',pending->'counter'='null'::jsonb);
 end if;
 return jsonb_set(s,array['cardStack','stack',position],pending)||jsonb_build_object('_counterResult',result);
end $$;
create or replace function ml_private.stage3_close_card(s jsonb) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare stack jsonb:=s#>'{cardStack,stack}'; pending jsonb:=stack->-1; parent jsonb:=stack->-2; index_text text; a jsonb;begin
 perform ml_private.need(pending is not null,'没有待结算卡牌');perform ml_private.need(pending->'counter'='null'::jsonb,'反制尚未结束');
 if pending->'responseTo'<>'null'::jsonb then
  perform ml_private.need(parent->'serial'=pending->'responseTo','响应父牌已过期');
  if pending->>'countered'<>'true' then a:=pending->'responseActor';if not (parent->'cancelled' @> jsonb_build_array(a)) then parent:=jsonb_set(parent,'{cancelled}',(parent->'cancelled')||jsonb_build_array(a));end if;if pending->>'definition'='basic-002' then parent:=jsonb_set(parent,'{elbows}',(parent->'elbows')||jsonb_build_array(a));end if;stack:=jsonb_set(stack,array[(jsonb_array_length(stack)-2)::text],parent);end if;
 end if;
 s:=jsonb_set(s,'{cardStack,stack}',stack-(jsonb_array_length(stack)-1));s:=jsonb_set(s,'{resolving}',(s->'resolving')-(pending->>'card'));return jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(pending->'card'))||jsonb_build_object('_closed',pending);
end $$;
