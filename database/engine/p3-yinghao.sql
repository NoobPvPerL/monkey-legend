-- New rules only. The original character transcript and saved matches stay intact.
create or replace function ml_private.p3_yinghao_immune(s jsonb,target integer,card text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(s->>'version' in ('web-v0.1.11','web-v0.1.12') and s#>>array['players',target::text,'character']='character-045' and split_part(card,'#',1)='basic-010',false) $$;
