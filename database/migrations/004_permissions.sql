-- PostgreSQL grants EXECUTE to PUBLIC on new functions by default. Revoke it
-- before exposing the three deliberately bounded entry points.
revoke all on all functions in schema ml_private from public;
revoke all on all tables in schema ml_private from public;
revoke all on schema ml_private from public;
revoke all on function public.ml_room(jsonb) from public;
revoke all on function public.ml_health() from public;
revoke all on function public.ml_maintenance(integer) from public;
-- WorkBuddy provisions these roles. Do not create or elevate roles in production.
do $$ declare role_name text; begin
 if (select count(*) from pg_roles where rolname in ('anon','authenticated'))<>2 then raise exception 'WorkBuddy must provision anon and authenticated roles before installation'; end if;
 foreach role_name in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=role_name) then
   execute format('revoke all on schema ml_private from %I',role_name);
   execute format('revoke all on all tables in schema ml_private from %I',role_name);
   execute format('revoke all on all functions in schema ml_private from %I',role_name);
   execute format('grant execute on function public.ml_room(jsonb) to %I',role_name);
   execute format('grant execute on function public.ml_health() to %I',role_name);
   execute format('grant execute on function public.ml_maintenance(integer) to %I',role_name);
  end if;
 end loop;
end $$;
