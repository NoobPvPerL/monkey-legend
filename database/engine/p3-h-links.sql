-- H030 preparation only. No public entry, runtime catalog activation or migration.
create or replace function ml_private.p3h_link_initial() returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$
 select '{"used":[false,false,false,false],"serial":0,"muted":false,"pending":null,"links":[]}'::jsonb
$$;
create or replace function ml_private.p3h_link_init(s jsonb) returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$
 select case when s#>'{stage3,h,cooperation}' is null then jsonb_set(s,'{stage3,h,cooperation}',ml_private.p3h_link_initial()) else s end
$$;
create or replace function ml_private.p3h_cooperate_targets(s jsonb,a integer) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$
 select coalesce(jsonb_agg(v order by n),'[]') from jsonb_array_elements(s->'order') with ordinality q(v,n)
 where ml_private.p3h_enabled(s) and s#>>array['players',a::text,'character']='character-030' and ml_private.stage4_on_board(s,a)
 and jsonb_array_length(s#>array['players',a::text,'hand'])>0 and ml_private.p3h_active_allowed(s,a)
 and (v#>>'{}')::int<>a and ml_private.stage4_on_board(s,(v#>>'{}')::int) and jsonb_array_length(s#>array['players',v#>>'{}','hand'])>0
 and ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',a,'roleModifiers','[]'::jsonb),(v#>>'{}')::int,s#>>array['players',v#>>'{}','character'])
$$;
create or replace function ml_private.p3h_cooperate_begin(s jsonb,a integer,target integer,cards jsonb) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$
declare id integer;h jsonb;n integer:=jsonb_array_length(cards);begin
 perform ml_private.need(ml_private.p3h_enabled(s),'南南合作仅限H版本');s:=ml_private.p3h_link_init(s);h:=s#>'{stage3,h,cooperation}';
 perform ml_private.need(s->>'phase'='action' and s->'choice'='null'::jsonb and (s->>'active')::int=a and h#>>array['used',a::text]='false' and h->'pending'='null'::jsonb and ml_private.p3h_cooperate_targets(s,a) @> jsonb_build_array(target),'南南合作次数、角色或目标不合法');
 perform ml_private.need(n>0 and n<=jsonb_array_length(s#>array['players',target::text,'hand']) and n=(select count(distinct v) from ml_private.arr(cards) v) and not exists(select 1 from ml_private.arr(cards) v where not(s#>array['players',a::text,'hand'] @> jsonb_build_array(v))),'请选择双方可等量交换的自己手牌');
 id:=(h->>'serial')::int+1;h:=jsonb_set(h,array['used',a::text],'true')||jsonb_build_object('serial',id,'pending',jsonb_build_object('id',id,'actor',a,'target',target,'cards',cards));s:=jsonb_set(s,'{stage3,h,cooperation}',h);
 return s||jsonb_build_object('_hLinkOffer',jsonb_build_object('source',a,'count',n,'cards',s#>array['players',target::text,'hand'],'data',jsonb_build_object('id',id)));
end $$;
create or replace function ml_private.p3h_cooperate_commit(s jsonb,a integer,id integer,cards jsonb,timeout boolean default false) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$
declare h jsonb;d jsonb;n integer;chosen jsonb;actor integer;hand_a jsonb;hand_b jsonb;links jsonb;begin
 s:=ml_private.p3h_link_init(s);h:=s#>'{stage3,h,cooperation}';d:=h->'pending';
 perform ml_private.need(d<>'null'::jsonb and (d->>'id')::int=id and (d->>'target')::int=a,'南南合作交换已失效');actor:=(d->>'actor')::int;n:=jsonb_array_length(d->'cards');chosen:=cards;
 if timeout then select coalesce(jsonb_agg(v order by v),'[]') into chosen from (select v from ml_private.arr(s#>array['players',a::text,'hand']) v order by v limit n) q;end if;
 perform ml_private.need(ml_private.stage4_on_board(s,actor) and ml_private.stage4_on_board(s,a) and jsonb_array_length(chosen)=n and n=(select count(distinct v) from ml_private.arr(chosen) v) and not exists(select 1 from ml_private.arr(chosen) v where not(s#>array['players',a::text,'hand'] @> jsonb_build_array(v))) and not exists(select 1 from ml_private.arr(d->'cards') v where not(s#>array['players',actor::text,'hand'] @> jsonb_build_array(v))),'南南合作交换手牌已变化');
 select coalesce(jsonb_agg(v order by ord),'[]') into hand_a from jsonb_array_elements(s#>array['players',actor::text,'hand']) with ordinality q(v,ord) where not(d->'cards' @> jsonb_build_array(v));
 select coalesce(jsonb_agg(v order by ord),'[]') into hand_b from jsonb_array_elements(s#>array['players',a::text,'hand']) with ordinality q(v,ord) where not(chosen @> jsonb_build_array(v));
 s:=jsonb_set(jsonb_set(s,array['players',actor::text,'hand'],hand_a||chosen),array['players',a::text,'hand'],hand_b||(d->'cards'));
 select coalesce(jsonb_agg(v order by ord),'[]') into links from jsonb_array_elements(h->'links') with ordinality q(v,ord) where (v->>'actor')::int<>actor;
 h:=h||jsonb_build_object('pending',null,'links',links||jsonb_build_array(jsonb_build_object('actor',actor,'target',a,'untilEnd',(s#>>array['stage3','ends',actor::text])::int+2)));s:=jsonb_set(s,'{stage3,h,cooperation}',h);
 return s||jsonb_build_object('_hLinkResult',jsonb_build_object('actor',actor,'target',a,'count',n));
end $$;
create or replace function ml_private.p3h_cooperate_health(s jsonb,a integer,amount integer,kind text) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$
declare h jsonb:=s#>'{stage3,h,cooperation}';l jsonb;target integer;jobs jsonb:='[]';actor integer;begin
 if not ml_private.p3h_enabled(s) or amount<=0 or h is null or h->>'muted'='true' then return jobs;end if;
 for l in select v from ml_private.arr(h->'links') v loop
  actor:=(l->>'actor')::int;if not ml_private.stage4_on_board(s,actor) or s#>>array['stage4','offMap',l->>'target']='true' or (s#>>array['stage3','ends',l->>'actor'])::int>=(l->>'untilEnd')::int then continue;end if;
  target:=case when (l->>'target')::int=a then actor when kind='heal' and actor=a then (l->>'target')::int else null end;
  if target is null or not ml_private.stage4_on_board(s,target) then continue;end if;
  jobs:=jobs||jsonb_build_array(ml_private.stage3_task('h-link-mirror',jsonb_build_object('actor',actor,'target',target,'data',jsonb_build_object('amount',amount,'kind',kind))));
 end loop;return jobs;
end $$;
create or replace function ml_private.p3h_cooperate_start(s jsonb,a integer) returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$
 select case when s->>'version'='web-v0.1.19' and s#>'{stage3,h,cooperation}' is not null then jsonb_set(s,array['stage3','h','cooperation','used',a::text],'false') else s end
$$;
create or replace function ml_private.p3h_cooperate_cleanup(s jsonb,deaths boolean default false) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$
declare links jsonb;begin
 if not ml_private.p3h_enabled(s) or s#>'{stage3,h,cooperation}' is null then return s;end if;
 select coalesce(jsonb_agg(v order by n),'[]') into links from jsonb_array_elements(s#>'{stage3,h,cooperation,links}') with ordinality q(v,n)
 where case when deaths then (s#>>array['players',v->>'actor','hp'])::int>0 and (s#>>array['players',v->>'target','hp'])::int>0 else (s#>>array['stage3','ends',v->>'actor'])::int<(v->>'untilEnd')::int end;
 return jsonb_set(s,'{stage3,h,cooperation,links}',links);
end $$;
-- H030 private command integration, never installed by a numbered migration.
create or replace function ml_private.p3h_cooperate_action(s jsonb,a integer) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$
 select jsonb_build_object('available',s->>'phase'='action' and s->'choice'='null'::jsonb and (s->>'active')::int=a and not coalesce((s#>>array['stage3','h','cooperation','used',a::text])::boolean,false) and jsonb_array_length(ml_private.p3h_cooperate_targets(s,a))>0,'used',coalesce((s#>>array['stage3','h','cooperation','used',a::text])::boolean,false),'targets',ml_private.p3h_cooperate_targets(s,a))
$$;
create or replace function ml_private.p3h_cooperate_public(s jsonb) returns jsonb language sql immutable set search_path=pg_catalog,ml_private as $$
 select case when s#>'{stage3,h,cooperation}' is null then 'null'::jsonb else jsonb_build_object('used',s#>'{stage3,h,cooperation,used}','links',s#>'{stage3,h,cooperation,links}') end
$$;
create or replace function ml_private.p3h_cooperate_skill(s jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$
declare a integer:=(cmd->>'actor')::int;target integer:=(cmd->>'target')::int;offer jsonb;begin
 s:=ml_private.p3h_cooperate_begin(s,a,target,coalesce(cmd->'cards','[]'));offer:=s->'_hLinkOffer';s:=s-'_hLinkOffer';
 s:=ml_private.emit(s,'skill','S'||(a+1)||' 南南合作：与S'||(target+1)||'交换'||(offer->>'count')||'张手牌，等待对方选牌');return ml_private.select_choice(s,'h-cooperate',target,at,offer);
end $$;
create or replace function ml_private.p3h_cooperate_choose(s jsonb,cmd jsonb,timeout boolean) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$
declare result jsonb;begin
 if not ml_private.p3h_enabled(s) or s#>>'{choice,kind}'<>'h-cooperate' then return s||jsonb_build_object('_hHandled',false);end if;
 s:=ml_private.p3h_cooperate_commit(s,(s#>>'{choice,actor}')::int,(s#>>'{choice,data,id}')::int,coalesce(cmd->'cards','[]'),timeout);result:=s->'_hLinkResult';s:=s-'_hLinkResult';
 return ml_private.emit(s,'transfer','S'||((result->>'actor')::int+1)||' 南南合作：与S'||((result->>'target')::int+1)||'交换'||(result->>'count')||'张手牌，建立联系')||jsonb_build_object('_hHandled',true);
end $$;
create or replace function ml_private.p3h_cooperate_heal(s jsonb,a integer,amount integer) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$
declare jobs jsonb:=ml_private.p3h_cooperate_health(s,a,amount,'heal');idx integer:=0;q jsonb:=s->'queue';head jsonb;tail jsonb;begin
 if jsonb_array_length(jobs)=0 then return s;end if;
 while q->idx->>'action'='h-link-mirror' loop idx:=idx+1;end loop;
 select coalesce(jsonb_agg(v order by n),'[]') into head from jsonb_array_elements(q) with ordinality z(v,n) where n<=idx;
 select coalesce(jsonb_agg(v order by n),'[]') into tail from jsonb_array_elements(q) with ordinality z(v,n) where n>idx;
 return jsonb_set(s,'{queue}',head||jobs||tail);
end $$;
create or replace function ml_private.p3h_cooperate_pending(s jsonb) returns boolean language sql stable set search_path=pg_catalog,ml_private as $$
 select ml_private.p3h_enabled(s) and (coalesce(s#>>'{stage3,h,cooperation,muted}','false')='true' or exists(select 1 from ml_private.arr(s->'queue') t where t->>'action'='h-link-mirror'))
$$;
create or replace function ml_private.p3h_cooperate_task(s jsonb,t jsonb) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$
declare a integer:=(t->>'actor')::int;target integer:=(t->>'target')::int;d jsonb:=t->'data';begin
 if not ml_private.p3h_enabled(s) or t->>'action' not in ('h-link-mirror','h-link-done') then return s||jsonb_build_object('_hHandled',false);end if;
 s:=ml_private.p3h_link_init(s)||jsonb_build_object('_hHandled',true);
 if t->>'action'='h-link-done' then return jsonb_set(s,'{stage3,h,cooperation,muted}','false');end if;
 if not ml_private.stage4_on_board(s,a) or not ml_private.stage4_on_board(s,target) or not ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',a,'roleModifiers','[]'::jsonb),target,s#>>array['players',target::text,'character']) then return s;end if;
 perform ml_private.need(s#>>'{stage3,h,cooperation,muted}'='false','南南合作镜像不可递归');s:=jsonb_set(s,'{stage3,h,cooperation,muted}','true');s:=ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('h-link-done','{}')));
 s:=ml_private.emit(s,'skill','S'||(a+1)||' 南南合作：向S'||(target+1)||'同步'||case when d->>'kind'='heal' then '治疗' else '失血' end||(d->>'amount'));
 if d->>'kind'='heal' then return ml_private.heal(s,target,(d->>'amount')::int);end if;
 s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',target,'amount',d->'amount','source',a,'category','response')));return ml_private.stage3_prepend(s,s->'_triggers')-'_triggers';
end $$;
