-- Incremental social upgrade. Apply 005-007 in one owner transaction.
create table if not exists ml_private.spectators (
 id uuid primary key default gen_random_uuid(), room_id uuid not null references ml_private.rooms(id),
 name text not null, keyname text not null, token_hash text not null, epoch bigint not null default 1,
 active boolean not null default true, last_seen bigint not null, offline_since bigint,
 created_at bigint not null
);
create unique index if not exists ml_spectator_name on ml_private.spectators(room_id,keyname) where active;
create table if not exists ml_private.watch_intakes (
 token_hash text not null, request_id text not null, payload jsonb not null,
 spectator_id uuid not null references ml_private.spectators(id) on delete cascade,
 primary key(token_hash,request_id)
);
create table if not exists ml_private.social_rooms (room_id uuid primary key references ml_private.rooms(id), seq bigint not null default 0);
create table if not exists ml_private.chat_messages (
 room_id uuid not null references ml_private.rooms(id), seq bigint not null,
 author_id uuid not null, name text not null, kind text not null check(kind in ('player','spectator')), seat integer,
 text text not null, created_at bigint not null, primary key(room_id,seq)
);
create table if not exists ml_private.chat_receipts (
 room_id uuid not null references ml_private.rooms(id), author_id uuid not null, request_id text not null,
 text text not null, message jsonb not null, created_at bigint not null, primary key(room_id,author_id,request_id)
);
create table if not exists ml_private.chat_limits (
 room_id uuid not null references ml_private.rooms(id), author_id uuid not null, sent_at bigint not null,
 primary key(room_id,author_id)
);
alter table ml_private.spectators enable row level security;
alter table ml_private.watch_intakes enable row level security;
alter table ml_private.social_rooms enable row level security;
alter table ml_private.chat_messages enable row level security;
alter table ml_private.chat_receipts enable row level security;
alter table ml_private.chat_limits enable row level security;

create or replace function ml_private.watch_expired(w ml_private.spectators,at bigint) returns boolean language sql stable
set search_path=pg_catalog as $$ select not w.active or at>=coalesce(w.offline_since,w.last_seen+45000)+120000 $$;
create or replace function ml_private.watch_list(rid uuid,at bigint) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'online',w.offline_since is null and at-w.last_seen<45000) order by w.created_at,w.id),'[]') from ml_private.spectators w where w.room_id=rid and not ml_private.watch_expired(w,at) $$;

create or replace function ml_private.watch_view(r ml_private.rooms,w ml_private.spectators,at bigint) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare v jsonb:=ml_private.room_view(r,0,at); g jsonb; players jsonb; begin
 if r.game is not null then
  g:=v->'game'; select jsonb_agg((p-'hand')||jsonb_build_object('handCount',jsonb_array_length(p->'hand'),'hand',p->'hand')) into players from ml_private.arr(r.game->'players') p;
  g:=g||jsonb_build_object('players',players,'actions',jsonb_build_object('targets','{}'::jsonb,'steps','[]'::jsonb));
  if g->'choice'<>'null'::jsonb then g:=jsonb_set(g,'{choice}',(g->'choice')-'cards'-'cells'-'count'); end if;
  v:=jsonb_set(v,'{game}',g);
 end if;
 return v||jsonb_build_object('role','spectator','seat',null,'memberId',w.id,'epoch',w.epoch,'spectators',ml_private.watch_list(r.id,at));
end $$;

create or replace function public.ml_watch(p_request jsonb) returns jsonb language plpgsql security definer
set search_path=pg_catalog,ml_private as $$
declare at bigint:=ml_private.now_ms(); op text:=p_request->>'op'; pname text:=btrim(p_request->>'name'); lname text:=lower(pname); hash text; req text:=p_request->>'requestId'; r ml_private.rooms; w ml_private.spectators; prior ml_private.watch_intakes; m jsonb; begin
 perform ml_private.need(jsonb_typeof(p_request)='object' and octet_length(p_request::text)<=16384,'观战请求无效或过大');
 perform ml_private.need(not exists(select 1 from jsonb_object_keys(p_request) k where k not in ('op','name','token','requestId','code','roomId','epoch')),'观战请求含不允许的字段');
 perform ml_private.need(op in ('join','resume','view','offline','leave'),'未知观战操作');
 perform ml_private.need(jsonb_typeof(p_request->'name')='string' and length(pname) between 1 and 24 and pname !~ '[[:cntrl:]]' and jsonb_typeof(p_request->'token')='string' and p_request->>'token' ~ '^[a-f0-9]{64}$','观战身份字段无效'); hash:=ml_private.token_hash(p_request->>'token');
 if op='join' then
  perform ml_private.need(jsonb_typeof(p_request->'code')='string' and p_request->>'code' ~ '^\d{4}$' and req ~ '^[A-Za-z0-9_-]{1,100}$','房间码或请求编号无效');
  perform pg_advisory_xact_lock(('x'||substr(hash,1,16))::bit(64)::bigint);
  select * into prior from ml_private.watch_intakes where token_hash=hash and request_id=req;
  if found then
   perform ml_private.need(prior.payload=p_request-'token','同一请求编号不能更换内容');
   select room.* into r from ml_private.rooms room join ml_private.spectators viewer on viewer.room_id=room.id where viewer.id=prior.spectator_id for update of room;
   select * into w from ml_private.spectators where id=prior.spectator_id;
   perform ml_private.need(not ml_private.watch_expired(w,at),'观战凭据已失效');
  else
   select * into r from ml_private.rooms where code=p_request->>'code' and status<>'closed' for update;
   perform ml_private.need(found,'房间不存在或已关闭'); r:=ml_private.refresh_room(r,at); perform ml_private.save_room(r); perform ml_private.need(r.status<>'closed','房间已关闭');
   update ml_private.spectators viewer set active=false where viewer.room_id=r.id and viewer.active and ml_private.watch_expired(viewer,at);
   perform ml_private.need(not exists(select 1 from ml_private.arr(r.members) member where member->>'key'=lname),'玩家或观众中已有同名，请更换名字');
   perform ml_private.need(not exists(select 1 from ml_private.spectators viewer where viewer.room_id=r.id and viewer.active and viewer.keyname=lname),'玩家或观众中已有同名，请更换名字');
   perform ml_private.need((select count(*) from ml_private.spectators where room_id=r.id and active)<32,'观众席已满（32人）');
   perform ml_private.throttle('watch-room:'||r.id,at,120); perform ml_private.throttle('watch-global',at,480);
   insert into ml_private.spectators(room_id,name,keyname,token_hash,last_seen,created_at) values(r.id,pname,lname,hash,at,at) returning * into w;
   insert into ml_private.watch_intakes values(hash,req,p_request-'token',w.id);
  end if;
 else
  select * into r from ml_private.rooms where id=(p_request->>'roomId')::uuid for update; perform ml_private.need(found,'房间不存在或已关闭');
  select * into w from ml_private.spectators viewer where viewer.room_id=r.id and viewer.token_hash=hash and viewer.keyname=lname;
  perform ml_private.need(found,'观战凭据或玩家名不匹配');
  if op='leave' then
   perform ml_private.need(r.status<>'closed','房间已关闭，观战凭据已失效');
   perform ml_private.need(req ~ '^[A-Za-z0-9_-]{1,100}$' and p_request->'epoch'=to_jsonb(w.epoch),'连接已被新页面接管');
   update ml_private.spectators set active=false where id=w.id; return jsonb_build_object('ok',true,'left',true);
  end if;
  perform ml_private.need(not ml_private.watch_expired(w,at),'观战凭据已失效');
  if op='resume' then w.epoch:=w.epoch+1; else perform ml_private.need(p_request->'epoch'=to_jsonb(w.epoch),'连接已被新页面接管，请停止重连'); end if;
 end if;
 r:=ml_private.refresh_room(r,at); perform ml_private.save_room(r); perform ml_private.need(r.status<>'closed','房间已关闭，观战凭据已失效');
 perform ml_private.throttle('watcher:'||w.id,at,240);
 if op='offline' then w.offline_since:=at; else w.last_seen:=at; w.offline_since:=null; end if;
 update ml_private.spectators set epoch=w.epoch,last_seen=w.last_seen,offline_since=w.offline_since where id=w.id;
 return jsonb_build_object('ok',true,'snapshot',ml_private.watch_view(r,w,at));
exception when others then return jsonb_build_object('ok',false,'error',case when sqlstate='P0001' then sqlerrm else '观战请求无效或服务暂不可用' end);
end $$;

-- Authentication is separate from game commands and does not tick or mutate the match.
create or replace function ml_private.chat_actor(p jsonb,r ml_private.rooms,at bigint) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare m jsonb; w ml_private.spectators; hash text:=ml_private.token_hash(p->>'token'); begin
 perform ml_private.need(r.status<>'closed','房间已关闭，凭据已失效');
 if p->>'kind'='spectator' then
  select * into w from ml_private.spectators viewer where viewer.room_id=r.id and viewer.token_hash=hash and viewer.keyname=lower(btrim(p->>'name'));
  perform ml_private.need(found and not ml_private.watch_expired(w,at),'观战凭据已失效'); perform ml_private.need(p->'epoch'=to_jsonb(w.epoch),'连接已被新页面接管');
  return jsonb_build_object('id',w.id,'name',w.name,'kind','spectator','seat',null);
 end if;
 perform ml_private.need(p->>'kind'='player','聊天身份无效');
 for m in select * from ml_private.arr(r.members) loop
  if m->>'tokenHash'=hash and m->>'key'=lower(btrim(p->>'name')) then
   perform ml_private.need(p->'epoch'=m->'epoch','连接已被新页面接管');
   perform ml_private.need(r.status='playing' or at<coalesce((m->>'offlineSince')::bigint,(m->>'lastSeen')::bigint+45000)+120000,'玩家凭据已失效');
   return jsonb_build_object('id',m->'id','name',m->'name','kind','player','seat',m->'seat');
  end if;
 end loop; raise exception '玩家凭据已失效';
end $$;

create or replace function public.ml_chat(p_request jsonb) returns jsonb language plpgsql security definer
set search_path=pg_catalog,ml_private as $$ declare at bigint:=ml_private.now_ms(); r ml_private.rooms; actor jsonb; op text:=p_request->>'op'; txt text:=btrim(p_request->>'text'); req text:=p_request->>'requestId'; prior ml_private.chat_receipts; after_seq bigint; next_seq bigint; messages jsonb; message jsonb; last_seq bigint; begin
 perform ml_private.need(jsonb_typeof(p_request)='object' and octet_length(p_request::text)<=16384,'聊天请求无效或过大');
 perform ml_private.need(not exists(select 1 from jsonb_object_keys(p_request) k where k not in ('op','kind','name','token','roomId','epoch','requestId','text','after')),'聊天请求含不允许的字段');
 perform ml_private.need(op in ('list','send') and jsonb_typeof(p_request->'token')='string' and p_request->>'token' ~ '^[a-f0-9]{64}$' and jsonb_typeof(p_request->'name')='string' and length(btrim(p_request->>'name')) between 1 and 24 and p_request->>'name' !~ '[[:cntrl:]]' and jsonb_typeof(p_request->'epoch')='number','聊天身份或操作无效');
 select * into r from ml_private.rooms where id=(p_request->>'roomId')::uuid for update; perform ml_private.need(found,'房间不存在或已关闭'); actor:=ml_private.chat_actor(p_request,r,at);
 if op='send' then
  perform ml_private.need(jsonb_typeof(p_request->'text')='string' and length(txt) between 1 and 200 and txt !~ '[[:cntrl:]]' and req ~ '^[A-Za-z0-9_-]{1,100}$','消息须为1至200字，不含控制字符');
  select * into prior from ml_private.chat_receipts where room_id=r.id and author_id=(actor->>'id')::uuid and request_id=req;
  if found then perform ml_private.need(prior.text=txt,'同一请求编号不能更换内容'); return jsonb_build_object('ok',true,'duplicate',true,'message',prior.message); end if;
  perform ml_private.need(not exists(select 1 from ml_private.chat_limits where room_id=r.id and author_id=(actor->>'id')::uuid and at-sent_at<2000),'发送过快，请间隔2秒');
  insert into ml_private.chat_limits values(r.id,(actor->>'id')::uuid,at) on conflict(room_id,author_id) do update set sent_at=excluded.sent_at;
  insert into ml_private.social_rooms values(r.id,1) on conflict(room_id) do update set seq=ml_private.social_rooms.seq+1 returning seq into next_seq;
  message:=jsonb_build_object('seq',next_seq,'authorId',actor->'id','name',actor->'name','kind',actor->'kind','seat',actor->'seat','text',txt,'createdAt',at);
  insert into ml_private.chat_messages values(r.id,next_seq,(actor->>'id')::uuid,actor->>'name',actor->>'kind',(actor->>'seat')::int,txt,at);
  insert into ml_private.chat_receipts values(r.id,(actor->>'id')::uuid,req,txt,message,at);
  delete from ml_private.chat_messages where room_id=r.id and seq<=next_seq-200;
  return jsonb_build_object('ok',true,'message',message);
 end if;
 perform ml_private.throttle('chat-read:'||(actor->>'id'),at,240);
 if p_request ? 'after' then perform ml_private.need(jsonb_typeof(p_request->'after')='number' and (p_request->>'after')::numeric=trunc((p_request->>'after')::numeric) and (p_request->>'after')::numeric between 0 and 9007199254740991,'消息游标无效'); after_seq:=(p_request->>'after')::bigint; end if;
 select coalesce(jsonb_agg(jsonb_build_object('seq',q.seq,'authorId',q.author_id,'name',q.name,'kind',q.kind,'seat',q.seat,'text',q.text,'createdAt',q.created_at) order by q.seq),'[]') into messages from (select * from ml_private.chat_messages where room_id=r.id and (after_seq is null or seq>after_seq) order by case when after_seq is null then -seq else seq end limit 50) q;
 select coalesce(max((msg->>'seq')::bigint),coalesce(after_seq,0)) into last_seq from ml_private.arr(messages) msg;
 return jsonb_build_object('ok',true,'messages',messages,'lastSeq',last_seq);
exception when others then return jsonb_build_object('ok',false,'error',case when sqlstate='P0001' then sqlerrm else '聊天请求无效或服务暂不可用' end);
end $$;


-- Preserve the existing room implementation privately; only the wrapper is public.
create or replace function ml_private.room_v1(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ml_private as $$
declare at bigint:=ml_private.now_ms(); op text:=p_request->>'op'; token text:=p_request->>'token'; hash text; req_id text:=p_request->>'requestId'; payload jsonb:=p_request-'token'-'epoch'; r ml_private.rooms; before_r ml_private.rooms; prior ml_private.intakes; receipt ml_private.receipts; a integer; m jsonb; mid uuid; pname text:=btrim(p_request->>'name'); keyname text; next_code text; attempt integer; found_room boolean:=false; outcome jsonb; reply jsonb; command jsonb; res jsonb; changed boolean:=false;
begin
 perform ml_private.need(jsonb_typeof(p_request)='object' and octet_length(p_request::text)<=16384,'请求格式无效或过大');
 perform ml_private.need(jsonb_typeof(p_request->'op')='string' and jsonb_typeof(p_request->'token')='string' and jsonb_typeof(p_request->'name')='string','身份字段必须为字符串');
 perform ml_private.need(op in ('create','join','resume','view','heartbeat','offline','ready','mode','start','leave','game'),'未知房间操作');
 perform ml_private.need(not exists(select 1 from jsonb_object_keys(p_request) k where k not in ('op','token','requestId','name','code','roomId','epoch','ready','mode','roomRevision','matchId','revision','intent')),'请求含不允许的字段');
 perform ml_private.need(token ~ '^[a-f0-9]{64}$','恢复凭据无效'); hash:=ml_private.token_hash(token);
 perform ml_private.need(length(pname) between 1 and 24 and pname !~ '[[:cntrl:]]','玩家名须为1至24个可见字符'); keyname:=lower(pname);
 if op in ('create','join','ready','mode','start','leave','game') then perform ml_private.need(jsonb_typeof(p_request->'requestId')='string' and req_id ~ '^[A-Za-z0-9_-]{1,100}$','请求编号无效'); end if;
 if op in ('create','join') then
  -- Serializes identical uncertain intake retries before assigning any seat/code.
  perform pg_advisory_xact_lock(('x'||substr(hash,1,16))::bit(64)::bigint);
  select * into prior from ml_private.intakes i where i.token_hash=hash and i.request_id=req_id;
  if found then
   perform ml_private.need(prior.payload=payload,'同一请求编号不能更换内容');
   select * into r from ml_private.rooms where id=prior.room_id for update;
   perform ml_private.need(r.status<>'closed','原房间已关闭，凭据已失效');
   for a in 0..3 loop if r.members->a->>'id'=prior.member_id::text then
    r:=ml_private.refresh_room(r,at); perform ml_private.save_room(r);
    perform ml_private.need(r.status<>'closed' and r.members->a->>'id'=prior.member_id::text,'原座位已释放');
    return jsonb_build_object('ok',true,'duplicate',true,'snapshot',ml_private.room_view(r,a,at));
   end if; end loop; raise exception '原座位已释放';
  end if;
  perform ml_private.throttle('intake:'||hash,at,30);
  if op='create' then
   perform ml_private.throttle('create:global',at,120);
   for attempt in 1..200 loop
    next_code:=lpad(ml_private.entropy(10000)::text,4,'0');
    begin
     insert into ml_private.rooms(code,created_at,updated_at,members) values(next_code,at,at,'[null,null,null,null]') returning * into r; found_room:=true;
    exception when unique_violation then null; end;
    exit when found_room;
   end loop; perform ml_private.need(found_room,'可用房间码暂不足，请稍后重试'); a:=0;
  else
   perform ml_private.need(jsonb_typeof(p_request->'code')='string' and p_request->>'code' ~ '^[0-9]{4}$','房间码必须是4位数字');
   select * into r from ml_private.rooms where code=p_request->>'code' and status<>'closed' for update;
   perform ml_private.need(found,'房间不存在或已关闭'); r:=ml_private.refresh_room(r,at); perform ml_private.save_room(r);
   perform ml_private.need(r.status in ('lobby','finished'),'对局进行中，不能加入');
   perform ml_private.need(not exists(select 1 from ml_private.arr(r.members) x where x->>'key'=keyname),'该房间已有同名玩家，请使用原凭据恢复或换名');
   a:=null; for attempt in 0..3 loop if r.members->attempt='null'::jsonb then a:=attempt; exit; end if; end loop; perform ml_private.need(a is not null,'房间已满');
  end if;
  mid:=gen_random_uuid(); m:=jsonb_build_object('id',mid,'seat',a,'name',pname,'key',keyname,'tokenHash',hash,'ready',false,'lastSeen',at,'offlineSince',null,'joinedAt',at,'epoch',1);
  r.members:=jsonb_set(ml_private.clear_ready(r.members),array[a::text],m); r.host:=coalesce(r.host,mid); r.empty_since:=null; r.revision:=r.revision+1; r.updated_at:=at; perform ml_private.save_room(r);
  insert into ml_private.intakes values(hash,req_id,payload,r.id,mid,at);
  return jsonb_build_object('ok',true,'snapshot',ml_private.room_view(r,a,at));
 end if;
 perform ml_private.need(jsonb_typeof(p_request->'roomId')='string' and p_request->>'roomId' ~ '^[a-f0-9-]{36}$','房间身份无效');
 select * into r from ml_private.rooms where id=(p_request->>'roomId')::uuid for update;
 perform ml_private.need(found and r.status<>'closed','房间不存在或已关闭');
 r:=ml_private.refresh_room(r,at);
 a:=null; for attempt in 0..3 loop m:=r.members->attempt; if m->>'tokenHash'=hash and m->>'key'=keyname then a:=attempt; exit; end if; end loop;
 if a is null then
  perform ml_private.save_room(r);
  if op='leave' then
   select q.* into receipt from ml_private.receipts q join ml_private.intakes i on i.room_id=q.room_id and i.member_id=q.member_id where i.token_hash=hash and q.room_id=r.id and q.request_id=req_id limit 1;
   if found and receipt.payload=payload and receipt.outcome->>'left'='true' then return receipt.outcome||jsonb_build_object('duplicate',true); end if;
  end if;
  return jsonb_build_object('ok',false,'error','恢复凭据或玩家名不匹配，座位可能已释放');
 end if;
 m:=r.members->a; mid:=(m->>'id')::uuid;
 perform ml_private.throttle('member:'||mid,at,240);
 if op='resume' then m:=m||jsonb_build_object('epoch',(m->>'epoch')::bigint+1); else perform ml_private.need(jsonb_typeof(p_request->'epoch')='number' and p_request->'epoch'=m->'epoch','连接已被新页面接管，请停止重连'); end if;
 if op='offline' then m:=m||jsonb_build_object('offlineSince',at); if r.status in ('lobby','finished') then m:=m||jsonb_build_object('ready',false); r.revision:=r.revision+1; end if;
 else m:=m||jsonb_build_object('lastSeen',at,'offlineSince',null); end if;
 r.members:=jsonb_set(r.members,array[a::text],m);
 if op in ('resume','view','heartbeat','offline') then perform ml_private.save_room(r); return jsonb_build_object('ok',true,'snapshot',ml_private.room_view(r,a,at)); end if;
 select * into receipt from ml_private.receipts q where q.room_id=r.id and q.member_id=mid and q.request_id=req_id;
 if found then
  perform ml_private.save_room(r); if receipt.payload<>payload then return jsonb_build_object('ok',false,'error','同一请求编号不能更换内容','snapshot',ml_private.room_view(r,a,at)); end if;
  return receipt.outcome||jsonb_build_object('duplicate',true,'snapshot',ml_private.room_view(r,a,at));
 end if;
 -- Subtransaction catches rejected commands while preserving elapsed clock work.
 before_r:=r;
 begin
  if op in ('ready','mode','start','leave') then perform ml_private.need(jsonb_typeof(p_request->'roomRevision')='number' and p_request->'roomRevision'=to_jsonb(r.revision),'房间状态已更新，请查看后重试'); end if;
  if op='game' then
   perform ml_private.need(r.status='playing' and p_request->>'matchId'=r.match_id::text,'对局身份已过期');
   command:=p_request->'intent'; perform ml_private.need(jsonb_typeof(command)='object' and command->>'type' in ('play','move','step','stop','end','choose'),'操作意图无效');
   perform ml_private.need(not exists(select 1 from jsonb_object_keys(command) k where k not in ('type','card','targets','path','choice','accept','cell','cards')),'操作含不允许的字段');
   command:=command||jsonb_build_object('actor',a,'revision',p_request->'revision','id',r.match_id::text||':'||mid::text||':'||req_id);
   res:=ml_private.dispatch(r.game,command,at); perform ml_private.need((res->>'ok')::boolean,res->>'error'); r.game:=res->'state'; changed:=true;
   if r.game->>'phase'='over' then r.status:='finished'; r.members:=ml_private.clear_ready(r.members); insert into ml_private.archives values(r.match_id,r.id,r.game,at+86400000) on conflict do nothing; end if;
  elsif op='ready' then
   perform ml_private.need(r.status in ('lobby','finished'),'对局进行中不能修改准备'); perform ml_private.need(jsonb_typeof(p_request->'ready')='boolean','准备状态无效'); r.members:=jsonb_set(r.members,array[a::text,'ready'],p_request->'ready'); changed:=true;
  elsif op='mode' then
   perform ml_private.need(r.host=mid and r.status in ('lobby','finished'),'只有房主可在开局前选择模式'); perform ml_private.need(p_request->>'mode' in ('ffa','team'),'模式无效'); r.mode:=p_request->>'mode'; r.members:=ml_private.clear_ready(r.members); changed:=true;
  elsif op='start' then
   perform ml_private.need(r.host=mid and r.status in ('lobby','finished'),'只有房主可开始新局');
   perform ml_private.need((select count(*) from ml_private.arr(r.members) x where ml_private.online(x,at) and (x->>'ready')::boolean)=4,'需要四人在线且全部准备');
   r.match_id:=gen_random_uuid(); r.game:=ml_private.create_game(jsonb_build_object('mode',r.mode,'seed',0,'seats','[0,1,2,3]'::jsonb,'secure',true),at); r.status:='playing'; r.members:=ml_private.clear_ready(r.members); changed:=true;
  elsif op='leave' then
   perform ml_private.need(r.status in ('lobby','finished'),'进行中不释放座位；关闭页面后仍按原时限推进'); r.members:=jsonb_set(ml_private.clear_ready(r.members),array[a::text],'null'); r.revision:=r.revision+1; r.updated_at:=at; r:=ml_private.refresh_room(r,at); perform ml_private.save_room(r); reply:=jsonb_build_object('ok',true,'left',true); insert into ml_private.receipts values(r.id,mid,req_id,payload,reply,at); return reply;
  end if;
  if changed then r.revision:=r.revision+1; r.updated_at:=at; end if;
  outcome:=jsonb_build_object('ok',true,'appliedRevision',r.game->'revision','matchId',r.match_id);
 exception when others then r:=before_r; outcome:=jsonb_build_object('ok',false,'error',case when sqlstate='P0001' then sqlerrm else '操作未提交，服务暂不可用' end);
 end;
 perform ml_private.save_room(r); insert into ml_private.receipts values(r.id,mid,req_id,payload,outcome,at);
 return outcome||jsonb_build_object('snapshot',ml_private.room_view(r,a,at));
exception when others then return jsonb_build_object('ok',false,'error',case when sqlstate='P0001' then sqlerrm else '请求无效或服务暂不可用' end);
end $$;

create or replace function ml_private.room_view(r ml_private.rooms,a integer,at bigint) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare members jsonb:='[]'; m jsonb; game_view jsonb:='null'; begin
 for m in select * from ml_private.arr(r.members) loop members:=members||jsonb_build_array(case when m='null'::jsonb then m else jsonb_build_object('id',m->'id','seat',m->'seat','name',m->'name','ready',m->'ready','online',ml_private.online(m,at)) end); end loop;
 if r.game is not null then game_view:=ml_private.public_view(r.game,a); end if;
 return jsonb_build_object('role','player','spectators',ml_private.watch_list(r.id,at),'protocol',1,'roomId',r.id,'code',r.code,'status',r.status,'mode',r.mode,'host',r.host,'members',members,'roomRevision',r.revision,'matchId',r.match_id,'seat',a,'memberId',r.members->a->'id','epoch',r.members->a->'epoch','serverTime',at,'game',game_view);
end $$;

create or replace function public.ml_room(p_request jsonb) returns jsonb language plpgsql security definer
set search_path=pg_catalog,ml_private as $$ declare r ml_private.rooms; at bigint:=ml_private.now_ms(); begin
 if p_request->>'op'='join' then
  perform ml_private.need(octet_length(p_request::text)<=16384,'请求过大');
  select * into r from ml_private.rooms where code=p_request->>'code' and status<>'closed' for update;
  if found then perform ml_private.need(not exists(select 1 from ml_private.spectators w where w.room_id=r.id and not ml_private.watch_expired(w,at) and w.keyname=lower(btrim(p_request->>'name'))),'玩家或观众中已有同名，请更换名字'); end if;
 end if;
 return ml_private.room_v1(p_request);
exception when others then return jsonb_build_object('ok',false,'error',case when sqlstate='P0001' then sqlerrm else '请求无效或服务暂不可用' end);
end $$;
create or replace function ml_private.maintenance_v1(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ml_private as $$ declare r ml_private.rooms; at bigint:=ml_private.now_ms(); countn integer:=0; begin
 perform ml_private.need(p_limit between 1 and 100,'清理批次无效');
 perform ml_private.throttle('maintenance',at,60);
 for r in select * from ml_private.rooms where status<>'closed' order by updated_at limit p_limit for update skip locked loop r:=ml_private.refresh_room(r,at); perform ml_private.save_room(r); countn:=countn+1; end loop;
 delete from ml_private.archives where match_id in (select match_id from ml_private.archives where expires_at<at limit 100);
 delete from ml_private.receipts where ctid in (select ctid from ml_private.receipts where created_at<at-86400000 limit 500);
 delete from ml_private.intakes where ctid in (select i.ctid from ml_private.intakes i join ml_private.rooms room on room.id=i.room_id where i.created_at<at-86400000 and room.status='closed' limit 500);
 delete from ml_private.rate_limits where scope in (select scope from ml_private.rate_limits where window_start<at-86400000 limit 500);
 return jsonb_build_object('ok',true,'checked',countn);
end $$;

create or replace function public.ml_maintenance(p_limit integer default 20) returns jsonb language plpgsql security definer
set search_path=pg_catalog,ml_private as $$ declare result jsonb; at bigint:=ml_private.now_ms(); begin
 result:=ml_private.maintenance_v1(p_limit);
 update ml_private.spectators w set active=false where w.id in (select viewer.id from ml_private.spectators viewer join ml_private.rooms r on r.id=viewer.room_id where viewer.active and (r.status='closed' or ml_private.watch_expired(viewer,at)) limit 100);
 delete from ml_private.chat_receipts where ctid in (select ctid from ml_private.chat_receipts where created_at<at-86400000 limit 500);
 delete from ml_private.chat_messages where ctid in (select m.ctid from ml_private.chat_messages m join ml_private.rooms r on r.id=m.room_id where r.status='closed' and r.updated_at<at-86400000 limit 500);
 delete from ml_private.spectators where id in (select w.id from ml_private.spectators w join ml_private.rooms r on r.id=w.room_id where not w.active and r.status='closed' and r.updated_at<at-86400000 limit 100);
 delete from ml_private.chat_limits where ctid in (select ctid from ml_private.chat_limits where sent_at<at-86400000 limit 500);
 return result;
end $$;
create or replace function public.ml_health() returns jsonb language sql security definer
set search_path=pg_catalog as $$ select jsonb_build_object('ok',true,'schemaVersion',2,'ruleVersion','web-v0.1.2','legacyRuleVersion','web-v0.1.1','engine','postgresql','features',jsonb_build_array('deferred-movement','spectators','chat')) $$;
revoke all on all functions in schema ml_private from public;
revoke all on all tables in schema ml_private from public;
revoke all on function public.ml_watch(jsonb) from public;
revoke all on function public.ml_chat(jsonb) from public;
do $$ declare role_name text; begin
 if (select count(*) from pg_roles where rolname in ('anon','authenticated'))<>2 then raise exception 'WorkBuddy must provision anon and authenticated roles before installation'; end if;
 foreach role_name in array array['anon','authenticated'] loop
  execute format('revoke all on schema ml_private from %I',role_name);
  execute format('revoke all on all tables in schema ml_private from %I',role_name);
  execute format('revoke all on all functions in schema ml_private from %I',role_name);
  execute format('grant execute on function public.ml_watch(jsonb) to %I',role_name);
  execute format('grant execute on function public.ml_chat(jsonb) to %I',role_name);
 end loop;
end $$;
