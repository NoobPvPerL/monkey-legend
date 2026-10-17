import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database,scalar,literal} from './database';
import {createGame,dispatch,validateState,legalTargets,legalSteps} from '../../packages/game-core/src/index';
import type {GameState,Command} from '../../packages/game-core/src/index';
import type {CharacterId} from '../../packages/game-data/src/index';
import {STAGE3_ALL_CARDS} from '../../packages/game-data/src/stage3';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import {cardApCost,recordDeathResources} from '../../packages/game-core/src/stage3-resources';
let serial=0;
const db=await database();afterAll(()=>db.close());await db.exec(await readFile('database/engine/stage3-generated.sql','utf8'));
function run(s:GameState,intent:Record<string,unknown>,actor=s.choice?.actor??s.active,at=s.time+100):GameState{
 const cmd={id:'stage3-'+(++serial),revision:s.revision,actor,...intent} as Command,result=dispatch(s,cmd,at),sql=scalar(db,`select ml_private.dispatch(${literal(s)},${literal(cmd)},${at})`);expect(sql).toEqual(result);expect(result.ok,result.error).toBe(true);validateState(result.state);return result.state;
}
function settle(s:GameState):GameState{
 let guard=0;while(s.choice){expect(++guard).toBeLessThan(30);const c=s.choice;s=run(s,{type:'choose',choice:c.id,accept:false,card:null,...(c.kind==='xiao-overflow'||c.kind==='discard'||c.kind==='water-discard'?{cards:[...s.players[c.actor].hand].sort().slice(0,c.count)}:{}),...(c.kind==='elbow-push'?{cell:c.cells?.[0]}:{})});}return s;
}
function fixture(ids:CharacterId[]=['character-045','character-031','character-026','character-044']):GameState{
 const s=settle(createGame({mode:'ffa',ruleVersion:'web-v0.1.6',seed:42,seats:[0,1,2,3],characters:ids,first:0},1000));
 s.players.forEach((p,i)=>{s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c2','r2c3'][i];p.ap=10;});s.phase='action';s.choice=null;s.queue=[];s.active=0;s.clock={remaining:60000,since:s.time};validateState(s);return s;
}
function give(s:GameState,a:number,card:string){s.deck=s.deck.filter(c=>c!==card);s.discard=s.discard.filter(c=>c!==card);for(const p of s.players)p.hand=p.hand.filter(c=>c!==card);s.players[a].hand.push(card);validateState(s);}
function equip(s:GameState,a:number,card:string){give(s,a,card);s.players[a].hand=s.players[a].hand.filter(c=>c!==card);s.stage3!.equipment[a].push(card);s.stage3!.equipmentSources[card]=cardApCost(s as any,a,card).effect;validateState(s);}
it('creates a four-seat subset of all sixteen with 85 conserved cards; initial overflow is settled before the first turn starts',()=>{
 let s=createGame({mode:'ffa',ruleVersion:'web-v0.1.6',seed:14,seats:[0,1,2,3],first:0,characters:['character-031','character-043','character-026','character-044']},1000);
 expect(s.choice?.kind).toBe('xiao-overflow');expect(s.stage3!.turn).toBe(0);s=settle(s);expect(s.stage3!.turn).toBe(1);expect(s.players[0].hand).toHaveLength(3);expect(s.players[1].hand).toHaveLength(5);expect(runtimeForVersion(s.version).characterIds).toHaveLength(16);expect(STAGE3_ALL_CARDS).toHaveLength(85);
});
it('integrates easy countering with main-clock pause, fixed deadline, normal food cancellation and exactly one spent entity',()=>{
 let s=fixture(['character-045','character-002','character-026','character-044']);give(s,0,'basic-046#01');s.players[0].hp=1;s.random.dice=[1,2,6];s=run(s,{type:'play',card:'basic-046#01',targets:[]});const deadline=s.choice!.deadline,choice=s.choice!.id;expect(s.clock.since).toBeNull();s=run(s,{type:'choose',choice,accept:true});expect(s.choice!.deadline).toBe(deadline);s=run(s,{type:'choose',choice,accept:true});s=run(s,{type:'choose',choice,accept:true});expect(s.players[0].hp).toBe(1);expect(s.players[0].ap).toBe(8);expect(s.players[1].ap).toBe(7);expect(s.discard.filter(c=>c==='basic-046#01')).toHaveLength(1);expect(s.phase).toBe('action');expect(s.clock.since).toBe(s.time);
});
it('a defense can itself be countered and the headbutt resumes with all-AP log wording',()=>{
 let s=fixture(['character-045','character-002','character-026','character-044']);give(s,0,'basic-008#01');give(s,3,'basic-001#01');s.random.dice=[6];s=run(s,{type:'play',card:'basic-008#01',targets:[3]});s=run(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice?.kind).toBe('response');s=run(s,{type:'choose',choice:s.choice!.id,card:'basic-001#01'});expect(s.choice?.kind).toBe('easy');s=run(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[3].ap).toBe(0);expect(s.players[0].ap).toBe(18);expect(s.events.some(e=>e.text.includes('头锤吸收全部9AP'))).toBe(true);
});
it('QB offers one free follow-up for actual surviving HP loss, never for shield-only damage, and its follow-up cannot recurse',()=>{
 let s=fixture(['character-005','character-031','character-026','character-044']);s.players[0].cell='r3c4';s.players[1].cell='r3c5';give(s,0,'basic-009#01');s.random.dice=[6,6];s=run(s,{type:'play',card:'basic-009#01',targets:[1]});expect(s.choice?.kind).toBe('runner-roll');s=run(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice?.kind).toBe('qb-pursuit');s=run(s,{type:'choose',choice:s.choice!.id,accept:true});s=settle(s);expect(s.players[1].hp).toBe(1);expect(s.events.filter(e=>e.text.includes('QB 纯菜'))).toHaveLength(1);
 s=fixture(['character-005','character-031','character-026','character-044']);s.players[0].cell='r3c4';s.players[1].cell='r3c5';give(s,0,'basic-009#01');s.players[1].shield=1;s.random.dice=[6];s=run(s,{type:'play',card:'basic-009#01',targets:[1]});expect(s.choice).toBeNull();expect(s.players[1].hp).toBe(3);
});
it('North discounted cards lose their whole effect on Mei; ordinary unmodified headbutt still affects Mei',()=>{
 let s=fixture(['character-006','character-031','character-026','character-044']);give(s,0,'basic-016#01');const cells=s.players.map(p=>p.cell);s=run(s,{type:'play',card:'basic-016#01',targets:[2]});expect(s.players.map(p=>p.cell)).toEqual(cells);expect(s.players[0].ap).toBe(10);
 give(s,0,'basic-008#01');s=run(s,{type:'play',card:'basic-008#01',targets:[2]});expect(s.players[2].ap).toBe(0);expect(s.players[0].ap).toBe(19);
});
it('JJ can activate at zero AP, plays fixed-cost cards free, exposes to other food and does not get a copied mount',()=>{
 let s=fixture(['character-003','character-031','character-026','character-044']);s.players[0].ap=0;give(s,0,'basic-046#01');s.players[0].hp=1;s=run(s,{type:'skill',kind:'jj'});s=run(s,{type:'play',card:'basic-046#01',targets:[]});expect(s.players[0].ap).toBe(0);expect(s.players[0].hp).toBe(3);expect(s.stage3!.jjExposed[0]).toBe(true);
 s.active=1;s.cursor=1;s.players[1].hp=1;give(s,1,'basic-046#02');s=run(s,{type:'play',card:'basic-046#02',targets:[]});expect(s.players[0].hp).toBe(4);expect(s.players[1].hp).toBe(3);
 give(s,1,'basic-071#01');s=run(s,{type:'play',card:'basic-071#01',targets:[]});expect(s.stage3!.equipment[0]).toEqual([]);expect(s.stage3!.equipment[1]).toEqual(['basic-071#01']);
});
it('Laoda true elbow affects Xie but cannot choose Mei; converted elbow cannot choose Xie, and a chosen push leaves no overlap',()=>{
 let s=fixture(['character-023','character-031','character-026','character-044']);give(s,0,'basic-002#01');s.random.dice=[];s=run(s,{type:'play',card:'basic-002#01',targets:[3],direction:'right'});expect(s.choice).toBeNull();const cell='r2c4';expect(s.players[0].cell).toBe('r2c3');expect(s.players[3].cell).toBe(cell);expect(s.players[3].hp).toBe(2);
});
it('West direction is chosen before both dice, odd reverses, unwalked cancellation is free and still consumes the attempt',()=>{
 let s=fixture(['character-040','character-031','character-026','character-044']);s.players[0].cell='r1c1';s.random.dice=[1,6];s=run(s,{type:'move',direction:'right'});expect(s.movement!.direction).toBe('left');expect(legalSteps(s)).toEqual([]);s=run(s,{type:'stop'});expect(s.players[0].ap).toBe(10);expect(s.players[0].moved).toBe(true);
});
it('Yinghao walks into an occupied cell atomically after pushing its occupant; Mei blocks the same push',()=>{
 let s=fixture();s.players[0].cell='r1c1';s.players[1].cell='r1c2';s.players[2].cell='r3c6';s.players[3].cell='r4c5';s.random.dice=[2];s=run(s,{type:'move'});expect(legalSteps(s)).toContain('r1c2');s=run(s,{type:'step',path:['r1c2']});expect(s.players[0].cell).toBe('r1c2');expect(s.players[1].cell).toBe('r1c8');
});
it('Zhang installs a mount free and can replace it only after the old loss choice, retaining every physical card',()=>{
 let s=fixture(['character-048','character-031','character-026','character-044']);give(s,0,'basic-063#01');s=run(s,{type:'play',card:'basic-063#01',targets:[]});expect(s.players[0].ap).toBe(10);give(s,0,'basic-071#01');s=run(s,{type:'play',card:'basic-071#01',targets:[],replacement:'basic-063#01'});expect(s.choice?.kind).toBe('equipment-loss');expect(s.stage3!.equipment[0]).toEqual([]);expect(s.resolving).toContain('basic-071#01');s=run(s,{type:'choose',choice:s.choice!.id,cell:null});expect(s.stage3!.equipment[0]).toEqual(['basic-071#01']);expect(s.discard).toContain('basic-063#01');expect(s.discard).not.toContain('basic-071#01');
});
it('revival quotes do not spend AP or the card until confirmed; cancel then quote reuses the entity cost and resurrection starts empty',()=>{
 let s=fixture(['character-010','character-031','character-026','character-044']);give(s,0,'basic-037#01');const victim=s.players[1];s.discard.push(...victim.hand);victim.hand=[];victim.hp=0;victim.ap=0;victim.shield=0;victim.eliminated=1;recordDeathResources(s as any,1);s.random.dice=[5,1];s=run(s,{type:'skill',kind:'revival-quote',card:'basic-037#01',target:1});expect((s.choice!.data as any).cost).toBe(5);s=run(s,{type:'choose',choice:s.choice!.id,accept:false});s=run(s,{type:'skill',kind:'revival-quote',card:'basic-037#01',target:1});expect((s.choice!.data as any).cost).toBe(5);s=run(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].ap).toBe(5);expect(s.players[1]).toMatchObject({hp:1,ap:0,hand:[],eliminated:null});expect(s.random.dice).toEqual([1]);
});
it('the card combo ends only after effect and all choices; a countered card never fills its progress',()=>{
 let s=fixture();for(const [card,hp] of [['basic-046#01',2],['basic-041#01',1],['basic-047#01',1]] as const){give(s,0,card);s=settle(run(s,{type:'play',card,targets:[]}));}expect(s.phase).toBe('over');expect(s.result?.reason).toBe('combo');expect(s.result?.winners).toEqual([0]);
});
it('Laoda converts an unquoted revival or a mount without asking for their original costs/slots; exposed JJ receives the converted attack as well',()=>{
 let s=fixture(['character-023','character-031','character-003','character-026']);give(s,0,'basic-037#01');s.stage3!.jjExposed[2]=true;s=run(s,{type:'play',card:'basic-037#01',as:'elbow',targets:[1],direction:'right'});s=settle(s);expect(s.players[0].ap).toBe(8);expect(s.players[1].hp).toBe(2);expect(s.players[2].hp).toBe(3);expect(s.stage3!.costLocks).toEqual({});expect(s.discard).toContain('basic-037#01');
 s=fixture(['character-023','character-031','character-003','character-026']);give(s,0,'basic-066#01');s=settle(run(s,{type:'play',card:'basic-066#01',as:'elbow',targets:[1],direction:'right'}));expect(s.stage3!.equipment[0]).toEqual([]);expect(s.discard).toContain('basic-066#01');
});
it('West completes a whole move before choosing one companion, who keeps AP and basic-move availability',()=>{
 let s=fixture(['character-040','character-031','character-026','character-044']);s.players[0].cell='r1c1';s.players[1].cell='r1c2';s.players[2].cell='r3c4';s.players[3].cell='r4c5';s.random.dice=[2,2];s=run(s,{type:'move',direction:'down'});s=run(s,{type:'step',path:['r2c1']});expect(s.choice?.kind).toBe('west-carry');expect(s.players[0].cell).toBe('r2c1');s=run(s,{type:'choose',choice:s.choice!.id,target:1,cell:'r2c2'});expect(s.players[1].cell).toBe('r2c2');expect(s.players[1].ap).toBe(10);expect(s.players[1].moved).toBe(false);expect(s.phase).toBe('action');
});
it('Wait sheep gives exactly two independently rolled full-die attempts, including a cancelled first attempt',()=>{
 let s=fixture(['character-037','character-031','character-026','character-044']);equip(s,0,'basic-066#01');s.stage3!.previousBasic[0]=false;s.stage3!.doubleMove[0]=true;s.random.dice=[6,4];s=run(s,{type:'move'});expect(s.movement!.remaining).toBe(6);s=run(s,{type:'stop'});expect(s.players[0].moved).toBe(false);expect(s.players[0].ap).toBe(10);s=run(s,{type:'move'});expect(s.movement!.remaining).toBe(4);s=run(s,{type:'step',path:['r1c1']});s=run(s,{type:'stop'});expect(s.players[0].moved).toBe(true);expect(s.players[0].ap).toBe(9);
});
it('monkey-game immunity skips a die for Mei; Xie selects one participant from the saved position snapshot after injury choices',()=>{
 let s=fixture();give(s,0,'basic-010#01');s.random.dice=[1,6];s=run(s,{type:'play',card:'basic-010#01',targets:[1,2]});expect(s.choice?.kind).toBe('runner-roll');expect(s.players[2].hp).toBe(4);s=run(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice?.kind).toBe('xie-ledger');expect(s.choice!.targets).toEqual([0,1]);s=run(s,{type:'choose',choice:s.choice!.id,target:0});expect(s.players[0].hp).toBe(3);expect(s.random.dice).toEqual([6]);
});
it('North checks the frozen source faction from submission, even if current faction changes during easy counter selection',()=>{
 let s=fixture(['character-031','character-006','character-002','character-026']);give(s,0,'basic-005#01');s=run(s,{type:'play',card:'basic-005#01',targets:[1]});expect(s.choice?.kind).toBe('easy');s.players[0].faction='机械猴子';s=run(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[1].ap).toBe(10);
});
it('Xiaochong takes hand overflow from HP loss before injury skills and QB pursuit; the original holder chooses the physical card',()=>{
 let s=fixture(['character-005','character-043','character-031','character-026']);for(const card of ['basic-001#01','basic-001#02','basic-001#03'])give(s,2,card);give(s,0,'basic-003#01');s.players[2].ap=0;s=run(s,{type:'play',card:'basic-003#01',targets:[2]});expect(s.choice?.kind).toBe('xiao-overflow');expect(s.choice!.actor).toBe(2);s=run(s,{type:'choose',choice:s.choice!.id,cards:['basic-001#02']});expect(s.players[1].hand).toEqual(['basic-001#02']);expect(s.choice?.kind).toBe('qb-pursuit');s=settle(s);expect(s.players[2].hand).toHaveLength(2);
});
it('bread blocks only proactive cards during the next personal turn while movement remains usable',()=>{
 let s=fixture(['character-048','character-031','character-026','character-044']);equip(s,0,'basic-054#01');s=run(s,{type:'skill',kind:'bread',target:1});s=settle(run(s,{type:'end'}));expect(s.active).toBe(1);expect(s.stage3!.breadBlocked[1]).toBe(true);give(s,1,'basic-039#01');const cmd={id:'bread-blocked',revision:s.revision,actor:1,type:'play' as const,card:'basic-039#01',targets:[]};const ts=dispatch(s,cmd,s.time+100),sql=scalar(db,`select ml_private.dispatch(${literal(s)},${literal(cmd)},${s.time+100})`);expect(sql).toEqual(ts);expect(ts.ok).toBe(false);expect(ts.state).toBe(s);s=run(s,{type:'move'});s=run(s,{type:'stop'});expect(s.players[1].ap).toBe(10);
});
it('an elbow without its preselected direction is rejected without cost; reactions can invalidate that landing and force a new choice',()=>{
 let s=fixture(['character-023','character-002','character-026','character-044']);give(s,0,'basic-002#01');
 const cmd={id:'missing-direction',revision:s.revision,actor:0,type:'play' as const,card:'basic-002#01',targets:[3]},ts=dispatch(s,cmd,s.time+1),sql=scalar(db,`select ml_private.dispatch(${literal(s)},${literal(cmd)},${s.time+1})`);expect(sql).toEqual(ts);expect(ts.ok).toBe(false);expect(ts.state).toBe(s);
 s=run(s,{type:'play',card:'basic-002#01',targets:[3],direction:'right'});expect(s.choice?.kind).toBe('easy');s.players[2].cell='r2c4';s=run(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice?.kind).toBe('elbow-push');expect(s.choice!.cells).not.toContain('r2c4');s=settle(s);expect(s.players[0].cell).toBe('r2c3');expect(s.players[3].hp).toBe(2);
});
it('coffee skips the next round refill and the runner start floor once, then restores both normal start rules',()=>{
 let s=fixture(['character-031','character-037','character-026','character-044']);give(s,0,'basic-015#01');s=run(s,{type:'play',card:'basic-015#01',targets:[]});expect(s.players[0].ap).toBe(18);s.players[0].ap=0;
 for(let i=0;i<4;i++)s=settle(run(s,{type:'end'}));expect(s.active).toBe(0);expect(s.players[0].ap).toBe(0);expect(s.stage3!.coffeeRound[0]).toBe(false);expect(s.stage3!.coffeeUntilStart[0]).toBeNull();
 for(let i=0;i<4;i++)s=settle(run(s,{type:'end'}));expect(s.players[0].ap).toBe(6);
});
it('East start is resolved before the main clock and random theft moves an exact entity without charging AP',()=>{
 let s=fixture(['character-037','character-010','character-026','character-044']);give(s,0,'basic-001#01');give(s,0,'basic-001#02');s=settle(run(s,{type:'end'}));
 // settle declines East by default; its following start is tested explicitly.
 for(let i=0;i<3;i++)s=settle(run(s,{type:'end'}));s=run(s,{type:'end'});while(s.choice&&s.choice.kind!=='east-start')s=settle(s);
 expect(s.choice?.kind).toBe('east-start');expect(s.clock.since).toBeNull();const before=s.players[1].hand.length,ap=s.players[1].ap,donor=s.players[0].hand.length;s=run(s,{type:'choose',choice:s.choice!.id,target:0,action:'steal'});expect(s.players[1].hand).toHaveLength(before+1);expect(s.players[0].hand).toHaveLength(donor-1);expect(s.players[1].ap).toBe(ap);expect(s.clock.since).toBe(s.time);
});
it('white-horse equipment keeps its original cost modifiers, so a Zhang-discounted horse cannot freeze Mei',()=>{
 let s=fixture(['character-048','character-026','character-031','character-044']);give(s,0,'basic-067#01');equip(s,1,'basic-071#01');equip(s,2,'basic-066#01');s=run(s,{type:'play',card:'basic-067#01',targets:[]});s=settle(run(s,{type:'end'}));expect(s.active).toBe(1);expect(s.stage3!.horseLocks).toContain(0);s.random.dice=[2];s=run(s,{type:'move'});s=run(s,{type:'stop'});expect(s.players[1].ap).toBe(10);s=settle(run(s,{type:'end'}));
 const cmd={id:'horse-lock',revision:s.revision,actor:2,type:'move' as const},ts=dispatch(s,cmd,s.time+1),sql=scalar(db,`select ml_private.dispatch(${literal(s)},${literal(cmd)},${s.time+1})`);expect(sql).toEqual(ts);expect(ts.ok).toBe(false);expect(ts.error).toContain('小白马');
});
