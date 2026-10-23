-- Owner confirmed 2026-10-19: full-board teleport, water allowed; other limits retained.
create or replace function ml_private.p3_potato_cells(s jsonb,a integer) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$
 select coalesce(jsonb_agg(c->'id'),'[]') from ml_private.arr(ml_private.game_data(s,'cells')) c
 where ml_private.classic_enter(s,c->>'id') and not ml_private.occupied(s,c->>'id')
 and ml_private.stage3_can_enter(s,a,c->>'id')
$$;
