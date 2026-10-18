import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {createGame,dispatch,validateState,publicView,legalTargets} from '../../packages/game-core/src/index';
import type {GameState,Command} from '../../packages/game-core/src/types';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import {locationCardAllowed} from '../../packages/game-core/src/locations';
import {cardForVersion} from '../../packages/game-data/src/index';
const db=await database(undefined,21);afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
function fixture(version:'web-v0.1.9'|'web-v0.1.10'='web-v0.1.10',characters=['character-048','character-031','character-003','character-040']){
 const s=createGame({mode:'ffa',ruleVersion:version,seed:42,seats:[0,1,2,3],characters:characters as any,first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=20;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};validateState(s);return s;
}
function hand(s:GameState,a:number,...cards:string[]){for(const card of cards){s.deck=s.deck.filter(c=>c!==card);s.players[a].hand.push(card);}validateState(s);}
let serial=0;
async function run(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:'card-feedback-'+(++serial),revision:s.revision,actor:s.choice?.actor??s.active,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=await q('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at]);
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);if(!ok)expect(ts.state).toEqual(s);return ts.state;
}
async function drain(s:GameState){for(let n=0;s.choice&&n<30;n++){const c=s.choice;s=await run(s,{type:'choose',choice:c.id,accept:false,...(c.count?{cards:[...s.players[c.actor].hand].sort().slice(0,c.count)}:{})});}expect(s.choice).toBeNull();return s;}
it('creates v10 in both engines and retains exercise costs and private physical owners',async()=>{
 const setup={mode:'ffa',ruleVersion:'web-v0.1.10',seed:42,seats:[0,1,2,3],first:0};const ts=createGame(setup as any,1000);
 expect(await q('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).toEqual(ts);
 for(const [i,id] of ['basic-003','basic-004','basic-005'].entries())expect(cardForVersion(id as any,'web-v0.1.10').cost).toBe(i+3);
 expect(publicView(ts,0)).not.toHaveProperty('exercise');expect((await q('select public.ml_health() v')).engineRevision).toBe(21);
});
for(const version of ['web-v0.1.9','web-v0.1.10'] as const)it(`${version} preserves exactly its own location prohibitions in view and dispatch`,async()=>{
 for(const [cell,allowed] of [['r1c2','basic-010'],['r1c4','basic-009']] as const)for(const id of ['basic-009','basic-010']){
  const s=fixture(version);s.players[0].cell=cell;hand(s,0,id+'#01');const expected=version==='web-v0.1.10'&&id===allowed;
  expect(locationCardAllowed(version,cell,id)).toBe(expected);expect(await q('select ml_private.location_card_allowed($1,$2,$3) v',[version,cell,id])).toBe(expected);
  const actions=stage4Actions(s,0);expect(await q('select ml_private.stage4_actions($1::jsonb,0) v',[JSON.stringify(s)])).toEqual(actions);
  expect(actions.cards[id+'#01'].allowed).toBe(expected);if(expected)expect(legalTargets(s,0,id+'#01')).toContain(1);
  s.random.dice=[6];await run(s,{type:'play',card:id+'#01',targets:[1]},expected);
 }
});
it('JJ exposure does not copy self healing, coffee, drawing or a targeted tactic; v9 still replays its old heal',async()=>{
 for(const version of ['web-v0.1.9','web-v0.1.10'] as const){let s=fixture(version);s.players[0].hp=3;s.players[2].hp=2;s.stage3!.jjExposed[2]=true;hand(s,0,'basic-039#01');s=await run(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.players[0].hp).toBe(4);expect(s.players[2].hp).toBe(version==='web-v0.1.10'?2:3);}
 for(const card of ['basic-015#01','basic-025#01','basic-018#01']){let s=fixture();s.stage3!.jjExposed[2]=true;hand(s,0,card);const before=structuredClone(s.players[2]);s=await run(s,{type:'play',card,targets:card.startsWith('basic-018')?[1]:[],...(card.startsWith('basic-025')?{x:2}:{})});s=await drain(s);expect(s.players[2]).toEqual(before);expect(s.stage4!.downPending[2]).toBe(false);}
});
it('JJ remains an additional attack target and converted/tea elbows remain attacks',async()=>{
 let s=fixture();s.players[0].cell='r1c4';s.stage3!.jjExposed[2]=true;hand(s,0,'basic-009#01');s.random.dice=[6];s=await run(s,{type:'play',card:'basic-009#01',targets:[1]});s=await drain(s);expect(s.players[1].hp).toBe(2);expect(s.players[2].hp).toBe(3);
 for(const tea of [false,true])for(const protectedJj of [false,true]){let e=fixture('web-v0.1.10',[tea?'character-048':'character-023','character-031','character-003','character-040']);e.stage3!.jjExposed[2]=true;const card=tea?'basic-002#01':'basic-039#01';hand(e,0,card);if(tea)e.stage4!.tea[0]=true;if(protectedJj){e.stage4!.toiletUntil[2]=e.stage3!.starts[2]+1;e.stage4!.toiletEffects[2]={origin:'card',actor:2,faction:e.players[2].faction,roleModifiers:[]};}e=await run(e,{type:'play',card,targets:[1],direction:'down',...(!tea?{as:'elbow'}:{})});e=await drain(e);expect(e.players[2].hp).toBe(protectedJj?4:3);}
});
it('JJ attack exposure expires exactly at own next start and not on the prior end',async()=>{
 let s=fixture('web-v0.1.10',['character-003','character-040','character-048','character-026']);s=await run(s,{type:'skill',kind:'jj'});expect(s.stage3!.jjExposed[0]).toBe(true);
 for(let i=0;i<4;i++){expect(s.active).toBe(i);s=await run(s,{type:'end'});s=await drain(s);if(i<3)expect(s.stage3!.jjExposed[0]).toBe(true);}
 expect(s.active).toBe(0);expect(s.stage3!.jjExposed[0]).toBe(false);
});
it('Weiwen wrong guess gives the caster the actual teleport window, keeps dice private and rejects occupied cells atomically',async()=>{
 let s=fixture();hand(s,0,'basic-021#01');s.random.dice=[3,6];s=await run(s,{type:'play',card:'basic-021#01',targets:[1]});expect(s.choice).toMatchObject({kind:'board-guess',actor:1});expect(JSON.stringify(publicView(s,1))).not.toContain('guessDie');expect(s.events.filter(e=>e.type==='dice')).toHaveLength(0);
 s=await run(s,{type:'choose',choice:s.choice!.id,guess:1});expect(s.choice).toMatchObject({kind:'board-cell',actor:0,source:1});expect(s.events.some(e=>e.text.includes('猜错，由S1选择'))).toBe(true);
 await run(s,{type:'choose',choice:s.choice!.id,cell:s.players[0].cell},false);
 s=await run(s,{type:'choose',choice:s.choice!.id,cell:'r4c8'});s=await drain(s);expect(s.players[1].cell).toBe('r4c8');expect(s.random.dice).toEqual([6]);expect(s.discard).toContain('basic-021#01');
});
it('Weiwen correct guess, guess timeout and destination timeout produce explicit outcomes without rerolling',async()=>{
 for(const kind of ['correct','guess-timeout','destination-timeout']){let s=fixture();hand(s,0,'basic-021#01');s.random.dice=[3,6];s=await run(s,{type:'play',card:'basic-021#01',targets:[1]});
  s=kind==='guess-timeout'?await run(s,{type:'tick'},true,s.choice!.deadline):await run(s,{type:'choose',choice:s.choice!.id,guess:kind==='correct'?3:1});
  if(kind==='guess-timeout'){expect(s.choice?.kind).toBe('board-cell');expect(s.events.some(e=>e.text.includes('猜点超时'))).toBe(true);s=await run(s,{type:'choose',choice:s.choice!.id,cell:'r4c8'});expect(s.players[1].cell).toBe('r4c8');}
  else if(kind==='destination-timeout'){s=await run(s,{type:'tick'},true,s.choice!.deadline);expect(s.events.some(e=>e.text.includes('选择超时'))).toBe(true);expect(s.players[1].cell).toBe('r1c3');}
  else{expect(s.choice).toBeNull();expect(s.events.some(e=>e.text.includes('猜中，位置不变'))).toBe(true);}
  expect(s.random.dice).toEqual([6]);
 }
});
it('purple sandalwood offers an eligible dead player, quotes once and revives through actual v10 play',async()=>{
 let s=fixture();hand(s,0,'basic-037#01');const dead=s.players[1];Object.assign(dead,{hp:0,ap:0,shield:0,eliminated:1});s.stage3!.deathTurns[1]=s.stage3!.turn;
 expect(stage3Actions(s,0).revivalTargets).toEqual([1]);expect(stage4Actions(s,0).cards['basic-037#01'].targets).toEqual([1]);expect(await q('select ml_private.stage4_actions($1::jsonb,0) v',[JSON.stringify(s)])).toEqual(stage4Actions(s,0));
 s.random.dice=[5,6];s=await run(s,{type:'skill',kind:'quote-cost',card:'basic-037#01'});s=await run(s,{type:'skill',kind:'quote-cost',card:'basic-037#01'});expect(s.random.dice).toEqual([6]);s=await run(s,{type:'play',card:'basic-037#01',targets:[1]});s=await drain(s);expect(s.players[1]).toMatchObject({hp:1,ap:0,hand:[],eliminated:null});expect(s.players[0].ap).toBe(15);
});
it('expired revival and a blocked spawn do not become selectable or consume the card/AP',async()=>{
 for(const kind of ['expired','occupied']){const s=fixture();hand(s,0,'basic-037#01');Object.assign(s.players[1],{hp:0,ap:0,shield:0,eliminated:1});s.stage3!.deathTurns[1]=s.stage3!.turn;
  if(kind==='expired')s.stage3!.completedTurn=s.stage3!.turn+1;else{s.players[1].character='character-031';s.players[1].maxHp=3;s.players[0].cell='r1c1';}
  expect(stage4Actions(s,0).cards['basic-037#01'].targets).toEqual([]);s.stage3!.costLocks['basic-037#01']={turn:s.stage3!.turn,cost:3};await run(s,{type:'play',card:'basic-037#01',targets:[1]},false);
 }
});
