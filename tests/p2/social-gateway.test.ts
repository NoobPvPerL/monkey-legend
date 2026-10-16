import {afterAll,beforeAll,expect,it} from 'vitest';
import {once} from 'node:events';
import {randomBytes,randomUUID} from 'node:crypto';
import {io} from 'socket.io-client';
import type {Socket} from 'socket.io-client';
import {database} from './database';
import {createGateway} from '../../apps/server/src/gateway';
import type {ChatReply,RoomReply,Rpc} from '../../packages/online/src/protocol';
let db:Awaited<ReturnType<typeof database>>,server:ReturnType<typeof createGateway>,url:string,lost=false,loseNext=false;
const sockets:Socket[]=[];
const rpc:Rpc=async(name,args)=>{
 const q=name==='ml_health'?'select public.ml_health() v':name==='ml_maintenance'?'select public.ml_maintenance(20) v':`select public.${name}($1::jsonb) v`;
 const reply=(await db.query<{v:any}>(q,['ml_room','ml_watch','ml_chat'].includes(name)?[JSON.stringify(args.p_request)]:[])).rows[0].v;
 if(loseNext&&name==='ml_chat'&&(args.p_request as any).op==='send'){loseNext=false;lost=true;throw Error('lost committed chat reply');}return reply;
};
async function start(){server=createGateway({rpc,origin:'https://test.example',pollMs:400,maintenanceMs:60000});server.http.listen(0,'127.0.0.1');await once(server.http,'listening');url=`http://127.0.0.1:${(server.http.address() as any).port}`;}
async function client(){const s=io(url,{autoConnect:false,transports:['polling'],reconnection:false,extraHeaders:{Origin:'https://test.example'}});sockets.push(s);const connected=new Promise<void>((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});s.connect();await connected;return s;}
const emit=(s:Socket,event:string,input:unknown)=>s.timeout(5000).emitWithAck(event,input) as Promise<RoomReply&ChatReply>;
beforeAll(async()=>{db=await database();await db.exec('set role anon');await start();},30000);
afterAll(async()=>{for(const s of sockets)s.disconnect();await server.close();await db.close();});
it('polling spectator is read-only, receives all hands and chat, retries a lost send once and restores after gateway restart',async()=>{
 const people=Array.from({length:4},(_,i)=>({name:'联机'+i,token:randomBytes(32).toString('hex')})),clients:Socket[]=[],states:any[]=[];
 for(let i=0;i<4;i++){clients[i]=await client();const reply=await emit(clients[i],'attach',{op:i?'join':'create',...people[i],requestId:randomUUID(),...(i?{code:states[0].code}:{})});expect(reply.ok,reply.error).toBe(true);states[i]=reply.snapshot;}
 const watcher=await client(),identity={name:'联机观众',token:randomBytes(32).toString('hex')};const attached=await emit(watcher,'attach',{op:'watch',...identity,requestId:randomUUID(),code:states[0].code});expect(attached.ok,attached.error).toBe(true);const watch=attached.snapshot!;
 expect(watch.role).toBe('spectator');expect(watch.seat).toBeNull();
 expect((await emit(watcher,'command',{op:'ready',requestId:randomUUID(),roomRevision:watch.roomRevision,ready:true})).ok).toBe(false);
 for(let i=0;i<4;i++){const view=await rpc('ml_room',{p_request:{...people[i],roomId:states[i].roomId,epoch:states[i].epoch,op:'view'}}) as RoomReply;const r=await emit(clients[i],'command',{op:'ready',requestId:randomUUID(),roomRevision:view.snapshot!.roomRevision,ready:true});expect(r.ok,r.error).toBe(true);states[i]=r.snapshot;}
 const started=await emit(clients[0],'command',{op:'start',requestId:randomUUID(),roomRevision:states[3].roomRevision});expect(started.ok,started.error).toBe(true);
 const update=await rpc('ml_watch',{p_request:{...identity,roomId:watch.roomId,epoch:watch.epoch,op:'view'}}) as RoomReply;
 for(const p of update.snapshot!.game!.players)expect(p.hand?.length).toBe(p.handCount);
 const incoming=new Promise<any>(resolve=>watcher.on('chat-messages',p=>{if(p.messages.some((m:any)=>m.text==='玩家消息'))resolve(p);}));
 expect((await emit(clients[0],'chat',{op:'send',requestId:randomUUID(),text:'玩家消息'})).ok).toBe(true);expect((await incoming).messages.some((m:any)=>m.text==='玩家消息')).toBe(true);
 const command={op:'send',requestId:randomUUID(),text:'观众消息'};loseNext=true;expect((await emit(watcher,'chat',command)).error).toContain('尚未确认');expect(lost).toBe(true);
 const retried=await emit(watcher,'chat',command);expect(retried.duplicate).toBe(true);const history=await emit(watcher,'chat',{op:'list'});expect(history.messages?.filter(m=>m.text==='观众消息')).toHaveLength(1);
 expect((await emit(watcher,'chat',{op:'send',requestId:randomUUID(),text:'伪造',author:'房主'})).ok).toBe(false);
 const revoked=new Promise<void>(resolve=>watcher.once('revoked',resolve));const replacement=await client();const resumed=await emit(replacement,'attach',{op:'watch-resume',...identity,roomId:watch.roomId});expect(resumed.ok,resumed.error).toBe(true);await revoked;
 const epoch=resumed.snapshot!.epoch;await server.close();await start();const fresh=await client();const recovered=await emit(fresh,'attach',{op:'watch-resume',...identity,roomId:watch.roomId});expect(recovered.ok,recovered.error).toBe(true);expect(recovered.snapshot!.memberId).toBe(watch.memberId);expect(recovered.snapshot!.matchId).toBe(started.snapshot!.matchId);expect(recovered.snapshot!.epoch).toBeGreaterThan(epoch);
 expect((await emit(fresh,'chat',{op:'list'})).messages).toHaveLength(2);expect((await emit(fresh,'command',{op:'watch-leave',requestId:randomUUID()})).left).toBe(true);
},30000);
