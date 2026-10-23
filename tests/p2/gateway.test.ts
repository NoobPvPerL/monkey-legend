import {afterAll,beforeAll,expect,it} from 'vitest';
import {io} from 'socket.io-client';
import type {Socket} from 'socket.io-client';
import {randomBytes,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {database} from './database';
import {STAGE3_DATABASE_REQUIREMENT} from '../../packages/online/src/version';
import {createGateway} from '../../apps/server/src/gateway';
import {attachSchema,commandSchema} from '../../packages/online/src/protocol';
import type {Reply,RoomReply,Rpc,Snapshot} from '../../packages/online/src/protocol';

let db:Awaited<ReturnType<typeof database>>,server:ReturnType<typeof createGateway>,url:string;
let lost=false,loseNext=false;
const sockets:Socket[]=[];
const socketEvent=(s:Socket,name:string)=>new Promise<unknown>(resolve=>s.once(name,resolve));
const rpc:Rpc=async(name,args)=>{
 const query=name==='ml_health'?'select public.ml_health() v':name==='ml_maintenance'?'select public.ml_maintenance(20) v':`select public.${name}($1::jsonb) v`;
 const result=(await db.query<{v:unknown}>(query,['ml_room','ml_watch','ml_chat'].includes(name)?[JSON.stringify(args.p_request)]:[])).rows[0].v;
 if(loseNext&&name==='ml_room'&&(args.p_request as {op:string}).op==='ready'){loseNext=false;lost=true;throw Error('simulated lost database response after commit');}
 return result;
};
async function start(){server=createGateway({rpc,databaseRequirement:STAGE3_DATABASE_REQUIREMENT,origin:'https://test.example',pollMs:500,maintenanceMs:60000,allowLoopback:true});server.http.listen(0,'127.0.0.1');await once(server.http,'listening');url=`http://127.0.0.1:${(server.http.address() as {port:number}).port}`;}
async function client(transport:'polling'|'upgrade'='polling'){
 const s=io(url,{autoConnect:false,transports:transport==='polling'?['polling']:['polling','websocket'],reconnection:false,extraHeaders:{Origin:'https://test.example'}});sockets.push(s);const connected=socketEvent(s,'connect');s.connect();await connected;return s;
}
const emit=(s:Socket,event:string,input:unknown)=>s.timeout(5000).emitWithAck(event,input) as Promise<Reply>;
const identity=(name:string)=>({name,token:randomBytes(32).toString('hex'),requestId:randomUUID()});
beforeAll(async()=>{db=await database();await db.exec('set role anon');await start();},30000);
afterAll(async()=>{for(const s of sockets)s.disconnect();await server.close();await db.close();});

it('P2-N01 strict protocol rejects state uploads, tick, forged actor and capability replacement',()=>{
 const good={op:'game',requestId:randomUUID(),matchId:randomUUID(),revision:0,intent:{type:'end'}};
 expect(commandSchema.safeParse(good).success).toBe(true);
 for(const bad of [{...good,intent:{type:'tick'}},{...good,actor:0},{...good,token:'a'.repeat(64)},{...good,intent:{type:'end',actor:0}},{...good,state:{}},{...good,intent:{type:'setup',seed:1}}])expect(commandSchema.safeParse(bad).success).toBe(false);
 expect(attachSchema.safeParse({op:'join',...identity('test'),code:'0012'}).success).toBe(true);
 expect(attachSchema.safeParse({op:'join',...identity('test'),code:12}).success).toBe(false);
});
it('P2-N02 one-port static/health/readiness; no source/config leakage and wrong browser Origin blocked',async()=>{
 expect((await fetch(url+'/health').then(r=>r.json())).ok).toBe(true);expect((await fetch(url+'/ready')).status).toBe(200);
 expect((await fetch(url+'/')).headers.get('content-type')).toContain('text/html');
 for(const path of ['/config/workbuddy-public.json','/database/migrations/003_rooms.sql','/%2e%2e/package.json','/packages/game-core/src/index.ts'])expect((await fetch(url+path)).status).toBe(404);
 const bad=io(url,{autoConnect:false,transports:['polling'],reconnection:false,extraHeaders:{Origin:'https://wrong.example'}});sockets.push(bad);const failure=socketEvent(bad,'connect_error');bad.connect();await failure;expect(bad.connected).toBe(false);bad.disconnect();
});
it('readiness returns 503 for schema 2 without the required rule patch revision',async()=>{
 let health:Record<string,unknown>={ok:true,schemaVersion:2,ruleVersion:'web-v0.1.19'};
 const probe=createGateway({rpc:async()=>health,origin:'https://test.example',maintenanceMs:60000});
 probe.http.listen(0,'127.0.0.1');await once(probe.http,'listening');const base=`http://127.0.0.1:${(probe.http.address() as {port:number}).port}`;
 try{
  expect((await fetch(base+'/ready')).status).toBe(503);
  health={...health,engineRevision:30,batchHReady:true,batchGReady:true,batchDReady:true,batchEReady:true,batchFReady:true,batchCReady:true,yinghaoRulesReady:true,p3CharactersReady:true,potatoRulesReady:true,characterDefinitions:52,stage4Ready:true,cardDefinitions:76,cardInstances:191,draftReady:true,characterSkillsReady:true,stage3Ready:true,classicPatchReady:true,feedbackRulesReady:true,versionedDataReady:true,locationDataReady:true,locationRulesReady:true,waterRulesReady:true,environmentRulesReady:true,classicPlayable:true};expect((await fetch(base+'/ready')).status).toBe(200);
  health={...health,feedbackRulesReady:false};expect((await fetch(base+'/ready')).status).toBe(503);
 }finally{await probe.close();}
});
it('P2-N03 four polling-only clients, lost committed response retry, private snapshots and duplicate game intent',async()=>{
 const clients=await Promise.all([client(),client(),client(),client()]);const people=Array.from({length:4},(_,i)=>identity('网络'+i));
 const states:Snapshot[]=[];const created=await emit(clients[0],'attach',{op:'create',...people[0]});expect(created.ok,created.error).toBe(true);states[0]=created.snapshot!;
 for(let i=1;i<4;i++){const joined=await emit(clients[i],'attach',{op:'join',...people[i],code:states[0].code});expect(joined.ok,joined.error).toBe(true);states[i]=joined.snapshot!;}
 for(let i=0;i<4;i++){
  const s=await rpc('ml_room',{p_request:{op:'view',...people[i],roomId:states[i].roomId,epoch:states[i].epoch}}) as Reply;states[i]=s.snapshot!;
  const req={op:'ready',requestId:randomUUID(),roomRevision:states[i].roomRevision,ready:true};
  if(i===0){loseNext=true;const uncertain=await emit(clients[i],'command',req);expect(uncertain.ok).toBe(false);expect(uncertain.error).toContain('尚未确认');expect(lost).toBe(true);}
  const reply=await emit(clients[i],'command',req);expect(reply.ok,reply.error).toBe(true);if(i===0)expect(reply.duplicate).toBe(true);states[i]=reply.snapshot!;
 }
 const started=await emit(clients[0],'command',{op:'start',requestId:randomUUID(),roomRevision:states[3].roomRevision});expect(started.ok,started.error).toBe(true);
 expect(started.snapshot!.status).toBe('drafting');
 for(let pick=0;pick<4;pick++){
  const a=started.snapshot!.draft!.offer!.actor;
  const v=(await rpc('ml_room',{p_request:{...people[a],roomId:states[a].roomId,epoch:states[a].epoch,op:'view'}}) as RoomReply).snapshot!;
  const r=await emit(clients[a],'command',{op:'draft-pick',requestId:randomUUID(),matchId:v.matchId,revision:v.draft!.revision,offer:v.draft!.offer!.id,character:v.draft!.offer!.candidates![0]});expect(r.ok,r.error).toBe(true);started.snapshot=r.snapshot;
 }
 expect(started.snapshot!.game!.version).toBe('web-v0.1.6');
 let game=started.snapshot!.game!;const actor=game.choice?.actor??game.active;
 for(let i=0;i<4;i++){
  const reply=await rpc('ml_room',{p_request:{...people[i],op:'view',roomId:states[i].roomId,epoch:states[i].epoch}}) as Reply;const v=reply.snapshot!.game!;
  if(i===actor)game=v;
  expect('random' in v||'deck' in v||'queue' in v).toBe(false);for(const p of v.players)expect('hand' in p).toBe(p.seat===i);
  expect(clients[i].io.engine.transport.name).toBe('polling');
 }
 const req={op:'game',requestId:randomUUID(),matchId:started.snapshot!.matchId,revision:game.revision,intent:game.choice?{type:'choose',choice:game.choice.id,accept:false,...(['discard','xiao-overflow','water-discard'].includes(game.choice.kind)?{cards:game.players[actor].hand!.slice(0,game.choice.count)}:{})}:{type:'end'}};
 const reply=await emit(clients[actor],'command',req);expect(reply.ok,reply.error).toBe(true);const repeat=await emit(clients[actor],'command',req);expect(repeat.duplicate).toBe(true);expect(repeat.snapshot!.game!.revision).toBe(reply.snapshot!.game!.revision);
 const other=await emit(clients[(actor+1)%4],'command',{...req,requestId:randomUUID()});expect(other.ok).toBe(false);
 const superseded=socketEvent(clients[actor],'revoked'),disconnected=socketEvent(clients[actor],'disconnect');const replacement=await client('upgrade');const resumed=await emit(replacement,'attach',{op:'resume',name:people[actor].name,token:people[actor].token,roomId:states[actor].roomId});expect(resumed.ok).toBe(true);await superseded;await disconnected;expect(clients[actor].connected).toBe(false);
 const deadline=Date.now()+3000;while(replacement.io.engine.transport.name!=='websocket'&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));expect(replacement.io.engine.transport.name).toBe('websocket');
 const roomId=states[actor].roomId,memberId=resumed.snapshot!.memberId,code=resumed.snapshot!.code;
 await server.close();await start();const recovered=await client();const recovery=await emit(recovered,'attach',{op:'resume',name:people[actor].name,token:people[actor].token,roomId});expect(recovery.ok,recovery.error).toBe(true);expect(recovery.snapshot!.memberId).toBe(memberId);expect(recovery.snapshot!.code).toBe(code);expect(recovery.snapshot!.matchId).toBe(started.snapshot!.matchId);expect(recovery.snapshot!.game!.revision).toBeGreaterThanOrEqual(reply.snapshot!.game!.revision);
 for(const s of sockets)s.disconnect();
},30000);
