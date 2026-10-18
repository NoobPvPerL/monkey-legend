import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {createGame,dispatch,validateState,publicView} from '../../packages/game-core/src/index';
import type {GameState,Command,Setup} from '../../packages/game-core/src/types';
import {rememberExerciseOwner,discardCards,higherExerciseResponse} from '../../packages/game-core/src/exercise';
import {cardForVersion} from '../../packages/game-data/src/index';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
const db=await database(undefined,20);afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
function fixture(version='web-v0.1.9'){
 const s=createGame({mode:'ffa',ruleVersion:version as any,seed:42,seats:[0,1,2,3],characters:['character-048','character-040','character-023','character-026'],first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=20;}
 if(s.exercise)s.exercise.owners={};
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};validateState(s);return s;
}
function hand(s:GameState,a:number,card:string,owner=a){s.deck=s.deck.filter(c=>c!==card);s.players[a].hand.push(card);rememberExerciseOwner(s,owner,card);}
let serial=0;
async function run(s:GameState,body:Record<string,unknown>,ok=true){
 const at=s.time+1,cmd={id:'exercise-'+(++serial),actor:s.choice?.actor??s.active,revision:s.revision,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=await q('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at]);
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);if(!ok)expect(ts.state).toEqual(s);return ts.state;
}
async function drain(s:GameState){for(let n=0;s.choice&&n<40;n++)s=await run(s,{type:'choose',choice:s.choice.id,accept:false,card:null});return s;}
it('creates v9 identically, stores first physical owners privately and leaves v8 costs unchanged',async()=>{
 const setup:Setup={mode:'ffa',ruleVersion:'web-v0.1.9',seed:42,seats:[0,1,2,3],characters:['character-048','character-040','character-023','character-026'],first:0};
 const ts=createGame(setup,1000);expect(await q('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).toEqual(ts);
 for(const p of ts.players)for(const card of p.hand.filter(c=>/basic-00[345]#/.test(c)))expect(ts.exercise!.owners[card]).toBe(p.seat);
 expect(publicView(ts,0)).not.toHaveProperty('exercise');
 for(const [i,id] of ['basic-003','basic-004','basic-005'].entries()){expect(cardForVersion(id as any,'web-v0.1.9').cost).toBe(i+3);expect(cardForVersion(id as any,'web-v0.1.8').cost).toBe(i+1);}
 const h=await q('select public.ml_health() v');expect(h.engineRevision).toBe(20);expect(h.versionedDataReady).toBe(true);
});
for(const [i,card] of ['basic-003#01','basic-004#01','basic-005#01'].entries())it(`charges ${i+3}AP once and refunds ${card} once on normal cleanup`,async()=>{
 let s=fixture();hand(s,0,card);s=await run(s,{type:'play',card,targets:[1]});s=await drain(s);
 expect(s.players[0].ap).toBe(20-(i+3)+1);expect(s.players[1].ap).toBe(20-i-1);expect(s.discard.filter(c=>c===card)).toHaveLength(1);
});
it('free strictly higher responses protect only the defender, including zero AP, with no attack or counter damage',async()=>{
 let s=fixture();hand(s,0,'basic-003#01');hand(s,1,'basic-004#01');s.players[1].ap=0;
 s=await run(s,{type:'play',card:'basic-003#01',targets:[1,2]});expect(s.choice?.kind).toBe('response');expect(s.choice!.deadline-s.time).toBe(10000);
 expect(s.choice!.cards).toContain('basic-004#01');expect(stage4Actions(s,1).cards['basic-004#01'].cost).toBe(0);
 expect(await q('select ml_private.stage4_actions($1::jsonb,1) v',[JSON.stringify(s)])).toEqual(stage4Actions(s,1));
 s=await run(s,{type:'choose',choice:s.choice!.id,card:'basic-004#01'});s=await drain(s);
 expect(s.players[1].hp).toBe(5);expect(s.players[1].ap).toBe(1);expect(s.players[2].ap).toBe(19);expect(s.players[0].hp).toBe(5);expect(s.players[0].ap).toBe(18);
 expect(s.events.filter(e=>e.type==='play')).toHaveLength(1);expect(s.events.some(e=>e.type==='response'&&e.text.includes('支付0AP'))).toBe(true);
});
it('equal/lower grades and old v8 cannot respond; unauthorized or expired cards cannot be submitted',async()=>{
 for(const version of ['web-v0.1.8','web-v0.1.9']){
  let s=fixture(version);hand(s,0,'basic-004#01');hand(s,1,'basic-003#01');hand(s,1,'basic-004#02');hand(s,2,'basic-005#01');
  s=await run(s,{type:'play',card:'basic-004#01',targets:[1,2]});
  if(version==='web-v0.1.9'){expect(s.choice!.actor).toBe(2);expect(s.choice!.cards).toEqual(['basic-005#01']);await run(s,{type:'choose',choice:s.choice!.id,card:'basic-004#02'},false);}
  else expect(s.choice).toBeNull();
 }
 expect(higherExerciseResponse('web-v0.1.9','basic-005','basic-005')).toBe(false);
});
it('refunds the first owner after transfer and after reshuffle/redraw, never changes ownership',async()=>{
 let s=fixture();hand(s,1,'basic-003#01',0);s=await run(s,{type:'end'});s=await drain(s);
 // Test the physical lifecycle directly so no turn/location AP masks each gain.
 s=fixture();hand(s,1,'basic-003#01',0);s.players[1].hand=[];const before=structuredClone(s);
 discardCards(s as any,['basic-003#01']);expect(await q('select ml_private.exercise_discard($1::jsonb,$2::jsonb) v',[JSON.stringify(before),JSON.stringify(['basic-003#01'])])).toEqual(s);expect(s.players[0].ap).toBe(21);expect(s.players[1].ap).toBe(20);
 s.discard=[];s.deck.unshift('basic-003#01');const drawBase=structuredClone(s);const card=s.deck.shift()!;rememberExerciseOwner(s,2,card);s.players[2].hand.push(card);
 const sql=await q('select ml_private.draw($1::jsonb,2,1) v',[JSON.stringify(drawBase)]);expect(sql.exercise).toEqual(s.exercise);expect(s.exercise!.owners[card]).toBe(0);
 s.players[2].hand=[];discardCards(s as any,[card]);expect(s.players[0].ap).toBe(22);
});
it('unowned deck discards give no reward; dead first owners remain at zero AP',async()=>{
 for(const dead of [false,true]){let s=fixture();const card='basic-005#01';s.deck=s.deck.filter(c=>c!==card);if(dead){rememberExerciseOwner(s,0,card);s.players[0].hp=0;s.players[0].ap=0;s.players[0].eliminated=1;}const previous=structuredClone(s);discardCards(s as any,[card]);expect(await q('select ml_private.exercise_discard($1::jsonb,$2::jsonb) v',[JSON.stringify(previous),JSON.stringify([card])])).toEqual(s);expect(s.players[0].ap).toBe(dead?0:20);}
});
it('voluntary discard, forced delivery and elimination all use the first-owner reward',async()=>{
 let s=fixture();hand(s,1,'basic-003#01',0);s.choice={id:1,kind:'water-discard',actor:1,paused:true,deadline:11000,count:1,cards:['basic-003#01']};s.choiceSerial=1;s.phase='choice';s.clock.since=null;
 s=await run(s,{type:'choose',choice:1,cards:['basic-003#01']});expect(s.players[0].ap).toBe(21);
 s=fixture();hand(s,0,'basic-011#01');hand(s,1,'basic-003#01',2);s=await run(s,{type:'play',card:'basic-011#01',targets:[]});
 while(s.choice&&s.choice.actor!==1)s=await run(s,{type:'choose',choice:s.choice.id,card:null});expect(s.choice!.kind).toBe('forced-card');s=await run(s,{type:'choose',choice:s.choice!.id,card:'basic-003#01'});expect(s.players[2].ap).toBe(21);
 s=fixture();hand(s,0,'basic-007#01');hand(s,1,'basic-004#01',2);s.players[1].hp=1;s=await run(s,{type:'play',card:'basic-007#01',targets:[1]});s=await drain(s);expect(s.players[1].hp).toBe(0);expect(s.players[2].ap).toBe(21);
});
it('requires the full upfront cost before its later refund and rolls back rejected plays',async()=>{
 let s=fixture();hand(s,0,'basic-003#01');s.players[0].ap=2;await run(s,{type:'play',card:'basic-003#01',targets:[1]},false);
});
it('a transferred higher-grade response refunds its original owner, not the zero-AP responder',async()=>{
 let s=fixture();hand(s,0,'basic-004#01');hand(s,1,'basic-005#01',2);s.players[1].ap=0;
 s=await run(s,{type:'play',card:'basic-004#01',targets:[1]});s=await run(s,{type:'choose',choice:s.choice!.id,card:'basic-005#01'});s=await drain(s);
 expect(s.players[1].ap).toBe(0);expect(s.players[1].hp).toBe(5);expect(s.players[2].ap).toBe(21);
});
it('physical exercise converted to elbow still refunds on discard without changing the conversion fee',async()=>{
 let s=fixture();s.active=2;s.cursor=s.order.indexOf(2);hand(s,2,'basic-003#01',0);s.players[2].cell='r2c4';s.players[1].cell='r3c4';
 s=await run(s,{type:'play',card:'basic-003#01',as:'elbow',targets:[1],direction:'down'});s=await drain(s);
 expect(s.players[2].ap).toBe(18);expect(s.players[0].ap).toBe(21);
});
