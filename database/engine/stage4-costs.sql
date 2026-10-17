-- Private stage-four quotation primitives. No public room/dispatch activation.
create or replace function ml_private.stage4_content() returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select value from ml_private.catalog where key='stage4:foundation-v1' $$;

create or replace function ml_private.stage4_cost_ledger(s jsonb) returns void language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ begin
 perform ml_private.need(jsonb_typeof(s)='object' and jsonb_typeof(s->'turn')='number' and
  s->>'turn' ~ '^(0|[1-9][0-9]*)$' and (s->>'turn')::numeric<=9007199254740991 and jsonb_typeof(s->'locks')='object','费用账本无效');
end $$;

create or replace function ml_private.stage4_cost_card(card text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare d jsonb;begin
 perform ml_private.need(card ~ '^basic-[0-9]{3}#[0-9]{2,}$','实体牌格式无效');
 d:=ml_private.stage4_content()#>array['cards',split_part(card,'#',1)];
 perform ml_private.need(d is not null,'卡牌不在阶段四目录');return d;
end $$;

create or replace function ml_private.stage4_cost_die(spec jsonb,roll integer) returns integer language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare n integer;begin
 perform ml_private.need(roll between 1 and 6,'费用骰子必须为1—6');
 if spec->>'kind'='die' then return roll;end if;
 perform ml_private.need(spec->>'kind'='tiers','这张牌不使用费用骰子');n:=jsonb_array_length(spec->'values');
 return (spec->'values'->>floor((roll-1)*n/6.0)::integer)::integer;
end $$;

-- A future dispatch calls this BEFORE consuming a transaction RNG value.
create or replace function ml_private.stage4_cost_needs_roll(s jsonb,card text) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare d jsonb:=ml_private.stage4_cost_card(card);begin
 perform ml_private.stage4_cost_ledger(s);
 return d#>>'{cost,kind}' in ('die','tiers') and coalesce(s#>array['locks',card,'turn']<>s->'turn',true);
end $$;

create or replace function ml_private.stage4_cost_quote(s jsonb,a integer,card text,owned jsonb,roll integer default null,x bigint default null)
returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$
declare d jsonb;spec jsonb;old jsonb;q jsonb;cost bigint;begin
 perform ml_private.stage4_cost_ledger(s);perform ml_private.need(a between 0 and 3,'费用玩家无效');
 d:=ml_private.stage4_cost_card(card);spec:=d->'cost';
 perform ml_private.need(jsonb_typeof(owned)='array' and owned @> jsonb_build_array(card),'手中没有该实体牌');
 if spec->>'kind'='variable' then
  perform ml_private.need(x between 1 and 9007199254740991,'X必须为正整数');q:=jsonb_build_object('cost',x,'die',null,'cached',false);
 else
  perform ml_private.need(x is null,'此牌不接受X');
  if spec->>'kind'='fixed' then q:=jsonb_build_object('cost',spec->'value','die',null,'cached',false);
  else
   old:=s#>array['locks',card];
   if old->'turn'=s->'turn' then
    perform ml_private.need(jsonb_typeof(old->'die')='number' and old->>'die' ~ '^[1-6]$' and old->'cost'=to_jsonb(ml_private.stage4_cost_die(spec,(old->>'die')::integer)),'锁定费用无效');
    q:=jsonb_build_object('cost',old->'cost','die',old->'die','cached',true);
   else
    cost:=ml_private.stage4_cost_die(spec,roll);
    s:=jsonb_set(s,array['locks',card],jsonb_build_object('turn',s->'turn','die',roll,'cost',cost));
    q:=jsonb_build_object('cost',cost,'die',roll,'cached',false);
   end if;
  end if;
 end if;return jsonb_build_object('ledger',s,'quote',q);
end $$;

create or replace function ml_private.stage4_cost_turn(s jsonb,turn_number bigint) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ begin
 perform ml_private.stage4_cost_ledger(s);
 perform ml_private.need(turn_number>(s->>'turn')::bigint and turn_number<=9007199254740991,'个人回合编号必须递增');
 return jsonb_build_object('turn',turn_number,'locks','{}'::jsonb);
end $$;

create or replace function ml_private.stage4_fee_plan(ap bigint,quoted bigint,positive_free boolean default false,variable boolean default false)
returns jsonb language plpgsql immutable set search_path=pg_catalog,ml_private as $$ declare cost bigint;begin
 perform ml_private.need(ap between 0 and 9007199254740991 and quoted between -9007199254740991 and 9007199254740991,'AP与费用必须为整数');
 perform ml_private.need(positive_free is not null and variable is not null,'费用修饰无效');
 if variable then perform ml_private.need(quoted>=1,'X必须为正整数');end if;
 cost:=case when positive_free and not variable and quoted>0 then 0 else quoted end;
 perform ml_private.need(cost<=ap,'AP不足');return jsonb_build_object('cost',cost,'spend',greatest(0,cost),'gain',greatest(0,-cost));
end $$;
