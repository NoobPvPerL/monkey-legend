-- Stage four rooms. New drafts use v0.1.7; existing v0.1.6 drafts retain their rule version.
create or replace function ml_private.validate_draft(s jsonb) returns void language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare chosen jsonb; a integer; i integer; o jsonb:=s->'offer'; pool jsonb; begin
 perform ml_private.need(s->>'status' in ('choosing','complete') and s->>'version'='draft-v1' and s->>'catalogVersion' in ('web-v0.1.4','web-v0.1.6','web-v0.1.7') and jsonb_array_length(s->'selected')=4 and (select jsonb_agg(x order by x) from ml_private.arr(s->'order') x)='[0,1,2,3]'::jsonb,'选角状态版本或座位无效');
 select coalesce(jsonb_agg(x),'[]') into chosen from ml_private.arr(s->'selected') x where x<>'null'::jsonb;
 perform ml_private.need(jsonb_array_length(chosen)=(s->>'cursor')::int and (select count(distinct x) from ml_private.arr(chosen) x)=jsonb_array_length(chosen) and not exists(select 1 from ml_private.arr(chosen) x where not ((ml_private.version_catalog(s->>'catalogVersion')#>'{sourceCatalog,characters}') ? (x#>>'{}'))),'已选角色无效或重复');
 for i in 0..3 loop a:=(s->'order'->>i)::int;perform ml_private.need((s->'selected'->a<>'null'::jsonb)=(i<(s->>'cursor')::int),'选角顺序不一致');end loop;
 for pool in select value from jsonb_each(s->'pools') loop perform ml_private.need(not exists(select 1 from ml_private.arr(pool) x where chosen @> jsonb_build_array(x)),'已选角色没有移出牌池');end loop;
 if s->>'status'='complete' then perform ml_private.need((s->>'cursor')::int=4 and o='null'::jsonb,'选角结束状态无效');
 else
  perform ml_private.need((s->>'cursor')::int between 0 and 3 and o<>'null'::jsonb and o->'actor'=s->'order'->(s->>'cursor')::int and o->'id'=s->'offerSerial' and jsonb_array_length(o->'candidates')=3 and (select count(distinct x) from ml_private.arr(o->'candidates') x)=3 and s->'pools'->(s->'teams'->>(o->>'actor')::int) @> (o->'candidates') and (o->>'deadline')::double precision<'Infinity'::double precision,'当前候选或选择期限无效');
 end if;
end $$;
create or replace function ml_private.create_draft(setup jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare catalogv text:=coalesce(setup->>'catalogVersion','web-v0.1.4');s jsonb; pool jsonb; i integer; a integer; overlap_count integer; key text; begin
 perform ml_private.need(jsonb_typeof(setup)='object','选角输入必须为对象');perform ml_private.need(catalogv in ('web-v0.1.4','web-v0.1.6','web-v0.1.7'),'选角目录版本无效');
 perform ml_private.need(at>=0 and at<'Infinity'::double precision,'选角时钟无效');
 perform ml_private.need(jsonb_typeof(setup->'order')='array' and (select jsonb_agg(x order by x) from ml_private.arr(setup->'order') x)='[0,1,2,3]'::jsonb,'选角需要四个固定座位的行动顺序');
 perform ml_private.need(setup->>'mode' in ('ffa','team'),'选角模式无效');perform ml_private.need(jsonb_typeof(setup->'teams')='array' and jsonb_array_length(setup->'teams')=4,'选角阵营需要四个座位');
 if setup->>'mode'='team' then perform ml_private.need((select count(*) from ml_private.arr(setup->'teams') x where x='"机械猴子"')=2 and (select count(*) from ml_private.arr(setup->'teams') x where x='"帝汶家族"')=2,'选角须先分配两名机械猴子和两名帝汶家族');
 else perform ml_private.need(setup->'teams'='["S1","S2","S3","S4"]'::jsonb,'各自为战的选角身份无效');end if;
 perform ml_private.need(jsonb_typeof(setup->'pools')='object','角色阵营池尚未完整配置');
 perform ml_private.need((select jsonb_agg(k order by k) from jsonb_object_keys(setup->'pools') k)=(select jsonb_agg(x order by x) from (select distinct x from ml_private.arr(setup->'teams') x) t),'角色阵营池尚未完整配置');
 for pool in select value from jsonb_each(setup->'pools') loop
  perform ml_private.need(jsonb_typeof(pool)='array' and jsonb_array_length(pool)>=3 and (select count(distinct x) from ml_private.arr(pool) x)=jsonb_array_length(pool) and not exists(select 1 from ml_private.arr(pool) x where not ((ml_private.version_catalog(catalogv)#>'{sourceCatalog,characters}') ? (x#>>'{}'))),'角色池必须包含至少三个不同的已登记角色');
 end loop;
 for i in 0..3 loop
  a:=(setup->'order'->>i)::int;pool:=setup->'pools'->(setup->'teams'->>a);
  select count(*) into overlap_count from jsonb_array_elements(setup->'order') with ordinality t(other,n) where n<=i and exists(select 1 from ml_private.arr(setup->'pools'->(setup->'teams'->>(other#>>'{}')::int)) x where pool @> jsonb_build_array(x));
  perform ml_private.need(jsonb_array_length(pool)>=3+overlap_count,'角色池可能不足三个候选，请补齐阵营或中立分配');
 end loop;
 perform ml_private.need(jsonb_typeof(setup->'random'->'seed')='number' and (setup#>>'{random,seed}')::numeric=trunc((setup#>>'{random,seed}')::numeric) and (setup#>>'{random,seed}')::numeric between 0 and 4294967295,'选角随机源无效');
 s:=jsonb_build_object('mode',setup->'mode','order',setup->'order','teams',setup->'teams','pools',setup->'pools','random',setup->'random','version','draft-v1','catalogVersion',catalogv,'revision',0,'time',at,'status','choosing','cursor',0,'offerSerial',0,'offer',null,'selected','[null,null,null,null]'::jsonb,'events','[]'::jsonb,'requests','[]'::jsonb);
 s:=ml_private.draft_offer(s,at);perform ml_private.validate_draft(s);return s;
end $$;
create or replace function ml_private.stage4_create_draft(mode text,random_state jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$ declare s jsonb:=jsonb_build_object('random',random_state);firstn integer;pair jsonb;teams jsonb:='[]';pools jsonb:='{}';ids jsonb:=ml_private.stage3_content()->'characterIds';pool jsonb;family text;a integer;begin
 s:=ml_private.int(s,4);firstn:=(s->>'_int')::int;s:=s-'_int';s:=ml_private.shuffle(s,'[0,1,2,3]');pair:=jsonb_build_array(s->'_shuffle'->0,s->'_shuffle'->1);s:=s-'_shuffle';
 for a in 0..3 loop family:=case when mode='team' then case when pair @> jsonb_build_array(a) then '机械猴子' else '帝汶家族' end else 'S'||(a+1) end;teams:=teams||jsonb_build_array(family);end loop;
 for family in select distinct x#>>'{}' from ml_private.arr(teams) x loop
 select jsonb_agg(id order by ord) into pool from jsonb_array_elements(ids) with ordinality q(id,ord) where mode='ffa' or ml_private.stage3_content()#>>array['characters',id#>>'{}','faction'] in (family,'中立');pools:=jsonb_set(pools,array[family],pool);end loop;
 return ml_private.create_draft(jsonb_build_object('mode',mode,'order',(select jsonb_agg((firstn+i)%4 order by i) from generate_series(0,3) i),'teams',teams,'pools',pools,'random',s->'random','catalogVersion','web-v0.1.7'),at);
end $$;
create or replace function ml_private.stage3_complete_draft(r ml_private.rooms,at bigint) returns ml_private.rooms language plpgsql volatile set search_path=pg_catalog,ml_private as $$ declare setup jsonb;start_at double precision;teams jsonb;begin
 if r.status<>'drafting' or r.draft->>'status'<>'complete' then return r;end if;
 start_at:=(r.draft#>>'{events,-1,at}')::double precision;
 select jsonb_agg(to_jsonb(case when x#>>'{}'='机械猴子' then 'A' else 'B' end) order by ord) into teams from jsonb_array_elements(r.draft->'teams') with ordinality q(x,ord);
 setup:=jsonb_build_object('mode',r.mode,'ruleVersion',case when r.draft->>'catalogVersion'='web-v0.1.7' then 'web-v0.1.7' else 'web-v0.1.6' end,'seed',r.draft#>'{random,seed}','seats','[0,1,2,3]'::jsonb,'characters',r.draft->'selected','first',r.draft#>'{order,0}','secure',coalesce(r.draft#>'{random,secure}','false'),'dice',r.draft#>'{random,dice}','bombs',r.draft#>'{random,bombs}','reshuffles',r.draft#>'{random,reshuffles}','sortedReshuffles',r.draft#>'{random,sortedReshuffles}');
 if r.mode='team' then setup:=setup||jsonb_build_object('teams',teams);end if;
 r.game:=ml_private.create_game(setup,start_at);r.status:='playing';r.revision:=r.revision+1;r.updated_at:=at;return r;
end $$;
create or replace function ml_private.room_v1(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,ml_private as $$
declare at bigint:=ml_private.now_ms(); op text:=p_request->>'op'; token text:=p_request->>'token'; hash text; req_id text:=p_request->>'requestId'; payload jsonb:=p_request-'token'-'epoch'; r ml_private.rooms; before_r ml_private.rooms; prior ml_private.intakes; receipt ml_private.receipts; a integer; m jsonb; mid uuid; pname text:=btrim(p_request->>'name'); keyname text; next_code text; attempt integer; found_room boolean:=false; outcome jsonb; reply jsonb; command jsonb; res jsonb; changed boolean:=false;
begin
 perform ml_private.need(jsonb_typeof(p_request)='object' and octet_length(p_request::text)<=16384,'请求格式无效或过大');
 perform ml_private.need(jsonb_typeof(p_request->'op')='string' and jsonb_typeof(p_request->'token')='string' and jsonb_typeof(p_request->'name')='string','身份字段必须为字符串');
 perform ml_private.need(op in ('create','join','resume','view','heartbeat','offline','ready','mode','start','leave','game','draft-pick'),'未知房间操作');
 perform ml_private.need(not exists(select 1 from jsonb_object_keys(p_request) k where k not in ('op','token','requestId','name','code','roomId','epoch','ready','mode','roomRevision','matchId','revision','intent','offer','character')),'请求含不允许的字段');
 perform ml_private.need(token ~ '^[a-f0-9]{64}$','恢复凭据无效'); hash:=ml_private.token_hash(token);
 perform ml_private.need(length(pname) between 1 and 24 and pname !~ '[[:cntrl:]]','玩家名须为1至24个可见字符'); keyname:=lower(pname);
 if op in ('create','join','ready','mode','start','leave','game','draft-pick') then perform ml_private.need(jsonb_typeof(p_request->'requestId')='string' and req_id ~ '^[A-Za-z0-9_-]{1,100}$','请求编号无效'); end if;
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
   command:=p_request->'intent'; perform ml_private.need(jsonb_typeof(command)='object' and command->>'type' in ('play','move','step','stop','end','choose','location','skill'),'操作意图无效');
   perform ml_private.need(not exists(select 1 from jsonb_object_keys(command) k where k not in ('type','card','targets','path','choice','accept','cell','cards','kind','direction','as','replacement','target','action','x','region','take','item','copy','option','guess')),'操作含不允许的字段');
   command:=command||jsonb_build_object('actor',a,'revision',p_request->'revision','id',r.match_id::text||':'||mid::text||':'||req_id);
   res:=ml_private.dispatch(r.game,command,at); perform ml_private.need((res->>'ok')::boolean,res->>'error'); r.game:=res->'state'; changed:=true;
   if r.game->>'phase'='over' then r.status:='finished'; r.members:=ml_private.clear_ready(r.members); insert into ml_private.archives values(r.match_id,r.id,r.game,at+86400000) on conflict do nothing; end if;
  elsif op='draft-pick' then
 perform ml_private.need(r.status='drafting' and p_request->>'matchId'=r.match_id::text,'选角对局身份已过期');
 command:=jsonb_build_object('type','pick','actor',a,'revision',p_request->'revision','offer',p_request->'offer','character',p_request->'character','id',ml_private.token_hash(r.match_id::text||':'||mid::text||':'||req_id));
 res:=ml_private.dispatch_draft(r.draft,command,at);perform ml_private.need(res->>'ok'='true',res->>'error');r.draft:=res->'state';r:=ml_private.stage3_complete_draft(r,at);changed:=true;
 elsif op='ready' then
   perform ml_private.need(r.status in ('lobby','finished'),'对局进行中不能修改准备'); perform ml_private.need(jsonb_typeof(p_request->'ready')='boolean','准备状态无效'); r.members:=jsonb_set(r.members,array[a::text,'ready'],p_request->'ready'); changed:=true;
  elsif op='mode' then
   perform ml_private.need(r.host=mid and r.status in ('lobby','finished'),'只有房主可在开局前选择模式'); perform ml_private.need(p_request->>'mode' in ('ffa','team'),'模式无效'); r.mode:=p_request->>'mode'; r.members:=ml_private.clear_ready(r.members); changed:=true;
  elsif op='start' then
   perform ml_private.need(r.host=mid and r.status in ('lobby','finished'),'只有房主可开始新局');
   perform ml_private.need((select count(*) from ml_private.arr(r.members) x where ml_private.online(x,at) and (x->>'ready')::boolean)=4,'需要四人在线且全部准备');
   r.match_id:=gen_random_uuid();r.game:=null;r.draft:=ml_private.stage4_create_draft(r.mode,jsonb_build_object('seed',0,'dice','[]'::jsonb,'bombs','[]'::jsonb,'reshuffles','[]'::jsonb,'sortedReshuffles',false,'secure',true),at);r.status:='drafting';r.members:=ml_private.clear_ready(r.members);changed:=true;
  elsif op='leave' then
   perform ml_private.need(r.status in ('lobby','finished'),'进行中不释放座位；关闭页面后仍按原时限推进'); r.members:=jsonb_set(ml_private.clear_ready(r.members),array[a::text],'null'); r.revision:=r.revision+1; r.updated_at:=at; r:=ml_private.refresh_room(r,at); perform ml_private.save_room(r); reply:=jsonb_build_object('ok',true,'left',true); insert into ml_private.receipts values(r.id,mid,req_id,payload,reply,at); return reply;
  end if;
  if changed then r.revision:=r.revision+1; r.updated_at:=at; end if;
  outcome:=jsonb_build_object('ok',true,'appliedRevision',case when r.status='drafting' then r.draft->'revision' else r.game->'revision' end,'matchId',r.match_id);
 exception when others then r:=before_r; outcome:=jsonb_build_object('ok',false,'error',case when sqlstate='P0001' then sqlerrm else '操作未提交，服务暂不可用' end);
 end;
 perform ml_private.save_room(r); insert into ml_private.receipts values(r.id,mid,req_id,payload,outcome,at);
 return outcome||jsonb_build_object('snapshot',ml_private.room_view(r,a,at));
exception when others then return jsonb_build_object('ok',false,'error',case when sqlstate='P0001' then sqlerrm else '请求无效或服务暂不可用' end);
end $$;
revoke all on all functions in schema ml_private from public;
DO $$ declare r text;begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;
