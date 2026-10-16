-- Read-only deployment verification. Execute after the migration as owner.
-- It contains no test initialization, player tokens or production writes.
select current_setting('server_version') as postgresql_version;
select public.ml_health() as application_schema;
select length(encode(sha256(convert_to('capability-test','UTF8')),'hex'))=64 as sha256_available,
       gen_random_uuid() is not null as secure_uuid_available;
select rolname,
 has_schema_privilege(rolname,'ml_private','USAGE') as private_schema_access_must_be_false,
 has_table_privilege(rolname,'ml_private.rooms','SELECT') as private_read_must_be_false,
 has_table_privilege(rolname,'ml_private.rooms','UPDATE') as private_write_must_be_false,
 has_function_privilege(rolname,'ml_private.dispatch(jsonb,jsonb,double precision)','EXECUTE') as private_engine_must_be_false,
 has_function_privilege(rolname,'public.ml_room(jsonb)','EXECUTE') as room_rpc_must_be_true,
 has_function_privilege(rolname,'public.ml_watch(jsonb)','EXECUTE') as watch_rpc_must_be_true,
 has_function_privilege(rolname,'public.ml_chat(jsonb)','EXECUTE') as chat_rpc_must_be_true,
 has_table_privilege(rolname,'ml_private.spectators','SELECT') as spectator_read_must_be_false,
 has_table_privilege(rolname,'ml_private.chat_messages','SELECT') as chat_read_must_be_false
from pg_roles where rolname in ('anon','authenticated');
select n.nspname as schema_name,p.proname as function_name,p.prosecdef as security_definer,
       p.proconfig as fixed_search_path
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('ml_room','ml_health','ml_maintenance','ml_watch','ml_chat');
