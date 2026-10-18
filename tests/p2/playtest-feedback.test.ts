import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {createGame,dispatch,validateState,legalSteps} from '../../packages/game-core/src/index';
import type {GameState,Command} from '../../packages/game-core/src/types';
import {nativeLandings} from '../../packages/game-core/src/classic';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import {relocationCell,nearestShore,northTargets} from '../../packages/game-core/src/playtest';
const db=await database(undefined,19);afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
function fixture(characters=['character-048','character-031','character-006','character-040'],version='web-v0.1.8',mode:'ffa'|'team'='ffa'){
 const s=createGame({mode,ruleVersion:version as any,seed:42,seats:[0,1,2,3],characters:characters as any,first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=20;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};validateState(s);return s;
}
function hand(s:GameState,a:number,card:string){s.deck=s.deck.filter(c=>c!==card);s.players[a].hand.push(card);}
let serial=0;
async function run(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:'feedback-'+(++serial),actor:s.choice?.actor??s.active,revision:s.revision,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=await q('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at]);
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);if(!ok)expect(ts.state).toEqual(s);return ts.state;
}
async function drain(s:GameState){for(let n=0;s.choice&&n<30;n++){const c=s.choice;s=await run(s,{type:'choose',choice:c.id,accept:false,...(c.kind==='native-shore'?{cell:c.cells![0]}:{}),...(c.count?{cards:[...s.players[c.actor].hand].sort().slice(0,c.count)}:{})});}return s;}
it('installs019 and creates v8 games identically in TS/PostgreSQL',async()=>{
 const setup={mode:'ffa',ruleVersion:'web-v0.1.8',seed:42,seats:[0,1,2,3],first:0,characters:['character-048','character-031','character-006','character-040']};
 expect(await q('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).toEqual(createGame(setup as any,1000));
 const h=await q('select public.ml_health() v');expect(h.engineRevision).toBe(19);expect(h.ruleVersion).toBe('web-v0.1.8');expect(h.stage4Ready).toBe(true);expect(h.versionedDataReady).toBe(true);
});
it('gives only role choices30s and keeps repeated easy judgement in its original deadline',async()=>{
 let s=fixture(['character-048','character-002','character-006','character-040']);hand(s,0,'basic-039#01');s=await run(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice?.kind).toBe('easy');expect(s.choice!.deadline-s.time).toBe(30000);const deadline=s.choice!.deadline;
 s.random.dice=[1];s=await run(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice!.deadline).toBe(deadline);
 for(const kind of ['west-carry','runner-roll','draw-start','water-discard','card-counter','gear-react','discard']){
  const v=await q('select ml_private.select_choice($1::jsonb,$2,0,1001) v',[JSON.stringify(fixture()),kind]);expect(v.choice.deadline-1001).toBe(['west-carry','runner-roll','draw-start'].includes(kind)?30000:kind==='discard'?20000:10000);
 }
});
it('Laiwan and Sakura exclude their user in v8 while old v7 and GivePoints retain self',async()=>{
 for(const version of ['web-v0.1.7','web-v0.1.8'])for(const card of ['basic-011#01','basic-012#01','basic-014#01']){
  let s=fixture(['character-048','character-031','character-023','character-040'],version);hand(s,0,card);s=await run(s,{type:'play',card,targets:[]});s=await drain(s);expect(s.players[0].hp).toBe(version==='web-v0.1.8'&&card!=='basic-011#01'?5:4);
 }
});
it('rejects an occupied walking step without spending, and preserves the old crossing rule',async()=>{
 for(const version of ['web-v0.1.7','web-v0.1.8']){
  let s=fixture(undefined,version);s.random.dice=[6];s=await run(s,{type:'move'});expect(legalSteps(s).includes('r1c3')).toBe(version==='web-v0.1.7');await run(s,{type:'step',path:['r1c3']},version==='web-v0.1.7');
 }
});
it('West completes a multi-step walk then carries a legal neighbour to a distinct bank, without AP charge',async()=>{
 let s=fixture(['character-040','character-031','character-006','character-048']);s.players[0].cell='r1c1';s.players[1].cell='r1c2';s.players[2].cell='r3c4';s.players[3].cell='r4c5';s.random.dice=[2,6];
 s=await run(s,{type:'move',direction:'down'});s=await run(s,{type:'step',path:['r2c1','r3c1']});expect(s.choice).toBeNull();s=await run(s,{type:'stop'});expect(s.choice?.kind).toBe('west-carry');expect(s.choice!.deadline-s.time).toBe(30000);
 s=await run(s,{type:'choose',choice:s.choice!.id,target:1,cell:'r3c2'});expect(s.players[1].cell).toBe('r3c2');expect(s.players[1].ap).toBe(20);expect(s.players[1].moved).toBe(false);validateState(s);
});
it('every native including lemon leaps one straight water segment for one step and cannot stop in water',async()=>{
 for(const character of ['character-004','character-006','character-010','character-040']){
  const others=['character-048','character-031','character-023'];let s=fixture([character,...others]);s.players[0].cell='r3c2';s.players[1].cell='r1c1';s.players[2].cell='r1c2';s.players[3].cell='r1c4';
  expect(nativeLandings(s,0)).toContain('r3c4');expect(await q('select ml_private.classic_landings($1::jsonb,0) v',[JSON.stringify(s)])).toEqual(nativeLandings(s,0));
  s.random.dice=character==='character-040'?[2,2]:[2];s=await run(s,{type:'move',...(character==='character-040'?{direction:'right'}:{})});await run(s,{type:'step',path:['r3c3']},false);s=await run(s,{type:'step',path:['r3c4']});expect(s.players[0].cell).toBe('r3c4');expect(s.players[0].hand).toHaveLength(0);expect(s.players[0].ap).toBe(19);
 }
});
it('blocked far shore has no side landing and forced diagonal water relocation resolves only to the first shore',async()=>{
 const s=fixture(['character-004','character-031','character-006','character-040']);s.players[0].cell='r3c2';s.players[1].cell='r3c4';expect(nativeLandings(s,0)).not.toContain('r2c4');expect(nativeLandings(s,0)).not.toContain('r4c4');
 for(const [from,to] of [['r3c2','r3c3'],['r2c2','r3c3'],['r4c2','r4c3']]){const ts=relocationCell(s,0,from,to);expect(await q('select ml_private.playtest_relocation_cell($1::jsonb,0,$2,$3) v',[JSON.stringify(s),from,to])).toBe(ts);}
});
it('North target exclusion uses current target factions and replaces source-faction immunity',async()=>{
 for(const mode of ['ffa','team'] as const){let s=fixture(['character-048','character-006','character-004','character-045'],'web-v0.1.8',mode);s.players[0].cell='r2c4';s.players[1].cell='r3c4';s.players[2].cell='r3c5';s.players[3].cell='r4c5';s.players[3].faction='机械猴子';s.players[1].faction=s.players[2].faction='帝汶家族';hand(s,0,'basic-003#01');if(mode==='team')s.players[0].team='A',s.players[1].team=s.players[2].team=s.players[3].team='B';
  await run(s,{type:'play',card:'basic-003#01',targets:[1,2]},false);let v=await run(s,{type:'play',card:'basic-003#01',targets:[1,3]});v=await drain(v);expect(v.players[1].ap).toBe(19);expect(v.players[3].ap).toBe(19);v=await run(s,{type:'play',card:'basic-003#01',targets:[2,3]});v=await drain(v);expect(v.players[2].ap).toBe(19);
 }
});
it('automatic groups require a branch and cannot bypass North by auto-targeting',async()=>{
 let s=fixture(['character-048','character-006','character-004','character-045']);s.players[3].faction='机械猴子';hand(s,0,'basic-012#01');await run(s,{type:'play',card:'basic-012#01',targets:[]},false);
 let v=await drain(await run(s,{type:'play',card:'basic-012#01',targets:[],northGroup:'north'}));expect(v.players[1].hp).toBe(s.players[1].hp-1);expect(v.players[2].hp).toBe(s.players[2].hp);expect(v.players[0].hp).toBe(s.players[0].hp);
 expect(await q('select ml_private.playtest_north_targets($1::jsonb,$2::jsonb,$3,true) v',[JSON.stringify(s),'[1,2,3]','others'])).toEqual(northTargets(s,[1,2,3],'others',true));
});
it('floods trigger reserved shore choices and leave the layer unchanged if no legal bank exists',async()=>{
 let s=fixture(['character-048','character-004','character-006','character-040']);s.players[0].cell='r1c1';s.players[1].cell='r2c4';s.players[2].cell='r3c4';s.players[3].cell='r3c1';hand(s,0,'basic-033#01');s.random.dice=[1];s=await run(s,{type:'skill',kind:'quote-cost',card:'basic-033#01'});s=await run(s,{type:'play',card:'basic-033#01',targets:[],region:'操场'});expect(s.choice?.kind).toBe('native-shore');expect(s.choice!.deadline-s.time).toBe(10000);s=await drain(s);validateState(s);expect(s.players[1].cell).not.toBe('r2c4');expect(s.players[2].cell).not.toBe('r3c4');
 expect(await q('select ml_private.playtest_nearest_shore($1::jsonb,1) v',[JSON.stringify(s)])).toEqual(nearestShore(s,1));
});
it('no-bank flood preserves its previous layer, consumes the submitted entity and does not strand a native',async()=>{
 let s=fixture(['character-048','character-004','character-006','character-040']);s.players[0].cell='r1c1';s.players[1].cell='r3c4';s.players[2].cell='r3c1';s.players[3].cell='r4c1';
 const effect={origin:'card' as const,actor:0,faction:s.players[0].faction,roleModifiers:[]};
 for(const region of ['教学楼','秀松苑','尚德荟','食堂','飞船','XDF','办公室','帝汶岛','樱花大道','云上学府','山洞'])s.stage4!.water[region]={owner:0,effect};
 // Only playground and the occupied farm remain dry; playground cannot be flooded safely.
 hand(s,0,'basic-033#01');s.random.dice=[1];s=await run(s,{type:'skill',kind:'quote-cost',card:'basic-033#01'});s=await run(s,{type:'play',card:'basic-033#01',targets:[],region:'操场'});
 expect(s.stage4!.water['操场']).toBeUndefined();expect(s.discard).toContain('basic-033#01');expect(s.players[1].cell).toBe('r3c4');expect(s.choice).toBeNull();
});
it('v8 player action projections match SQL, including impossible water destinations',async()=>{
 const s=fixture(['character-004','character-031','character-006','character-040']);s.players[0].cell='r1c8';hand(s,0,'basic-012#01');
 for(let a=0;a<4;a++){
  expect(await q('select ml_private.stage3_actions($1::jsonb,$2) v',[JSON.stringify(s),a])).toEqual(stage3Actions(s,a));
  expect(await q('select ml_private.stage4_actions($1::jsonb,$2) v',[JSON.stringify(s),a])).toEqual(stage4Actions(s,a));
 }
});
it('forced relocation preserves positions on a blocked shore and performs a valid shoreline landing atomically',async()=>{
 let s=fixture(['character-048','character-004','character-006','character-040']);s.players[1].cell='r3c2';s.players[0].cell='r1c1';
 for(const blocked of [false,true]){
  const state=structuredClone(s);if(blocked)state.players[2].cell='r3c4';
  const v=await q('select ml_private.stage3_relocate($1::jsonb,1,$2,false) v',[JSON.stringify(state),'r3c3']);expect(v.players[1].cell).toBe(blocked?'r3c2':'r3c4');expect(v.players[1].hand).toEqual([]);
 }
});
it('a native revived into a flooded fixed spawn immediately chooses a shore instead of remaining in water',async()=>{
 let s=fixture(['character-048','character-004','character-006','character-040']);s.players[0].cell='r1c1';s.players[1].hp=0;s.players[1].ap=0;s.players[1].eliminated=1;s.stage3!.deathTurns[1]=s.stage3!.completedTurn;
 s.stage4!.water['操场']={owner:0,effect:{origin:'card',actor:0,faction:s.players[0].faction,roleModifiers:[]}};hand(s,0,'basic-037#01');s.random.dice=[1];
 s=await run(s,{type:'skill',kind:'quote-cost',card:'basic-037#01'});s=await run(s,{type:'play',card:'basic-037#01',targets:[1]});expect(s.players[1].hp).toBe(1);expect(s.choice?.kind).toBe('native-shore');s=await drain(s);expect(s.players[1].cell).not.toBe('r2c4');expect(s.players[1].cell).not.toBe('r3c4');validateState(s);
});
