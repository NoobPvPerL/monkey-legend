-- Private H activation policy; never rewrites saved G rules or committed effects.
create or replace function ml_private.p3h_active_blocker(s jsonb,a integer) returns integer language sql stable set search_path=pg_catalog,ml_private as $$
 select (p.v->>'seat')::int from jsonb_array_elements(s->'players') with ordinality p(v,n)
 where s->>'version'='web-v0.1.19' and ml_private.stage4_on_board(s,a)
 and p.v->>'character'='character-011' and (p.v->>'seat')::int<>a and ml_private.stage4_on_board(s,(p.v->>'seat')::int)
 and (s->>'mode' is distinct from 'team' or p.v->>'team' is distinct from s#>>array['players',a::text,'team'])
 and (ml_private.version_catalog(s->>'version')#>'{mapDefinition,map}'->(p.v->>'cell')->>'region')=(ml_private.version_catalog(s->>'version')#>'{mapDefinition,map}'->(s#>>array['players',a::text,'cell'])->>'region')
 and ml_private.character_effect_allowed(jsonb_build_object('origin','role-locked','actor',(p.v->>'seat')::int,'roleModifiers','[]'::jsonb),a,s#>>array['players',a::text,'character'])
 order by p.n limit 1
$$;
create or replace function ml_private.p3h_active_allowed(s jsonb,a integer) returns boolean language sql stable set search_path=pg_catalog,ml_private as $$select ml_private.p3h_active_blocker(s,a) is null$$;
create or replace function ml_private.p3h_active_choice(kind text) returns boolean language sql immutable set search_path=pg_catalog,ml_private as $$select kind in ('h-small','h-respect','h-ren-expel','east-start','qb-pursuit','xie-ledger','west-carry','lemon-support','runner-roll','runner-pay','encourage','egg-move','f-self-harm','f-sting','primitive-food','g-invisible')$$;
create or replace function ml_private.p3h_active_skill(kind text) returns boolean language sql immutable set search_path=pg_catalog,ml_private as $$select kind in ('ren','freeze','dog','execute','magma','gas','escape','clan','feather','mayi','jj','cooperate','circle')$$;
create or replace function ml_private.p3h_prime_active(s jsonb,a integer) returns boolean language sql stable set search_path=pg_catalog,ml_private as $$select ml_private.p3g_prime(s,a) and ml_private.p3h_active_allowed(s,a)$$;
