import {afterAll,beforeAll,expect,it} from 'vitest';
import {database} from './database';
import {hDevelopmentSQL} from '../../tools/p3-h-runtime-patch.mjs';
import {hFixture,hProfile} from './p3-h-fixture';
import {give,equip} from './p3-fixture';
import {dispatch,validateState,publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {cardApCost,gainAp,overflowDonors} from '../../packages/game-core/src/stage3-resources';
import {gPrime,gPrimeActive,gLogical} from '../../packages/game-core/src/p3-g-cards';
import {cTurnEnd} from '../../packages/game-core/src/p3-c';
import {hCircleGate,hCircleStart} from '../../packages/game-core/src/p3-h-circle';
import {hActiveChoice} from '../../packages/game-core/src/p3-h-active';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import type {GameState,Command,Task} from '../../packages/game-core/src/types';
const db=await database(undefined,29);afterAll(()=>db.close());
beforeAll(async()=>{const previous=(await db.query<{v:any}>("select value v from ml_private.catalog where key='ruleset:web-v0.1.18'")).rows[0].v;await db.exec(await hDevelopmentSQL(hProfile(previous)));});
let serial=0;
async function sql<T>(name:string,s:GameState,args:unknown[]=[],casts:string[]=[]):Promise<T>{return (await db.query<{v:T}>(`select ml_private.${name}($1::jsonb${args.map((_,i)=>`,$${i+2}${casts[i]?'::'+casts[i]:''}`).join('')}) v`,[JSON.stringify(s),...args])).rows[0].v;}
async function run(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:`h011-${++serial}`,revision:s.revision,actor:s.choice?.actor??s.active,...body} as Command,ts=dispatch(s,cmd,at),other=await sql<ReturnType<typeof dispatch>>('dispatch',s,[JSON.stringify(cmd),at],['jsonb','double precision']);
 expect(ts.ok,ts.error).toBe(ok);expect(other.ok,other.error).toBe(ok);
 const differences:string[]=[];const diff=(a:any,b:any,p='')=>{if(a===undefined&&b===undefined)return;if(!a||!b||typeof a!=='object'||typeof b!=='object'){if(JSON.stringify(a)!==JSON.stringify(b))differences.push(`${p}: TS=${JSON.stringify(a)} SQL=${JSON.stringify(b)}`);return;}for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],p+'.'+k);};diff(JSON.parse(JSON.stringify(ts.state)),other.state);if(differences.length)throw Error(differences.slice(0,22).join("\n"));if(ok)validateState(ts.state);else expect(ts.state).toEqual(s);return ts.state;
}
function silenced(role:string){const s=hFixture([role,'character-011','character-048','character-031']);s.players[0].cell='r4c4';s.players[1].cell='r4c5';return s;}
async function circleFixture(role='character-048'){
 let s=hFixture(['character-011',role,'character-025','character-031']);s.players[0].cell='r4c4';s.players[1].cell='r2c4';s=await run(s,{type:'skill',kind:'circle'});return s;
}
async function pass(s:GameState){for(let i=0;s.choice&&i<40;i++)s=await run(s,{type:'choose',choice:s.choice.id,accept:false,...(s.choice.count?{cards:s.players[s.choice.actor].hand.slice(0,s.choice.count)}:{}),...(s.choice.cells?.length?{cell:s.choice.cells[0]}:{})});expect(s.choice).toBeNull();return s;}

for(const [role,kind] of [['character-003','jj'],['character-007','execute'],['character-014','gas'],['character-022','dog'],['character-025','mayi'],['character-038','escape'],['character-039','freeze'],['character-046','feather'],['character-052','magma'],['character-053','clan']])it(`011 blocks forged ${kind} intents atomically and actions agree`,async()=>{
 const s=silenced(role);give(s,0,'basic-039#01');const actions=stage3Actions(s,0);expect(actions.activeBlocker).toBe(1);expect(await sql('stage3_actions',s,[0])).toEqual(actions);
 const cmd={type:'skill',kind,target:2,card:'basic-039#01',region:'教学楼',...(kind==='dog'?{direction:'right'}:{})};await run(s,cmd,false);expect(dispatch(s,{...cmd,id:'reject',revision:s.revision,actor:0} as Command,s.time+1).error).toContain('又开始叫了');
});
it('team ally stays usable and moving away restores active entry without changing counters',async()=>{
 let s=silenced('character-003');s.mode='team';s.players[0].team=s.players[1].team='A';s.players[2].team=s.players[3].team='B';s=await run(s,{type:'skill',kind:'jj'});expect(s.stage3!.jjFree[0]).toBe(true);
 s=silenced('character-003');s.players[0].cell='r3c4';s=await run(s,{type:'skill',kind:'jj'});expect(s.stage3!.jjUsed[0]).toBe(true);
});
for(const [role,as] of [['character-023','elbow'],['character-029','dodge']])it(`011 suppresses ${as} conversion but leaves native card intentions`,async()=>{
 const s=silenced(role);give(s,0,'basic-039#01');await run(s,{type:'play',card:'basic-039#01',targets:[1],as},false);expect(stage3Actions(s,0).cards['basic-039#01'].convertTargets).toEqual([]);
});
it('North free cost is suppressed while locked free costs and committed JJ remain',async()=>{
 const s=silenced('character-006'),d=runtimeForVersion(s.version),card=Object.values(d.cards).find(c=>!c.randomCost&&c.cost!>0&&(d.cardTags[c.id]??[]).includes('帝汶'))!;expect(card).toBeTruthy();
 expect(cardApCost(s as any,0,card.id).cost).toBe(card.cost);expect(await sql('stage3_card_cost',s,[0,card.id])).toEqual(cardApCost(s as any,0,card.id));
 s.stage3!.jjFree[0]=true;expect(cardApCost(s as any,0,card.id).cost).toBe(0);expect(await sql('stage3_card_cost',s,[0,card.id])).toEqual(cardApCost(s as any,0,card.id));
});
it('Yellow suppression keeps two installed slots and one-copy new equipment, without a pair identity',async()=>{
 let s=silenced('character-021');expect(gPrime(s as any,0)).toBe(true);expect(gPrimeActive(s as any,0)).toBe(false);expect(gLogical(s as any,0,[])).toBeUndefined();expect(gLogical(s as any,0,[],2)?.copy).toBe(2);
 give(s,0,'basic-055#01');s=await run(s,{type:'play',card:'basic-055#01',targets:[]});s=await pass(s);expect(s.stage3!.equipment[0]).toEqual(['basic-055#01']);expect(s.stage3!.g!.pairs).toEqual({});
});
it('easy, DaHuanShen counter and Yellow food transfer are skipped without swallowing the original food',async()=>{
 for(const role of ['character-002','character-009','character-021']){
  let s=hFixture(['character-048',role,'character-011','character-031']);s.players[1].cell='r4c4';s.players[2].cell='r4c5';s.players[0].hp=3;give(s,0,'basic-039#01');const ap=s.players[1].ap;s=await run(s,{type:'play',card:'basic-039#01',targets:[]});s=await pass(s);expect(s.players[0].hp).toBe(4);expect(s.players[1].ap).toBe(ap);
 }
});
it('blocked programmer, math, Monkey3 and final6 owner never open an invalid replay window',async()=>{
 for(const role of ['character-033','character-042','character-015','character-001']){
  let s=silenced(role);s.random.dice=[6];s=await run(s,{type:'move'});expect(s.choice).toBeNull();expect(s.movement?.remaining).toBe(3);expect(s.random.dice).toEqual([]);
 }
 let s=hFixture(['character-048','character-033','character-011','character-031']);s.players[1].cell='r4c4';s.players[2].cell='r4c5';s.random.dice=[2];s=await run(s,{type:'move'});expect(s.choice).toBeNull();
});
it('automatic Xiao gains and overflow use the silenced collector, not donor identity',async()=>{
 const s=silenced('character-043');s.players[2].ap=7;const ts=structuredClone(s),got=gainAp(ts as any,2,3),other=await sql<any>('stage3_gain_ap',s,[2,3]);expect(got.taken).toBe(0);expect(other._gain).toEqual(got);delete other._gain;expect(other).toEqual(ts);
 for(const card of s.deck.slice(0,8))give(s,2,card);expect(overflowDonors(s as any,s.order)).toEqual([]);expect(await sql('stage3_overflow',s,[JSON.stringify(s.order)],['jsonb'])).toEqual([]);
});
it('new sleep is blocked; committed sleep and other ongoing states survive N07',async()=>{
 const s=silenced('character-047');const ts=structuredClone(s);cTurnEnd(ts as any,0);const other=await sql<any>('p3c_end',s,[0]);expect(ts.stage3!.c!.sleep[0]).toBe(false);expect(other).toEqual(ts);
 s.stage3!.c!.sleep[0]=true;const after=await sql<any>('p3c_sleep',s,[0,true]);expect(after.players[0].ap).toBe(22);
});
it('active-choice classification excludes forced followups, locked and equipment choices',()=>{
 for(const kind of ['encourage-discard','f-discard','f-target','move-consent','f-bccb','f-tenacity','gear-react','h-attract','water-discard','g-discard'])expect(hActiveChoice(kind)).toBe(false);
 for(const kind of ['encourage','f-self-harm','f-sting','egg-move','g-invisible','east-start'])expect(hActiveChoice(kind)).toBe(true);
});
it('circle is fixed, free, once per personal turn and visible publicly with private permissions hidden',async()=>{
 const s=await circleFixture();expect(s.players[0].ap).toBe(20);expect(s.stage3!.h!.circles[0].regions).toContain('办公室');await run(s,{type:'skill',kind:'circle'},false);
 expect(await sql('stage3_actions',s,[0])).toEqual(stage3Actions(s,0));const v=await sql<any>('public_view',s,[0]);delete v.actions;expect(v).toEqual(publicView(s,0));expect((v.stage3.h as any).circlePermissions).toBeUndefined();
});
it('basic walking pauses before crossing, survives JSON, charges once and resumes original path',async()=>{
 let s=await circleFixture();s=await run(s,{type:'end'});s.random.dice=[6];s=await run(s,{type:'move'});s=await run(s,{type:'step',path:['r1c4','r1c5']});expect(s.choice?.kind).toBe('h-circle-pay');expect(s.players[1].cell).toBe('r2c4');expect(s.choice!.deadline-s.time).toBe(30000);const ap=s.players[1].ap,clock=s.clock.remaining;s=JSON.parse(JSON.stringify(s));s=await run(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].ap).toBe(ap-1);expect(s.players[1].cell).toBe('r1c5');expect(s.movement?.remaining).toBe(1);expect(s.clock.remaining).toBe(clock);
});
for(const mode of ['reject','timeout','noAP'])it(`circle ${mode} blocks movement without spending or overlapping`,async()=>{
 let s=await circleFixture();s=await run(s,{type:'end'});s.random.dice=[6];s=await run(s,{type:'move'});if(mode==='noAP')s.players[1].ap=0;s=await run(s,{type:'step',path:['r1c4']});
 if(mode!=='noAP'){expect(s.choice?.kind).toBe('h-circle-pay');s=await run(s,mode==='timeout'?{type:'tick'}:{type:'choose',choice:s.choice!.id,accept:false},true,mode==='timeout'?s.choice!.deadline:s.time+1);}
 expect(s.players[1].cell).toBe('r2c4');expect(s.movement?.remaining).toBe(3);expect(s.phase).toBe('moving');expect(s.choice).toBeNull();
});
it('circle swap preflights both actors, refuses atomically, preserving the physical card cost',async()=>{
 let s=await circleFixture();s=await run(s,{type:'end'});give(s,1,'basic-016#01');s=await run(s,{type:'play',card:'basic-016#01',targets:[2]});expect(s.choice?.kind).toBe('h-circle-pay');const before=s.players.map(q=>q.cell);s=await run(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players.map(q=>q.cell)).toEqual(before);expect(s.discard).toContain('basic-016#01');
});
it('circle swap accepts before either participant moves, and the final cells remain distinct',async()=>{
 let s=await circleFixture();s=await run(s,{type:'end'});give(s,1,'basic-016#01');s=await run(s,{type:'play',card:'basic-016#01',targets:[2]});s=await run(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].cell).toBe('r2c2');expect(s.players[2].cell).toBe('r2c4');expect(s.discard.filter(c=>c==='basic-016#01')).toHaveLength(1);
});
it('circle placement and immunities bypass the fee, source death stops it and next start expires it',async()=>{
 const s=await circleFixture(),resume:Task[]=[{kind:'walk',path:['r1c4']}];
 for(const role of ['character-026','character-044','character-027']){const t=structuredClone(s);t.players[1].character=role as any;if(role==='character-027')give(t,1,'basic-039#01');expect(hCircleGate(t,1,'r1c4',resume)).toBeNull();expect((await sql<any>('p3h_circle_gate',t,[1,'r1c4',JSON.stringify(resume),'initial'],['integer','text','jsonb','text']))._hCircleGate).toBeNull();}
 expect(hCircleGate(s,1,'r1c4',resume,'initial',true)).toBeNull();s.players[0].hp=0;expect(hCircleGate(s,1,'r1c4',resume)).toBeNull();const ts=structuredClone(s);hCircleStart(ts as any,0);expect((await sql<any>('p3h_circle_start',s,[0])).stage3.h).toEqual(ts.stage3!.h);expect(ts.stage3!.h!.circles).toEqual([]);
});
it('committed Yellow second logical card survives entering the silence region on first swap',async()=>{
 let s=hFixture(['character-021','character-011','character-048','character-031']);s.players[1].cell='r4c4';s.players[2].cell='r4c5';give(s,0,'basic-016#01');const cells=s.players.map(q=>q.cell),ap=s.players[0].ap;
 s=await run(s,{type:'play',card:'basic-016#01',targets:[2]});s=await pass(s);expect(s.players.map(q=>q.cell)).toEqual(cells);expect(s.players[0].ap).toBe(ap-2);expect(s.discard.filter(c=>c==='basic-016#01')).toHaveLength(1);expect(s.events.some(e=>e.text.includes('质数第二份'))).toBe(true);
});
it('circle forced dog movement asks the mover, retains caster cost on refusal',async()=>{
 let s=await circleFixture('character-022');s.players[1].cell='r2c5';s.players[2].cell='r2c4';s=await run(s,{type:'end'});const ap=s.players[1].ap;s=await run(s,{type:'skill',kind:'dog',target:2,direction:'up'});expect(s.choice?.kind).toBe('h-circle-pay');expect(s.choice?.actor).toBe(2);s=await run(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[1].ap).toBe(ap-1);expect(s.players[2].cell).toBe('r2c4');
});
for(const accepted of [false,true])it(`monkey18 consent ${accepted} precedes circle fee without duplicate prompts`,async()=>{
 let s=hFixture(['character-011','character-022','character-016','character-031']);s.players[0].cell='r4c4';s.players[1].cell='r2c5';s.players[2].cell='r2c4';s=await run(s,{type:'skill',kind:'circle'});s=await run(s,{type:'end'});s=await run(s,{type:'skill',kind:'dog',target:2,direction:'up'});expect(s.choice?.kind).toBe('move-consent');s=await run(s,{type:'choose',choice:s.choice!.id,accept:accepted});
 if(accepted){expect(s.choice?.kind).toBe('h-circle-pay');s=await run(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[2].cell).toBe('r1c4');}else{expect(s.choice).toBeNull();expect(s.players[2].cell).toBe('r2c4');expect(s.stage3!.h!.circlePermissions).toEqual({});}
});
for(const roll of [2,6])it(`jelly dry die ${roll} precedes circle payment`,async()=>{
 let s=hFixture(['character-011','character-022','character-036','character-031']);s.players[0].cell='r4c4';s.players[1].cell='r2c5';s.players[2].cell='r4c3';s=await run(s,{type:'skill',kind:'circle'});s=await run(s,{type:'end'});s.random.dice=[roll];s=await run(s,{type:'skill',kind:'dog',target:2,direction:'left'});
 if(roll===6){expect(s.choice?.kind).toBe('h-circle-pay');s=await run(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[2].cell).toBe('r4c2');}else{expect(s.choice).toBeNull();expect(s.players[2].cell).toBe('r4c3');expect(s.stage3!.h!.circlePermissions).toEqual({});}
});
for(const accepted of [false,true])it(`collision circle ${accepted} preflights push chain before pusher enters occupied square`,async()=>{
 let s=await circleFixture('character-045');s.players[0].cell='r1c1';s.players[1].cell='r4c5';s.players[2].cell='r4c6';s=await run(s,{type:'end'});s.random.dice=[6];s=await run(s,{type:'move'});s=await run(s,{type:'step',path:['r4c6']});expect(s.choice?.kind).toBe('h-circle-pay');expect(s.choice?.actor).toBe(2);expect(s.players[1].cell).toBe('r4c5');expect(s.players[2].cell).toBe('r4c6');s=await run(s,{type:'choose',choice:s.choice!.id,accept:accepted});
 expect(s.players[1].cell).toBe(accepted?'r4c6':'r4c5');expect(s.players[2].cell).toBe(accepted?'r4c8':'r4c6');expect(new Set(s.players.map(q=>q.cell)).size).toBe(4);
});
it('native elbow damage survives circle refusal while both displacement participants stay put',async()=>{
 let s=await circleFixture('character-023');s.players[1].cell='r3c4';s.players[2].cell='r2c4';s=await run(s,{type:'end'});give(s,1,'basic-002#01');const hp=s.players[2].hp;s=await run(s,{type:'play',card:'basic-002#01',targets:[2],direction:'up'});expect(s.choice?.kind).toBe('h-circle-pay');s=await run(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[2].hp).toBe(hp-1);expect(s.players[1].cell).toBe('r3c4');expect(s.players[2].cell).toBe('r2c4');
});
it('off-map removal is a boundary crossing and refusal keeps the target on board',async()=>{
 let s=await circleFixture();s=await run(s,{type:'end'});give(s,1,'basic-034#01');s.random.dice=[1];s=await run(s,{type:'skill',kind:'quote-cost',card:'basic-034#01'});s=await run(s,{type:'play',card:'basic-034#01',targets:[]});expect(s.choice?.kind).toBe('h-circle-pay');s=await pass(s);expect(s.stage4!.offMap[1]).toBe(false);expect(s.players[1].cell).toBe('r2c4');expect(s.discard).toContain('basic-034#01');
});
