-- Apply as the database owner, never as the web application's anon role.
create schema if not exists ml_private;
revoke all on schema ml_private from public;
alter default privileges in schema ml_private revoke execute on functions from public;
create table if not exists ml_private.catalog (key text primary key, value jsonb not null);
create table if not exists ml_private.rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null check(code ~ '^[0-9]{4}$'),
 status text not null default 'lobby' check(status in ('lobby','playing','finished','closed')),
 mode text not null default 'ffa' check(mode in ('ffa','team')),
 host uuid, members jsonb not null default '[]', revision bigint not null default 0,
 match_id uuid, game jsonb, empty_since bigint,
 created_at bigint not null, updated_at bigint not null
);
create unique index if not exists ml_open_code on ml_private.rooms(code) where status <> 'closed';
create table if not exists ml_private.receipts (
 room_id uuid not null references ml_private.rooms(id), member_id uuid not null,
 request_id text not null, payload jsonb not null, outcome jsonb not null,
 created_at bigint not null, primary key(room_id,member_id,request_id)
);
create table if not exists ml_private.archives (
 match_id uuid primary key, room_id uuid not null references ml_private.rooms(id),
 state jsonb not null, expires_at bigint not null
);
create table if not exists ml_private.rate_limits (
 scope text primary key, window_start bigint not null, hits integer not null
);
create table if not exists ml_private.intakes (
 token_hash text not null, request_id text not null, payload jsonb not null,
 room_id uuid not null references ml_private.rooms(id), member_id uuid not null,
 created_at bigint not null, primary key(token_hash,request_id)
);
alter table ml_private.catalog enable row level security;
alter table ml_private.rooms enable row level security;
alter table ml_private.receipts enable row level security;
alter table ml_private.archives enable row level security;
alter table ml_private.rate_limits enable row level security;
alter table ml_private.intakes enable row level security;
revoke all on all tables in schema ml_private from public;
