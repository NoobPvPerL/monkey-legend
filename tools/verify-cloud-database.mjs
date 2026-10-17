// Writes synthetic rooms only. Require an explicit isolated-test flag; never run
// automatically on install/build/start and never print capabilities/config keys.
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {createWorkBuddyCloud,createMemoryStorage} from '@tencent-ai/workbuddy-cloud-sdk';
if(!process.argv.includes('--isolated-test')||!process.argv[2]||process.argv[2].startsWith('--'))throw Error('Usage: npm run verify:cloud-database -- <publicConfig.json> --isolated-test [--report=<file>]');
const raw=JSON.parse(await readFile(process.argv[2],'utf8')),config=raw.publicConfig??raw;
const endpoint=new URL(config.endpoint);if(endpoint.protocol!=='https:'||typeof config.publishableKey!=='string')throw Error('Expected HTTPS endpoint and public publishableKey');
const report={version:JSON.parse(await readFile('package.json','utf8')).version,engine:'WorkBuddy cloud PostgreSQL RPC',checks:[],passed:false};
const mark=name=>{report.checks.push(name);console.log('PASS '+name);};
const cloud=createWorkBuddyCloud({endpoint:endpoint.origin,publishableKey:config.publishableKey,storage:createMemoryStorage(),fetch:(input,init={})=>{const headers=new Headers(init.headers);headers.set('Origin',endpoint.origin);return fetch(input,{...init,headers,signal:AbortSignal.timeout(20000)});}});
async function rpc(request){const {data,error}=await cloud.database.rpc('ml_room',{p_request:request});if(error)throw Error('Cloud RPC failed: '+(error.code??'unknown'));return data;}
function need(ok,message){if(!ok)throw Error(message);}
const prefix='验证'+randomUUID().slice(0,6),people=Array.from({length:4},(_,i)=>({name:prefix+'-'+i,token:randomBytes(32).toString('hex')}));
const call=(i,op,extra={})=>rpc({...people[i],op,requestId:randomUUID(),...extra});
const snapshot=async i=>{const r=await call(i,'view');need(r.ok,'View rejected');return r.snapshot;};
const lobby=async(i,op,extra={})=>call(i,op,{roomRevision:(await snapshot(i)).roomRevision,...extra});
try{
 const health=await cloud.database.rpc('ml_health',{});need(!health.error&&health.data?.ok&&health.data?.schemaVersion===2&&health.data?.engineRevision>=16&&health.data?.feedbackRulesReady===true&&health.data?.versionedDataReady===true&&health.data?.locationDataReady===true&&health.data?.locationRulesReady===true&&health.data?.waterRulesReady===true&&health.data?.environmentRulesReady===true&&health.data?.classicPlayable===true&&health.data?.classicPatchReady===true&&health.data?.draftReady===true&&health.data?.characterSkillsReady===true&&health.data?.stage3Ready===true&&health.data?.ruleVersion==='web-v0.1.6','Database migration/anon RPC is not ready');mark('schema 2 and anonymous RPC ready');
 const intake={...people[0],op:'create',requestId:randomUUID()};const first=await rpc(intake);need(first.ok,'Create rejected');need(/^\d{4}$/.test(first.snapshot.code),'Invalid room code');const again=await rpc(intake);need(again.ok&&again.duplicate&&again.snapshot.roomId===first.snapshot.roomId,'Create retry was not idempotent');
 Object.assign(people[0],{roomId:first.snapshot.roomId,epoch:first.snapshot.epoch});for(let i=1;i<4;i++){const r=await call(i,'join',{code:first.snapshot.code});need(r.ok,'Join rejected');Object.assign(people[i],{roomId:r.snapshot.roomId,epoch:r.snapshot.epoch});}mark('four identities, four-digit code and lost intake acknowledgement');
 const bad=await rpc({...people[0],token:randomBytes(32).toString('hex'),op:'resume'});need(!bad.ok,'Wrong credential resumed a seat');
 const old={...people[0]};const resumed=await call(0,'resume');need(resumed.ok,'Resume rejected');people[0].epoch=resumed.snapshot.epoch;need(!(await rpc({...old,op:'view'})).ok,'Old connection still has authority');mark('credential rejection and connection fencing');
 const retained=[];let expectedCode=first.snapshot.code;
 for(const mode of ['ffa','team']){
  if(mode==='team'){
   for(const p of people){delete p.roomId;delete p.epoch;p.token=randomBytes(32).toString('hex');}
   const created=await call(0,'create');need(created.ok,'Second isolated room rejected');expectedCode=created.snapshot.code;Object.assign(people[0],{roomId:created.snapshot.roomId,epoch:created.snapshot.epoch});
   for(let i=1;i<4;i++){const joined=await call(i,'join',{code:expectedCode});need(joined.ok,'Second room join rejected');Object.assign(people[i],{roomId:joined.snapshot.roomId,epoch:joined.snapshot.epoch});}
  }
  need((await lobby(0,'mode',{mode})).ok,'Mode rejected');for(let i=0;i<4;i++)need((await lobby(i,'ready',{ready:true})).ok,'Ready rejected');const started=await lobby(0,'start');need(started.ok,'Start rejected');let s=started.snapshot;
  need(s.status==='drafting'&&s.game===null,'Expected separate authoritative draft');
  for(let i=0;i<4;i++){
   const a=s.draft.offer.actor,v=await snapshot(a);need(v.draft.offer.candidates.length===3,'Private draft offer missing');
   for(let p=0;p<4;p++)if(p!==a)need(!(await snapshot(p)).draft.offer.candidates,'Other player offer leaked');
   const req={...people[a],op:'draft-pick',requestId:randomUUID(),matchId:v.matchId,revision:v.draft.revision,offer:v.draft.offer.id,character:v.draft.offer.candidates[0]};
   const picked=await rpc(req);need(picked.ok,'Draft pick rejected');need((await rpc(req)).duplicate,'Draft retry was not idempotent');s=picked.snapshot;
  }
  need(s.game.version==='web-v0.1.6'&&new Set(s.game.players.map(p=>p.character)).size===4,'Draft did not create a unique four-role game');mark(mode+' private draft, four picks and retries');
  for(let i=0;i<4;i++){const v=await snapshot(i);need(!('random' in v.game)&&!('deck' in v.game)&&!('queue' in v.game),'Private engine data leaked');for(const p of v.game.players)need(('hand' in p)===(p.seat===i),'Another hand leaked');}
  // Protected spawn areas can remain safe indefinitely. This checks a bounded
  // sequence of legal turns; reaching a result depends on the live random map.
  let steps=0;while(!s.game.result&&steps<24){steps++;const a=s.game.choice?.actor??s.game.active;s=await snapshot(a);const c=s.game.choice;const intent=c?{type:'choose',choice:c.id,accept:false,card:null,...(['discard','water-discard','xiao-overflow'].includes(c.kind)?{cards:s.game.players[a].hand.slice(0,c.count)}:{}),...(c.kind==='elbow-push'?{cell:c.cells[0]}:{})}:{type:'end'};
   const req={...people[a],op:'game',requestId:randomUUID(),matchId:s.matchId,revision:s.game.revision,intent};const r=await rpc(req);need(r.ok,'Game command rejected');if(steps===1){const repeat=await rpc(req);need(repeat.ok&&repeat.duplicate&&repeat.snapshot.game.revision===r.snapshot.game.revision,'Duplicate game command executed');const changed=await rpc({...req,intent:{type:'move'}});need(!changed.ok,'Same ID with changed payload accepted');}s=r.snapshot;
  }
  need(s.code===expectedCode&&s.members.every(Boolean),'Game changed room/players');mark(mode+' bounded legal turns over real HTTPS RPC, privacy and idempotence');
  // An unfinished test match cannot be abandoned through the lobby RPC. Keep
  // its credentials only in this process and report it rather than claiming a
  // natural victory or silently modifying private tables.
  if(!s.game.result){retained.push({mode,code:s.code,roomId:s.roomId});mark('isolated '+mode+' room remains '+s.code+' for test-environment cleanup');}else{for(let i=0;i<4;i++)need((await lobby(i,'leave')).ok,'Test member cleanup failed');}
 }
 report.retainedTestRooms=retained;report.passed=true;
}catch(error){report.failure=error.message;process.exitCode=1;console.error('FAIL '+error.message);}
finally{const path=process.argv.find(a=>a.startsWith('--report='))?.slice(9);if(path)await writeFile(path,JSON.stringify(report,null,2)+'\n');}
