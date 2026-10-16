// Explicit isolated-cloud integration test. Synthetic identities remain in memory.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {io} from 'socket.io-client';
import {createWorkBuddyCloud,createMemoryStorage} from '@tencent-ai/workbuddy-cloud-sdk';
const path=process.argv[2];if(!path||!process.argv.includes('--isolated-test'))throw Error('Usage: node tools/verify-cloud-gateway.mjs <config> --isolated-test [--report=<path>]');
const raw=JSON.parse(await readFile(path,'utf8')),config=raw.publicConfig??raw,origin=new URL(config.endpoint).origin;
const cloud=createWorkBuddyCloud({endpoint:origin,publishableKey:config.publishableKey,storage:createMemoryStorage(),fetch:(input,init={})=>{const headers=new Headers(init.headers);headers.set('Origin',origin);return fetch(input,{...init,headers,signal:AbortSignal.timeout(20000)});}});
const report={startedAt:new Date().toISOString(),runtime:process.version,checks:[],passed:false};
const mark=s=>{report.checks.push(s);console.log('PASS '+s);};
const need=(b,s)=>{if(!b)throw Error(s);};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const people=Array.from({length:4},(_,i)=>({name:'网关验证'+randomUUID().slice(0,5)+'-'+i,token:randomBytes(32).toString('hex')}));
const states=Array(4),clients=Array(4);let child;
const url='http://127.0.0.1:3230';
async function start(){
 child=spawn(process.execPath,['server-dist/index.mjs'],{env:{...process.env,WORKBUDDY_PUBLIC_CONFIG:path,ML_LOOPBACK:'1',PORT:'3230'},stdio:['ignore','pipe','pipe'],windowsHide:true});
 let stderr='';child.stderr.on('data',b=>{stderr+=b.toString();});
 const deadline=Date.now()+30000;while(Date.now()<deadline){if(child.exitCode!==null)throw Error('Gateway failed to start');try{if((await fetch(url+'/health')).ok)return;}catch{}await delay(200);}throw Error('Gateway startup timed out');
}
async function stop(){if(!child||child.exitCode!==null)return;const exited=once(child,'exit');child.kill('SIGKILL');await exited;}
async function connect(i,resume=false){
 const s=io(url,{autoConnect:false,reconnection:false,transports:['polling'],extraHeaders:{Origin:origin}});clients[i]=s;
 const connected=new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});s.connect();await connected;
 s.on('snapshot',v=>{states[i]=v;});
 const p=people[i];const attachment=resume?{op:'resume',...p,roomId:states[i].roomId}:{op:i===0?'create':'join',...p,requestId:randomUUID(),...(i===0?{}:{code:states[0].code})};
 const reply=await s.timeout(45000).emitWithAck('attach',attachment);need(reply.ok,reply.error??'Attach rejected');states[i]=reply.snapshot;
}
async function rpc(i,op,extra={}){const {data,error}=await cloud.database.rpc('ml_room',{p_request:{...people[i],op,roomId:states[i].roomId,epoch:states[i].epoch,requestId:randomUUID(),...extra}});need(!error,'Direct test RPC unavailable');if(data.snapshot)states[i]=data.snapshot;return data;}
async function command(i,op,extra={}){await rpc(i,'view');const reply=await clients[i].timeout(25000).emitWithAck('command',{op,requestId:randomUUID(),...(op==='game'?{matchId:states[i].matchId,revision:states[i].game.revision}:{roomRevision:states[i].roomRevision}),...extra});need(reply.ok,reply.error??'Command rejected');if(reply.snapshot)states[i]=reply.snapshot;return reply;}
try {
 for(const table of ['rooms','catalog','archives','receipts','intakes','rate_limits']){
  const {error}=await cloud.database.from(table).select('*').limit(1);need(Boolean(error),'Private table unexpectedly exposed: '+table);
 }
 const internal=await cloud.database.rpc('dispatch',{previous:{},cmd:{},at:0});need(Boolean(internal.error),'Private dispatch exposed');mark('anonymous data plane rejects private table names and engine RPC');
 await start();for(let i=0;i<4;i++)await connect(i);
 for(let i=0;i<4;i++)await command(i,'ready',{ready:true});await command(0,'start');
 await rpc(0,'view');let s=states[0];
 // Clear only voluntary opening choices using the same permitted UI intent.
 for(let n=0;s.game.choice&&n<8;n++){const a=s.game.choice.actor;await command(a,'game',{intent:{type:'choose',choice:s.game.choice.id,accept:false}});s=states[a];}
 need(!s.game.choice&&s.game.phase==='action','No action clock to observe');
 const before={roomId:s.roomId,code:s.code,matchId:s.matchId,revision:s.game.revision,active:s.game.active,round:s.game.round,members:s.members.map(m=>m.id),deadline:s.game.clock.since+s.game.clock.remaining};
 mark('four polling-only clients open a real cloud match through built Node gateway');
 await stop();for(const c of clients)c.disconnect();
 const wait=Math.max(0,before.deadline-Date.now())+2500;console.log('WAIT cloud action deadline with gateway process killed ('+Math.ceil(wait/1000)+' seconds)');await delay(wait);
 await start();for(let i=0;i<4;i++)await connect(i,true);
 await rpc(0,'view');s=states[0];
 need(s.roomId===before.roomId&&s.code===before.code&&s.matchId===before.matchId,'Restart changed room/match');need(s.members.map(m=>m?.id).join()===before.members.join(),'Restart changed members');
 need(s.game.revision>before.revision,'Restart failed to catch up elapsed deadline');need(s.game.active!==before.active||s.game.round>before.round||s.game.result,'Original timed-out actor still active');
 report.outage={waitMs:wait,roomPreserved:true,matchPreserved:true,membersPreserved:true,clockCaughtUp:true};mark('SIGKILL, real action deadline passes, new process resumes same room/match/members and catches up clock');
 const stale=await clients[0].timeout(25000).emitWithAck('command',{op:'game',requestId:randomUUID(),matchId:before.matchId,revision:before.revision,intent:{type:'end'}});need(!stale.ok,'Pre-outage revision accepted');mark('pre-outage game revision rejected');
 report.passed=true;
}catch(error){report.failure=error.message;process.exitCode=1;console.error('FAIL '+error.message);}
finally{for(const c of clients)c?.disconnect();await stop();report.finishedAt=new Date().toISOString();const out=process.argv.find(a=>a.startsWith('--report='))?.slice(9);if(out)await writeFile(out,JSON.stringify(report,null,2)+'\n');}
