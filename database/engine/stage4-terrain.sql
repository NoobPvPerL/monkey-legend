-- Tang offers per-event water/desert decisions plus an explicit, reversible
-- location preference. Changing it never renews an outstanding deadline.
create or replace function ml_private.stage4_ignore_location(s jsonb,a integer) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(s#>>array['stage4','terrainIgnore',a::text],'false')='true' and ml_private.stage3_equipped(s,a,'basic-069') $$;
create or replace function ml_private.stage4_location_card(s jsonb,a integer,card text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.stage4_ignore_location(s,a) or ml_private.location_card_allowed(s->>'version',s#>>array['players',a::text,'cell'],card) $$;
create or replace function ml_private.stage4_location_effect(s jsonb,a integer,card text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.stage4_ignore_location(s,a) or ml_private.location_effect_allowed(s->>'version',s#>>array['players',a::text,'cell'],card) $$;
create or replace function ml_private.stage4_location_move_cost(s jsonb,a integer) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select case when ml_private.stage4_ignore_location(s,a) then 1 else ml_private.location_basic_cost(s->>'version',s#>>array['players',a::text,'cell']) end $$;
create or replace function ml_private.stage4_location_draw(s jsonb,a integer) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select case when ml_private.stage4_ignore_location(s,a) then case when (s->>'round')::int=1 then 0 else 2 end else ml_private.location_draw_count(s->>'version',s#>>array['players',a::text,'cell'],(s->>'round')::int) end $$;
create or replace function ml_private.stage4_location_ap(s jsonb,a integer) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select case when ml_private.stage4_ignore_location(s,a) then case when s#>>array['players',a::text,'character']='character-031' then greatest(6,(s#>>array['players',a::text,'ap'])::int) else (s#>>array['players',a::text,'ap'])::int end else ml_private.location_personal_ap(s->>'version',s->'players'->a,(s->>'round')::int) end $$;
create or replace function ml_private.stage4_location_food(s jsonb,a integer,amount integer) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select case when ml_private.stage4_ignore_location(s,a) then case when s#>>array['players',a::text,'character']='character-027' then 0 else least(greatest(0,(s#>>array['players',a::text,'maxHp'])::int-(s#>>array['players',a::text,'hp'])::int),amount) end else ml_private.location_food_heal(s->>'version',s->'players'->a,amount) end $$;
create or replace function ml_private.stage4_location_stops(s jsonb,a integer,cell text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select not ml_private.stage4_ignore_location(s,a) and ml_private.location_stops(s->>'version',cell) $$;
