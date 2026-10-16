create or replace function ml_private.now_ms() returns bigint language sql volatile
set search_path=pg_catalog as $$ select floor(extract(epoch from clock_timestamp())*1000)::bigint $$;
create or replace function ml_private.token_hash(token text) returns text language sql immutable
set search_path=pg_catalog as $$ select encode(sha256(convert_to(token,'UTF8')),'hex') $$;
create or replace function ml_private.online(member jsonb,at bigint) returns boolean language sql immutable
set search_path=pg_catalog as $$ select member is not null and member<>'null'::jsonb and coalesce(member->'offlineSince','null'::jsonb)='null'::jsonb and at-(member->>'lastSeen')::bigint<45000 $$;
create or replace function ml_private.clear_ready(members jsonb) returns jsonb language sql immutable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(case when m='null'::jsonb then m else m||jsonb_build_object('ready',false) end),'[]') from ml_private.arr(members) m $$;
create or replace function ml_private.refresh_room(r ml_private.rooms,at bigint) returns ml_private.rooms
language plpgsql volatile set search_path=pg_catalog,ml_private as $$ declare outj jsonb; a integer; m jsonb; gone bigint; empty_at bigint:=0; first_id uuid; members_changed boolean:=false; old_status text:=r.status; begin
 if r.status='closed' then return r; end if;
 if r.status='finished' and not exists(select 1 from ml_private.archives archive where archive.match_id=r.match_id and archive.expires_at>at) then
  r.game:=null; r.match_id:=null; r.status:='lobby'; r.revision:=r.revision+1; r.updated_at:=at;
 end if;
 if r.status='playing' then
  outj:=ml_private.dispatch(r.game,jsonb_build_object('type','tick','actor',0,'id','db-time-'||(r.game->>'revision'),'revision',r.game->'revision'),at);
  perform ml_private.need((outj->>'ok')::boolean,'权威时钟处理失败');
  if outj->'state'<>r.game then r.game:=outj->'state'; r.revision:=r.revision+1; r.updated_at:=at; end if;
  if r.game->>'phase'='over' then
   r.status:='finished'; r.members:=ml_private.clear_ready(r.members); r.revision:=r.revision+1;
   -- Reservation starts when the terminal state is first observed. A long
   -- process outage must not erase all seats in the same recovery request.
   for a in 0..3 loop m:=r.members->a; if m<>'null'::jsonb and not ml_private.online(m,at) then r.members:=jsonb_set(r.members,array[a::text],m||jsonb_build_object('offlineSince',at)); end if; end loop;
   insert into ml_private.archives(match_id,room_id,state,expires_at) values(r.match_id,r.id,r.game,at+86400000) on conflict do nothing;
  end if;
 end if;
 if r.status in ('lobby','finished') then
  for a in 0..3 loop m:=r.members->a; if m is null or m='null'::jsonb then continue; end if;
   gone:=coalesce((m->>'offlineSince')::bigint,(m->>'lastSeen')::bigint+45000);
   if at>=gone+120000 then r.members:=jsonb_set(r.members,array[a::text],'null'); members_changed:=true; empty_at:=greatest(empty_at,gone+120000);
   elsif not ml_private.online(m,at) and (m->>'ready')::boolean then r.members:=jsonb_set(r.members,array[a::text],m||jsonb_build_object('ready',false)); members_changed:=true; end if;
  end loop;
  if members_changed then r.members:=ml_private.clear_ready(r.members); r.revision:=r.revision+1; end if;
 end if;
 if not exists(select 1 from ml_private.arr(r.members) x where x<>'null'::jsonb and x->>'id'=r.host::text) then
  select (x->>'id')::uuid into first_id from ml_private.arr(r.members) x where x<>'null'::jsonb order by (x->>'joinedAt')::bigint,(x->>'seat')::int limit 1; r.host:=first_id;
 end if;
 if not exists(select 1 from ml_private.arr(r.members) x where x<>'null'::jsonb) then
  r.empty_since:=coalesce(r.empty_since,nullif(empty_at,0),at);
  if at-r.empty_since>=1800000 then r.status:='closed'; r.game:=null; r.members:='[null,null,null,null]'; r.host:=null; r.revision:=r.revision+1; end if;
 else r.empty_since:=null; end if;
 if old_status<>r.status or members_changed then r.updated_at:=at; end if;
 return r;
end $$;
create or replace function ml_private.save_room(r ml_private.rooms) returns void language sql volatile
set search_path=pg_catalog,ml_private as $$ update ml_private.rooms set status=r.status,mode=r.mode,host=r.host,members=r.members,revision=r.revision,match_id=r.match_id,game=r.game,empty_since=r.empty_since,updated_at=r.updated_at where id=r.id $$;
create or replace function ml_private.room_view(r ml_private.rooms,a integer,at bigint) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare members jsonb:='[]'; m jsonb; game_view jsonb:='null'; begin
 for m in select * from ml_private.arr(r.members) loop members:=members||jsonb_build_array(case when m='null'::jsonb then m else jsonb_build_object('id',m->'id','seat',m->'seat','name',m->'name','ready',m->'ready','online',ml_private.online(m,at)) end); end loop;
 if r.game is not null then game_view:=ml_private.public_view(r.game,a); end if;
 return jsonb_build_object('protocol',1,'roomId',r.id,'code',r.code,'status',r.status,'mode',r.mode,'host',r.host,'members',members,'roomRevision',r.revision,'matchId',r.match_id,'seat',a,'memberId',r.members->a->'id','epoch',r.members->a->'epoch','serverTime',at,'game',game_view);
end $$;
create or replace function ml_private.throttle(scope_key text,at bigint,max_hits integer) returns void language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare countn integer; begin
 insert into ml_private.rate_limits(scope,window_start,hits) values(scope_key,at,1)
 on conflict(scope) do update set window_start=case when at-ml_private.rate_limits.window_start>=60000 then at else ml_private.rate_limits.window_start end,hits=case when at-ml_private.rate_limits.window_start>=60000 then 1 else ml_private.rate_limits.hits+1 end returning hits into countn;
 perform ml_private.need(countn<=max_hits,'请求过于频繁，请稍后重试');
end $$;
-- The only player-facing mutation API. Capabilities authenticate members even
-- when the WorkBuddy transport uses the anon role. No platform account required.
create or replace function public.ml_room(p_request jsonb) returns jsonb
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
create or replace function public.ml_health() returns jsonb language sql security definer
set search_path=pg_catalog,ml_private as $$ select jsonb_build_object('ok',true,'schemaVersion',1,'ruleVersion','web-v0.1.1','engine','postgresql') $$;
create or replace function public.ml_maintenance(p_limit integer default 20) returns jsonb
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
