import {afterAll,beforeAll,expect,it} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {database} from './database';
let db:Awaited<ReturnType<typeof database>>,now=1000000;
beforeAll(async()=>{db=await database();await clock(0);});afterAll(()=>db.close());
async function clock(ms:number){now+=ms;await db.exec(`create or replace function ml_private.now_ms() returns bigint language sql as $$ select ${now}::bigint $$;`);}
const person=(name:string,kind:'player'|'spectator'='player'):any=>({name,token:randomBytes(32).toString('hex'),kind});
async function call(method:'ml_room'|'ml_watch'|'ml_chat',p:any,op:string,extra:any={}){
 const {kind,...identity}=p;await db.exec('set role anon');try{return (await db.query<{v:any}>(`select public.${method}($1::jsonb) v`,[JSON.stringify({...identity,op,requestId:randomUUID(),...(method==='ml_chat'?{kind}:{}),...extra})])).rows[0].v;}finally{await db.exec('reset role');}
}
async function room(){const p=person('房主'),s=await call('ml_room',p,'create');expect(s.ok,s.error).toBe(true);Object.assign(p,{roomId:s.snapshot.roomId,epoch:s.snapshot.epoch});return {p,s:s.snapshot};}
async function watch(code:string,name='观众'){
 const w=person(name,'spectator'),joined=await call('ml_watch',w,'join',{code});expect(joined.ok,joined.error).toBe(true);Object.assign(w,{roomId:joined.snapshot.roomId,epoch:joined.snapshot.epoch});return {w,s:joined.snapshot};
}
it('spectators reserve no seats, do not clear readiness/revisions, and share the name namespace',async()=>{
 const {p,s}=await room();const ready=await call('ml_room',p,'ready',{roomRevision:s.roomRevision,ready:true});
 const {w,s:observed}=await watch(s.code,'看客');expect(observed.role).toBe('spectator');expect(observed.seat).toBeNull();expect(observed.roomRevision).toBe(ready.snapshot.roomRevision);expect(observed.members[0].ready).toBe(true);expect(observed.members.filter(Boolean)).toHaveLength(1);
 expect((await call('ml_watch',person('房主','spectator'),'join',{code:s.code})).ok).toBe(false);
 expect((await call('ml_room',person('看客'),'join',{code:s.code})).ok).toBe(false);
 expect((await call('ml_watch',w,'start')).ok).toBe(false);expect((await call('ml_room',w,'ready',{roomRevision:observed.roomRevision,ready:true})).ok).toBe(false);
});
it('full observer view includes every hand but never deck/random/tasks or credentials; players remain private',async()=>{
 const {p,s}=await room(),ps=[p];for(let i=1;i<4;i++){const q=person('玩家'+i),r=await call('ml_room',q,'join',{code:s.code});Object.assign(q,{roomId:r.snapshot.roomId,epoch:r.snapshot.epoch});ps.push(q);}
 for(const q of ps){const v=await call('ml_room',q,'view');expect((await call('ml_room',q,'ready',{roomRevision:v.snapshot.roomRevision,ready:true})).ok).toBe(true);}
 const v=await call('ml_room',p,'view'),started=await call('ml_room',p,'start',{roomRevision:v.snapshot.roomRevision});expect(started.ok,started.error).toBe(true);expect(started.snapshot.game.version).toBe('web-v0.1.2');
 const {w,s:watched}=await watch(s.code);for(const player of watched.game.players)expect(player.hand).toHaveLength(player.handCount);
 for(const key of ['deck','random','queue','seen','cursor','eventSerial'])expect(watched.game).not.toHaveProperty(key);
 expect(JSON.stringify(watched)).not.toContain('tokenHash');expect(watched.game.actions).toEqual({targets:{},steps:[]});
 const normal=await call('ml_room',ps[1],'view');for(const player of normal.snapshot.game.players)expect('hand' in player).toBe(player.seat===1);
 expect((await call('ml_watch',w,'game',{intent:{type:'end'}})).ok).toBe(false);
});
it('observer join retry is stable; takeover fences old epochs and leave invalidates restoration',async()=>{
 const {s}=await room(),w=person('恢复观众','spectator'),request={code:s.code,requestId:randomUUID()};
 const first=await call('ml_watch',w,'join',request),retry=await call('ml_watch',w,'join',request);expect(retry.snapshot.memberId).toBe(first.snapshot.memberId);
 Object.assign(w,{roomId:first.snapshot.roomId,epoch:first.snapshot.epoch});const old={...w},resumed=await call('ml_watch',w,'resume');expect(resumed.ok,resumed.error).toBe(true);w.epoch=resumed.snapshot.epoch;
 expect((await call('ml_watch',old,'view')).ok).toBe(false);expect((await call('ml_chat',old,'list')).ok).toBe(false);
 expect((await call('ml_watch',w,'leave')).left).toBe(true);expect((await call('ml_watch',w,'resume')).ok).toBe(false);
});
it('chat authenticates the author, is isolated by room, rate limits and retries exactly once',async()=>{
 const {p,s}=await room(),{w}=await watch(s.code),before=await call('ml_room',p,'view');const req={requestId:randomUUID(),text:'  <b>你好</b>  '};
 const first=await call('ml_chat',p,'send',req);expect(first.ok,first.error).toBe(true);expect(first.message).toMatchObject({name:p.name,kind:'player',seat:0,text:'<b>你好</b>'});
 const retry=await call('ml_chat',p,'send',req);expect(retry.duplicate).toBe(true);expect(retry.message.seq).toBe(first.message.seq);
 expect((await call('ml_chat',p,'send',{...req,text:'替换内容'})).ok).toBe(false);expect((await call('ml_chat',p,'send',{text:'太快'})).ok).toBe(false);
 const spectator=await call('ml_chat',w,'send',{text:'观战发言'});expect(spectator.message).toMatchObject({kind:'spectator',seat:null,name:w.name});
 const log=await call('ml_chat',w,'list');expect(log.messages).toHaveLength(2);expect(log.messages.map((m:any)=>m.seq)).toEqual([1,2]);
 const after=await call('ml_room',p,'view');expect(after.snapshot.roomRevision).toBe(before.snapshot.roomRevision);expect(after.snapshot.members).toEqual(before.snapshot.members);
 const other=await room();expect((await call('ml_chat',{...p,roomId:other.s.roomId},'list')).ok).toBe(false);
 expect((await call('ml_chat',p,'send',{text:'伪造',name:'他人'})).ok).toBe(false);
 expect((await call('ml_chat',p,'send',{text:'x',author:'他人'})).ok).toBe(false);
});
it('chat counts Unicode code points and rejects control characters or oversize payloads',async()=>{
 const {p}=await room();expect((await call('ml_chat',p,'send',{text:'🙂'.repeat(200)})).ok).toBe(true);
 for(const text of ['🙂'.repeat(201),'\n','hello\u0001world'])expect((await call('ml_chat',p,'send',{text})).ok).toBe(false);
 await expect(call('ml_chat',p,'send',{text:'hello\u0000world'})).rejects.toThrow(/Unicode escape/);
});
it('observer capacity is 32 and expiration releases a reserved name without changing player membership',async()=>{
 const {p,s}=await room();for(let i=0;i<32;i++)await watch(s.code,'旁观'+i);
 expect((await call('ml_watch',person('第33人','spectator'),'join',{code:s.code})).ok).toBe(false);
 await clock(165001);expect((await call('ml_watch',person('任意','spectator'),'resume',{roomId:s.roomId})).ok).toBe(false);
 const replacement=await watch(s.code,'旁观0');expect(replacement.s.spectators).toHaveLength(1);
});
it('only approved public RPCs are accessible to anonymous callers',async()=>{
 await db.exec('set role anon');try{for(const sql of ['select * from ml_private.spectators','select * from ml_private.chat_messages','select ml_private.room_v1(\'{}\')','select ml_private.watch_view(null,null,0)'])await expect(db.query(sql)).rejects.toThrow(/permission denied/);}finally{await db.exec('reset role');}
});
it('closed-room watcher and chat capabilities cannot reach a replacement room with the same code',async()=>{
 const {p,s}=await room(),{w}=await watch(s.code);await call('ml_chat',w,'send',{text:'旧房消息'});
 await db.query("update ml_private.rooms set status='closed',updated_at=$2 where id=$1",[s.roomId,now]);
 for(const op of ['view','resume','leave'])expect((await call('ml_watch',w,op)).ok).toBe(false);
 for(const op of ['list','send'])expect((await call('ml_chat',w,op,{text:'已关闭'})).ok).toBe(false);
 const replacement=await room();await db.query('update ml_private.rooms set code=$2 where id=$1',[replacement.s.roomId,s.code]);
 expect((await call('ml_watch',{...w,roomId:replacement.s.roomId},'resume')).ok).toBe(false);
 const newer=await watch(s.code,'新观众');expect(newer.s.roomId).toBe(replacement.s.roomId);expect((await call('ml_chat',newer.w,'list')).messages).toEqual([]);
});
it('chat retains 200 records, reads the latest 50 or ascending incremental pages, and cleans closed history after 24 hours',async()=>{
 const {p,s}=await room();
 for(let i=1;i<=202;i++){await clock(2000);if(i%30===0)expect((await call('ml_room',p,'view')).ok).toBe(true);const sent=await call('ml_chat',p,'send',{text:'消息'+i});expect(sent.ok,sent.error).toBe(true);}
 expect(Number((await db.query<any>('select count(*) n from ml_private.chat_messages where room_id=$1',[s.roomId])).rows[0].n)).toBe(200);
 const latest=await call('ml_chat',p,'list');expect(latest.messages).toHaveLength(50);expect(latest.messages[0].seq).toBe(153);expect(latest.lastSeq).toBe(202);
 const page=await call('ml_chat',p,'list',{after:2});expect(page.messages[0].seq).toBe(3);expect(page.lastSeq).toBe(52);
 await db.query("update ml_private.rooms set status='closed',updated_at=$2 where id=$1",[s.roomId,now]);
 await clock(86400001);await db.query('select public.ml_maintenance(100)');
 expect(Number((await db.query<any>('select count(*) n from ml_private.chat_messages where room_id=$1',[s.roomId])).rows[0].n)).toBe(0);
 expect(Number((await db.query<any>('select count(*) n from ml_private.chat_receipts where room_id=$1',[s.roomId])).rows[0].n)).toBe(0);
},30000);

