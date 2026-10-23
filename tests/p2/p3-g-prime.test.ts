import {expect,it} from 'vitest';
import {gFixture,gRun,gDrain} from './p3-g-fixture';
import {give as rawGive,equip} from './p3-fixture';
import {rememberExerciseOwner} from '../../packages/game-core/src/exercise';
import type {GameState} from '../../packages/game-core/src/types';
import {runtimeForVersion,ruleManifest,isActiveRuleVersion} from '../../packages/game-data/src/index';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import {createStage3Draft} from '../../packages/game-core/src/draft';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import {cardApCost} from '../../packages/game-core/src/stage3-resources';

it('an early real-engine G tick has no revision, clock or checkpoint side effects',()=>{
 const s=gFixture(),cmd={id:'g-idle-tick',revision:s.revision,actor:s.active,type:'tick'} as const,r=dispatch(s,cmd,s.time+1);expect(r).toEqual({state:s,ok:true});expect(r.state).toBe(s);
});
it('programming is available again at the next real personal start',()=>{
 let s=gFixture(['character-042','character-033','character-025','character-031']);s.random.dice=[3,4];s=gRun(s,{type:'move'});expect(s.choice?.kind).toBe('g-program');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});s=gRun(s,{type:'choose',choice:s.choice!.id,option:'1'});expect(s.stage3!.g!.programUsed[1]).toBe(true);s=gRun(s,{type:'stop'});s=gDrain(gRun(s,{type:'end'}));expect(s.active).toBe(1);expect(s.stage3!.g!.programUsed).toEqual([false,false,false,false]);
});
function give(s:GameState,a:number,card:string){rawGive(s,a,card);rememberExerciseOwner(s,a,card);}

it('G formal setup and draft enable43 roles while saved v17 remains35',()=>{
 expect(runtimeForVersion('web-v0.1.18').characterIds).toHaveLength(43);expect(runtimeForVersion('web-v0.1.17').characterIds).toHaveLength(35);expect(isActiveRuleVersion('web-v0.1.18')).toBe(true);expect(ruleManifest('web-v0.1.18').status).toBe('playable');
 expect(createGame({mode:'ffa',seed:42,seats:[0,1,2,3],ruleVersion:'web-v0.1.18',characters:['character-009','character-012','character-021','character-022']},1000).stage3?.g).toBeDefined();
 const random={seed:42,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false};expect(createStage3Draft('ffa',random,1000,'web-v0.1.18').pools.S1).toHaveLength(43);expect(createStage3Draft('ffa',random,1000,'web-v0.1.17').pools.S1).toHaveLength(35);
});
it('one physical food pays final fee plus1 once, resolves twice, and enters discard once',()=>{
 let s=gFixture();s.players[0].hp=1;give(s,0,'basic-039#01');s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.players[0]).toMatchObject({hp:3,ap:18});expect(s.discard.filter(c=>c==='basic-039#01')).toHaveLength(1);expect(s.resolving).toEqual([]);expect(s.cardStack!.serial).toBe(2);expect(s.events.filter(e=>e.type==='play')).toHaveLength(2);
});
it('each logical attack has fresh responses, but its original exercise entity grants discard income once',()=>{
 let s=gFixture();s.players[1].ap=0;const hp=s.players[1].hp;give(s,0,'basic-003#01');s=gRun(s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.players[1].hp).toBe(hp-2);expect(s.players[0].ap).toBe(17);expect(s.players[0].attacks).toBe(2);expect(s.discard.filter(c=>c==='basic-003#01')).toHaveLength(1);
});
it('countering the first logical food does not cancel the second or charge again',()=>{
 let s=gFixture(['character-021','character-002','character-025','character-031']);s.players[0].hp=1;give(s,0,'basic-039#01');s.random.dice=[6];s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});const original=s.choice!.id;s=gRun(s,{type:'choose',choice:original,accept:true});expect(s.choice?.kind).toBe('easy');expect(s.choice!.id).not.toBe(original);expect(s.players[0].hp).toBe(1);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[0]).toMatchObject({hp:2,ap:18});expect(s.discard.filter(c=>c==='basic-039#01')).toHaveLength(1);
});
it('a free higher exercise response costs1AP, supplies two child chains and discards its entity once',()=>{
 let s=gFixture(['character-048','character-021','character-025','character-031']);give(s,0,'basic-003#01');give(s,1,'basic-004#01');s=gRun(s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.choice).toMatchObject({kind:'response',actor:1});s=gRun(s,{type:'choose',choice:s.choice!.id,card:'basic-004#01'});expect(s.players[1]).toMatchObject({hp:3,ap:20});expect(s.events.find(e=>e.type==='response')?.text).toContain('支付1AP');expect(s.cardStack!.serial).toBe(3);expect(s.discard.filter(c=>c==='basic-004#01')).toHaveLength(1);
 s=gFixture(['character-048','character-021','character-025','character-031']);s.players[1].ap=0;give(s,0,'basic-003#01');give(s,1,'basic-004#01');s=gRun(s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.choice).toBeNull();expect(s.players[1].hp).toBe(2);expect(s.players[1].hand).toContain('basic-004#01');
});
it('the second logical attack drops a now illegal original target rather than retargeting',()=>{
 let s=gFixture(['character-021','character-018','character-025','character-031']);s.players[0].cell='r1c2';s.players[1].cell='r1c3';give(s,0,'basic-006#01');s.random.dice=[6,6];s=gRun(s,{type:'play',card:'basic-006#01',targets:[1]});s=gDrain(s);expect(s.players[1].hp).toBe(3);expect(s.players[1].cell).toMatch(/r[12]c[45]/);expect(s.random.dice).toEqual([6]);expect(s.events.filter(e=>e.type==='dice'&&e.text.startsWith('吸血'))).toHaveLength(1);
});
it('both logical copies retain the prime active skill lineage for existing character immunity',()=>{
 for(const immune of ['character-026','character-044']){let s=gFixture(['character-021',immune,'character-025','character-031']);s.players[1].ap=0;give(s,0,'basic-003#01');const hp=s.players[1].hp;s=gRun(s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.players[1].hp).toBe(hp);expect(s.players[0].ap).toBe(17);}
});
it('prime final costs apply after temporary free effects, preserve signed fees and add1 to declared X',()=>{
 let s=gFixture();s.stage3!.jjFree[0]=true;expect(cardApCost(s as any,0,'basic-039#01').cost).toBe(1);s.stage3!.jjFree[0]=false;
 expect(cardApCost(s as any,0,'basic-032#01',-1).cost).toBe(0);
 give(s,0,'basic-025#01');const before=s.players[0].hand.length;s=gRun(s,{type:'play',card:'basic-025#01',targets:[],x:2});expect(s.players[0].ap).toBe(17);expect(s.players[0].hand.length).toBe(before-1+4);
});
it('prime interrupt pays once and resolves both logical cards before ending the original personal turn',()=>{
 let s=gFixture();s.active=1;give(s,0,'basic-017#01');s=gRun(s,{actor:0,type:'play',card:'basic-017#01',targets:[]});s=gDrain(s);expect(s.cardStack!.serial).toBe(2);expect(s.stage4!.interrupts).toEqual([]);expect(s.discard.filter(c=>c==='basic-017#01')).toHaveLength(1);expect(s.players[0].ap).toBe(17);expect(s.active).toBe(0);expect(s.round).toBe(2);
});
it('a caster killed by the first logical cards reflection discards the entity once and advances automatically',()=>{
 let s=gFixture();s.players[0].hp=1;s.players[1].ap=0;give(s,0,'basic-003#01');equip(s,1,'basic-051#01');s=gRun(s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.choice?.kind).toBe('gear-reflect');s=gDrain(gRun(s,{type:'choose',choice:s.choice!.id,accept:true}));expect(s.players[0].hp).toBe(0);expect(s.active).toBe(1);expect(s.phase).toBe('action');expect(s.discard.filter(c=>c==='basic-003#01')).toHaveLength(1);expect(s.cardStack!.serial).toBe(1);
});
