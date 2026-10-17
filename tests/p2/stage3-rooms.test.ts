import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createStage3Draft,dispatchDraft,draftView} from '../../packages/game-core/src/draft';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
const db=await database();afterAll(()=>db.close());for(const file of ['stage3-generated.sql','stage3-rooms-generated.sql'])await db.exec(await readFile('database/engine/'+file,'utf8'));
const q=async<T=any>(sql:string,args:unknown[]=[])=>((await db.query<{v:T}>(sql,args)).rows[0].v);
const clock=async(at:number)=>db.exec(`create or replace function ml_private.now_ms() returns bigint language sql as $$select ${at}::bigint$$;`);
async function room(){
 await clock(1000);const people=Array.from({length:4},(_,i)=>({name:'三阶段玩家'+i,token:(crypto.randomUUID()+crypto.randomUUID()).replaceAll('-',''),epoch:1}));
 const intake=await q('select public.ml_room($1::jsonb) v',[JSON.stringify({op:'create',...people[0],requestId:crypto.randomUUID()})]);expect(intake.ok,intake.error).toBe(true);const roomId=intake.snapshot.roomId;
 const call=(a:number,op:string,extra={})=>q('select public.ml_room($1::jsonb) v',[JSON.stringify({...people[a],roomId,op,...extra})]);
 for(let i=1;i<4;i++)expect((await call(i,'join',{code:intake.snapshot.code,requestId:'join'})).ok).toBe(true);
 for(let i=0;i<4;i++){const v=(await call(i,'view')).snapshot;expect((await call(i,'ready',{requestId:'ready',roomRevision:v.roomRevision,ready:true})).ok).toBe(true);}
 const ready=(await call(0,'view')).snapshot,started=await call(0,'start',{requestId:'start',roomRevision:ready.roomRevision});expect(started.ok,started.error).toBe(true);expect(started.snapshot.status).toBe('drafting');expect(started.snapshot.game).toBeNull();return {people,call,roomId,started:started.snapshot};
}
it('authority factory has exact 12/15 overlapping pools, random first seat, and deterministic TS/SQL draft steps',async()=>{
 const firsts=new Set<number>();for(const mode of ['ffa','team'] as const)for(let seed=1;seed<=12;seed++){
  const random={seed,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false};let ts=createStage3Draft(mode,random,1000),sql=await q('select ml_private.stage3_create_draft($1,$2::jsonb,1000) v',[mode,JSON.stringify(random)]);expect(sql).toEqual(ts);firsts.add(ts.order[0]);
  if(mode==='team'){expect(ts.pools['机械猴子']).toHaveLength(12);expect(ts.pools['帝汶家族']).toHaveLength(15);}
  for(let i=0;i<4;i++){const o=ts.offer!,cmd={id:'factory-'+i,type:'pick' as const,actor:o.actor,revision:ts.revision,offer:o.id,character:o.candidates[0]};const output=await q('select ml_private.dispatch_draft($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(sql),JSON.stringify(cmd),2000+i]);const result=dispatchDraft(ts,cmd,2000+i);expect(output).toEqual(result);ts=result.state;sql=output.state;}
  expect(new Set(ts.selected).size).toBe(4);
 }expect(firsts.size).toBe(4);
});
it('real RPC start persists a separate draft with private candidates; a credentialed spectator sees the offer but cannot pick',async()=>{
 const {call,roomId,started}=await room();const stored=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[roomId]);expect(stored.game).toBeNull();expect(stored.draft.random.secure).toBe(true);
 const actor=stored.draft.offer.actor;for(let a=0;a<4;a++){const snapshot=(await call(a,'view')).snapshot;expect(snapshot.draft).toEqual(draftView(stored.draft,a));expect(snapshot.draft.offer.candidates?.length).toBe(a===actor?3:undefined);expect(JSON.stringify(snapshot)).not.toContain('"random"');}
 const watch={name:'三阶段观众',token:'a'.repeat(64),epoch:1};const watching=await q('select public.ml_watch($1::jsonb) v',[JSON.stringify({...watch,op:'join',code:started.code,requestId:crypto.randomUUID()})]);expect(watching.ok,watching.error).toBe(true);expect(watching.snapshot.draft.offer.candidates).toHaveLength(3);
 const bad=await q('select public.ml_watch($1::jsonb) v',[JSON.stringify({...watch,roomId,op:'draft-pick',requestId:'forged',matchId:started.matchId,revision:0,offer:stored.draft.offer.id,character:stored.draft.offer.candidates[0]})]);expect(bad.ok).toBe(false);
});
it('pick/reconnect/retry fences preserve the exact offer and deadline, and four picks create one playable game with the same members/code',async()=>{
 const {call,roomId,started,people}=await room();let raw=await q('select draft v from ml_private.rooms where id=$1',[roomId]);const original=structuredClone(raw),a=raw.offer.actor;
 const wrong=await call((a+1)%4,'draft-pick',{requestId:'wrong-actor',matchId:started.matchId,revision:raw.revision,offer:raw.offer.id,character:raw.offer.candidates[0]});expect(wrong.ok).toBe(false);expect(await q('select draft v from ml_private.rooms where id=$1',[roomId])).toEqual(original);
 const resumed=await call(a,'resume');expect(resumed.ok).toBe(true);expect(resumed.snapshot.draft.offer).toEqual(draftView(original,a).offer);people[a].epoch=resumed.snapshot.epoch;
 let lastRequest:any,lastActor=0;
 for(let i=0;i<4;i++){
  await clock(2000+i*100);raw=await q('select draft v from ml_private.rooms where id=$1',[roomId]);lastActor=raw.offer.actor;lastRequest={requestId:'pick-'+i,matchId:started.matchId,revision:raw.revision,offer:raw.offer.id,character:raw.offer.candidates[0]};
  const picked=await call(lastActor,'draft-pick',lastRequest);expect(picked.ok,picked.error).toBe(true);const retry=await call(lastActor,'draft-pick',lastRequest);expect(retry.duplicate).toBe(true);expect(retry.snapshot).toEqual(picked.snapshot);
  const mutated=await call(lastActor,'draft-pick',{...lastRequest,character:raw.offer.candidates[1]});expect(mutated.ok).toBe(false);
 }
 const final=(await call(0,'view')).snapshot,stored=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[roomId]);expect(final.status).toBe('playing');expect(final.game.version).toBe('web-v0.1.6');expect(final.code).toBe(started.code);expect(final.matchId).toBe(started.matchId);expect(final.members.map((m:any)=>m.name)).toEqual(people.map(p=>p.name));expect(final.game.players.map((p:any)=>p.character)).toEqual(stored.draft.selected);expect(final.game.order).toEqual(stored.draft.order);
 expect((await call(lastActor,'draft-pick',{...lastRequest,requestId:'stale-match'})).ok).toBe(false);expect(stored.game.random.secure).toBe(true);
 expect(final.game.actions.stage3).toEqual(stage3Actions(stored.game,0));expect(final.game).not.toHaveProperty('cardStack');expect(final.game.stage3).not.toHaveProperty('costLocks');expect(JSON.stringify(final)).not.toContain('"seed"');for(const p of final.game.players)expect(p.hand!==undefined).toBe(p.seat===0);
});
it('timeout catches all four thirty-second offers up without renewals and starts the game at the last draft deadline',async()=>{
 const {call,roomId}=await room();const before=await q('select draft v from ml_private.rooms where id=$1',[roomId]);expect(before.offer.deadline).toBe(31000);await clock(121000);const viewed=await call(0,'view');expect(viewed.ok,viewed.error).toBe(true);const stored=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[roomId]);expect(stored.status).toBe('playing');expect(stored.draft.events.filter((e:any)=>e.kind==='pick').map((e:any)=>e.at)).toEqual([31000,61000,91000,121000]);expect(stored.game.time).toBe(121000);expect(stored.game.order).toEqual(before.order);
});
