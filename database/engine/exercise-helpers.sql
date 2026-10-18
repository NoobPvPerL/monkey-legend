-- Approved web-v0.1.9 physical-card ownership and discard reward.
create or replace function ml_private.exercise_rank(card text) returns integer language sql immutable
set search_path=pg_catalog as $$ select coalesce(array_position(array['basic-003','basic-004','basic-005'],split_part(card,'#',1)),0) $$;
create or replace function ml_private.exercise_remember(s jsonb,a integer,card text) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ begin
 if s->>'version'<>'web-v0.1.9' then return s;end if;
 if not s ? 'exercise' then s:=s||jsonb_build_object('exercise',jsonb_build_object('owners','{}'::jsonb));end if;
 if ml_private.exercise_rank(card)>0 and not (s#>'{exercise,owners}') ? card then s:=jsonb_set(s,array['exercise','owners',card],to_jsonb(a));end if;
 return s;
end $$;
create or replace function ml_private.exercise_response(s jsonb,attack text,response text) returns boolean language sql immutable
set search_path=pg_catalog,ml_private as $$ select s->>'version'='web-v0.1.9' and ml_private.exercise_rank(attack)>0 and ml_private.exercise_rank(response)>ml_private.exercise_rank(attack) $$;
create or replace function ml_private.exercise_discard(s jsonb,cards jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare card text;owner integer;begin
 for card in select x#>>'{}' from ml_private.arr(cards) x loop
  s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(card));
  if s->>'version'='web-v0.1.9' and ml_private.exercise_rank(card)>0 then
   owner:=(s#>>array['exercise','owners',card])::int;
   if owner is not null and (s#>>array['players',owner::text,'hp'])::int>0 then s:=ml_private.stage3_gain_ap(s,owner,1)-'_gain';end if;
  end if;
 end loop;return s;
end $$;
