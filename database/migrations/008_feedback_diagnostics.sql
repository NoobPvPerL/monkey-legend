-- Third-batch known fixes only. No classic-map activation or unconfirmed mechanics.
-- Fail closed when the schema-2 installation omitted the 007 rule patch.
do $$ begin
 if to_regprocedure('ml_private.rule_card(jsonb,text)') is null or
    position('web-v0.1.2' in pg_get_functiondef('ml_private.resolve_attack(jsonb)'::regprocedure))=0 then
  raise exception 'Apply 007_feedback_rules.sql before 008_feedback_diagnostics.sql';
 end if;
end $$;
insert into ml_private.catalog(key,value) values ('classicLayout','[{"id":"r1c1","row":1,"col":1,"region":"高唐农场"},{"id":"r1c2","row":1,"col":2,"region":"教学楼"},{"id":"r1c3","row":1,"col":3,"region":"教学楼"},{"id":"r1c4","row":1,"col":4,"region":"秀松苑"},{"id":"r1c5","row":1,"col":5,"region":"秀松苑"},{"id":"r1c6","row":1,"col":6,"region":"尚德荟"},{"id":"r1c7","row":1,"col":7,"region":"食堂"},{"id":"r1c8","row":1,"col":8,"region":"飞船"},{"id":"r2c1","row":2,"col":1,"region":"XDF"},{"id":"r2c2","row":2,"col":2,"region":"教学楼"},{"id":"r2c3","row":2,"col":3,"region":"教学楼"},{"id":"r2c4","row":2,"col":4,"region":"操场"},{"id":"r2c5","row":2,"col":5,"region":"秀松苑"},{"id":"r2c6","row":2,"col":6,"region":"秀松苑"},{"id":"r2c7","row":2,"col":7,"region":"食堂"},{"id":"r2c8","row":2,"col":8,"region":"山洞"},{"id":"r3c1","row":3,"col":1,"region":"帝汶岛"},{"id":"r3c2","row":3,"col":2,"region":"帝汶岛"},{"id":"r3c3","row":3,"col":3,"region":"红素洋"},{"id":"r3c4","row":3,"col":4,"region":"操场"},{"id":"r3c5","row":3,"col":5,"region":"樱花大道"},{"id":"r3c6","row":3,"col":6,"region":"樱花大道"},{"id":"r3c7","row":3,"col":7,"region":"樱花大道"},{"id":"r3c8","row":3,"col":8,"region":"樱花大道"},{"id":"r4c1","row":4,"col":1,"region":"帝汶岛"},{"id":"r4c2","row":4,"col":2,"region":"帝汶岛"},{"id":"r4c3","row":4,"col":3,"region":"红素洋"},{"id":"r4c4","row":4,"col":4,"region":"办公室"},{"id":"r4c5","row":4,"col":5,"region":"办公室"},{"id":"r4c6","row":4,"col":6,"region":"淘安泽"},{"id":"r4c7","row":4,"col":7,"region":"淘安泽"},{"id":"r4c8","row":4,"col":8,"region":"云上学府"}]'::jsonb) on conflict(key) do update set value=excluded.value;

create or replace function ml_private.resolve_attack(s jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare attack jsonb:=s->'attack'; d jsonb:=ml_private.card(attack->>'card'); hits jsonb:='[]'; targets jsonb; p jsonb; a integer:=(attack->>'actor')::int; t integer; actor integer; roll integer:=0; paid integer; amount integer; before_hp jsonb; triggers jsonb; healing integer:=0; begin
 select coalesce(jsonb_agg(x),'[]') into targets from ml_private.arr(attack->'targets') x where not (attack->'cancelled' @> jsonb_build_array(x));
 if jsonb_array_length(targets)>0 and d->>'id' in ('basic-006','basic-009') then s:=ml_private.die(s,d->>'name'); roll:=(s->>'_roll')::int; s:=s-'_roll'; end if;
 for t in select ml_private.n(x)::int from ml_private.arr(targets) x loop p:=s->'players'->t;
  if d ? 'power' then amount:=greatest(0,(d->>'power')::int-(p->>'ap')::int); paid:=least((d->>'power')::int,(p->>'ap')::int); p:=p||jsonb_build_object('ap',(p->>'ap')::int-paid); s:=ml_private.put_player(s,t,p); s:=ml_private.emit(s,'ap',ml_private.name(s,t)||' 被扣'||paid||'AP → '||(p->>'ap')); if amount>0 then hits:=hits||jsonb_build_array(jsonb_build_object('target',t,'amount',amount,'source',a,'category','attack')); end if;
  elsif d->>'id'='basic-008' then
   if (p->>'ap')::int=0 then hits:=hits||jsonb_build_array(jsonb_build_object('target',t,'amount',1,'source',a,'category','attack'));
   else paid:=case when s->>'version'='web-v0.1.2' then (p->>'ap')::int else least(2,(p->>'ap')::int) end; s:=ml_private.put_player(s,t,p||jsonb_build_object('ap',(p->>'ap')::int-paid)); s:=ml_private.put_player(s,a,(s->'players'->a)||jsonb_build_object('ap',(s->'players'->a->>'ap')::int+paid)); s:=ml_private.emit(s,'ap',case when s->>'version'='web-v0.1.2' then ml_private.name(s,a)||' 头锤：从'||ml_private.name(s,t)||'吸收全部'||paid||'AP（目标AP '||paid||'→0）' else ml_private.name(s,a)||' 从'||ml_private.name(s,t)||'吸收'||paid||'AP' end); end if;
  elsif roll>=4 then hits:=hits||jsonb_build_array(jsonb_build_object('target',t,'amount',1,'source',a,'category','attack')); end if;
 end loop;
 for actor in select ml_private.n(x)::int from ml_private.arr(attack->'elbows') x loop p:=s->'players'->a;
  if (p->>'ap')::int=0 then hits:=hits||jsonb_build_array(jsonb_build_object('target',a,'amount',1,'source',actor,'category','response'));
  else paid:=least(2,(p->>'ap')::int); s:=ml_private.put_player(s,a,p||jsonb_build_object('ap',(p->>'ap')::int-paid)); s:=ml_private.put_player(s,actor,(s->'players'->actor)||jsonb_build_object('ap',(s->'players'->actor->>'ap')::int+paid)); s:=ml_private.emit(s,'ap',ml_private.name(s,actor)||' 肘击反吸'||paid||'AP'); end if;
 end loop;
 before_hp:=s->'players'; s:=ml_private.damage(s,hits); triggers:=s->'_triggers'; s:=s-'_triggers';
 if d->>'id'='basic-006' and (s->'players'->a->>'hp')::int>0 then for t in select ml_private.n(x)::int from ml_private.arr(targets) x loop healing:=healing+(before_hp->t->>'hp')::int-(s->'players'->t->>'hp')::int; end loop; s:=ml_private.heal(s,a,healing); end if;
 if roll>0 and roll<4 then s:=ml_private.emit(s,'miss',(d->>'name')||' 未命中'); end if;
 return s||jsonb_build_object('queue',triggers||jsonb_build_array(jsonb_build_object('kind','cleanup'))||(s->'queue'));
end $$;

create or replace function public.ml_health() returns jsonb language sql security definer
set search_path=pg_catalog as $$ select jsonb_build_object('ok',true,'schemaVersion',2,'engineRevision',8,'feedbackRulesReady',
 to_regprocedure('ml_private.rule_card(jsonb,text)') is not null and position('web-v0.1.2' in pg_get_functiondef('ml_private.resolve_attack(jsonb)'::regprocedure))>0,
 'ruleVersion','web-v0.1.2','legacyRuleVersion','web-v0.1.1','engine','postgresql','features',jsonb_build_array('deferred-movement','spectators','chat','feedback-rules','classic-layout-data')) $$;
revoke all on all functions in schema ml_private from public;
do $$ declare role_name text; begin
 foreach role_name in array array['anon','authenticated'] loop
  execute format('revoke all on all functions in schema ml_private from %I',role_name);
 end loop;
end $$;
