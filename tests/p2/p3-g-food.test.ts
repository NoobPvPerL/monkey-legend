import {expect,it} from 'vitest';
import {gFixture,gRun,gDrain} from './p3-g-fixture';
import {dispatch,validateState} from '../../packages/game-core/src/index';
import {give,equip} from './p3-fixture';
import {cardApCost} from '../../packages/game-core/src/stage3-resources';
import {gPrimeQuote} from '../../packages/game-core/src/p3-g-cards';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import type {GameState} from '../../packages/game-core/src/types';
function setup(source='character-048'){const s=gFixture(['character-021',source,'character-025','character-031']);s.active=1;s.players[0].hp=1;s.players[1].hp=1;return s;}
function play(s:GameState,card:string){give(s,1,card);return gRun(s,{type:'play',card,targets:[]});}
it('a paid food portion moves globally to HuangChong without a second cast or repeat payment, and keeps60s budget',()=>{
 let s=setup();s=play(s,'basic-039#01');expect(s.choice).toMatchObject({kind:'g-food',actor:0,source:1});expect(s.choice!.deadline-s.time).toBe(30000);const remaining=s.clock.remaining,ap=s.players[1].ap;s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true},true,s.time+6000);expect(s.players[0]).toMatchObject({hp:2,ap:18});expect(s.players[1]).toMatchObject({hp:1,ap});expect(s.clock.remaining).toBe(remaining);expect(s.cardStack!.serial).toBe(1);expect(s.discard.filter(c=>c==='basic-039#01')).toHaveLength(1);
});
it('decline and timeout keep the original beneficiary and never charge the theft fee',()=>{
 for(const timeout of [false,true]){let s=play(setup(),'basic-039#01');s=timeout?gRun(s,{type:'tick'},true,s.choice!.deadline):gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[0]).toMatchObject({hp:1,ap:20});expect(s.players[1].hp).toBe(2);}
});
it('own prime food resolves twice without stealing, while no AP or an off-map thief opens no window',()=>{
 let s=setup();s.active=0;give(s,0,'basic-039#01');s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice).toBeNull();expect(s.players[0].hp).toBe(3);
 for(const reason of ['no-ap','off-map']){s=setup();if(reason==='no-ap')s.players[0].ap=1;else s.stage4!.offMap[0]=true;s=play(s,'basic-039#01');expect(s.choice).toBeNull();expect(s.players[1].hp).toBe(2);}
});
it('other-person active immunity blocks stealing the original portion, including helpful food',()=>{
 for(const role of ['character-026','character-044']){const s=play(setup(role),'basic-039#01');expect(s.choice).toBeNull();expect(s.players[0].hp).toBe(1);expect(s.players[1].hp).toBe(2);expect(s.players[0].ap).toBe(20);}
});
it('countered food never charges or opens theft',()=>{
 let s=gFixture(['character-021','character-048','character-002','character-031']);s.active=1;s.players[1].hp=1;s.random.dice=[6];s=play(s,'basic-039#01');expect(s.choice?.kind).toBe('easy');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toBeNull();expect(s.players[0].ap).toBe(20);expect(s.players[1].hp).toBe(1);
});
it('full-health original recipients still have a transferable portion, resolved at the thiefs current location and gear',()=>{
 let s=setup();s.players[1].hp=s.players[1].maxHp;s.players[0].cell='r2c1';s=play(s,'basic-039#01');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(3);
 s=setup();equip(s,0,'basic-072#01');s=play(s,'basic-039#01');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(3);
 s=setup();s.players[0].cell='r4c4';s=play(s,'basic-045#01');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0]).toMatchObject({hp:2,ap:18,shield:1});expect(s.players[1].hp).toBe(1);
});
it('fruit transfers shield and nutrition transfers draw together with healing, without new submission triggers',()=>{
 for(const card of ['basic-045#01','basic-047#01']){let s=setup();s=play(s,card);const deck=s.deck.length;s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(2);expect(s.players[1].hp).toBe(1);if(card.startsWith('basic-045')){expect(s.players[0].shield).toBe(1);expect(s.players[1].shield).toBe(0);}else{expect(s.players[0].hand).toHaveLength(2);expect(s.players[1].hand).toEqual([]);expect(s.deck).toHaveLength(deck-2);}expect(s.cardStack!.serial).toBe(1);}
});
it('each group beneficiary is offered separately and redirection uses the new recipients identity',()=>{
 let s=gFixture(['character-021','character-010','character-040','character-049']);s.active=1;for(const p of s.players)p.hp=1;s=play(s,'basic-040#01');expect(s.choice).toMatchObject({kind:'g-food',source:1});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(2);expect(s.choice).toMatchObject({kind:'g-food',source:2});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(3);expect(s.players[2].hp).toBe(1);expect(s.choice).toMatchObject({kind:'g-food',source:3});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[0].ap).toBe(16);expect(s.players[3].hp).toBe(2);expect(s.players[1].hp).toBe(1);
});
it('buff food transfers the buff with active-skill lineage and prime still charges its own plus1 fee',()=>{
 for(const [card,buff] of [['basic-042#01','tea'],['basic-043#01','dodge'],['basic-044#01','exerciseFree']] as const){let s=play(setup(),card);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.stage4![buff][0]).toBe(true);expect(s.stage4![buff][1]).toBe(false);expect(s.stage4!.buffSources[`0:${buff}`].roleModifiers).toContainEqual({actor:0,kind:'active'});}
 const s=setup(),effect={origin:'card' as const,actor:0,faction:s.players[0].faction,roleModifiers:[{actor:0,kind:'active' as const}]},quote=gPrimeQuote(s,0,{cost:0,effect});expect(quote.cost).toBe(1);expect(gPrimeQuote(s,0,quote)).toEqual(quote);
});
it('stolen oil keeps the original casters die ownership across final math and charges theft once after reconnect',()=>{
 let s=setup('character-042');s.players[0].hp=3;s.random.dice=[1];s=play(s,'basic-048#01');expect(s.choice).toMatchObject({kind:'g-food',actor:0});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toMatchObject({kind:'g-math',actor:1});s=JSON.parse(JSON.stringify(s));s=gRun(s,{type:'choose',choice:s.choice!.id,option:'6'});expect(s.players[0]).toMatchObject({hp:2,ap:18});expect(s.players[1].hp).toBe(1);expect(s.events.filter(e=>e.text.includes('过境支付2AP'))).toHaveLength(1);expect(s.random.dice).toEqual([]);
});
it('aloe steals healing only and leaves the original counter effect and physical discards intact',()=>{
 let s=gFixture(['character-021','character-048','character-025','character-031']);s.active=2;s.players[0].hp=1;s.players[1].hp=1;s.players[2].hp=1;give(s,1,'basic-038#01');give(s,2,'basic-039#01');s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice).toMatchObject({kind:'card-counter',actor:1});s=gRun(s,{type:'choose',choice:s.choice!.id,card:'basic-038#01'});expect(s.choice).toMatchObject({kind:'g-food',actor:0,source:1});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toBeNull();expect(s.players.map(p=>p.hp).slice(0,3)).toEqual([2,1,1]);expect(s.players[0].ap).toBe(18);expect(s.discard).toEqual(expect.arrayContaining(['basic-038#01','basic-039#01']));expect(s.events.filter(e=>e.type==='counter')).toHaveLength(1);
});
it('one logical food triggers primitive eating once after the redirected portions, without recursive casts',()=>{
 let s=gFixture(['character-021','character-048','character-047','character-031']);s.active=1;s.players[0].hp=1;s=play(s,'basic-039#01');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toMatchObject({kind:'primitive-food',actor:2});s=gDrain(s);expect(s.events.filter(e=>e.type==='play')).toHaveLength(1);expect(s.events.filter(e=>e.type==='choice'&&e.text.includes('primitive-food'))).toHaveLength(1);
});
it('invalid actor and forged choice roll back the complete pending food, fees and history',()=>{
 let s=play(setup(),'basic-039#01');gRun(s,{type:'choose',actor:2,choice:s.choice!.id,accept:true},false);gRun(s,{type:'choose',choice:s.choice!.id+1,accept:true},false);const ap=s.players[1].ap;s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].ap).toBe(ap);expect(s.players[0].ap).toBe(18);
});
it('prime free tea/exercise shows and enforces the1AP final price even with existing own active provenance',()=>{
 for(const [card,buff] of [['basic-002#01','tea'],['basic-003#01','exerciseFree']] as const){let s=gFixture();s.players[0].cell='r1c2';s.stage4![buff][0]=true;s.stage4!.buffSources[`0:${buff}`]={origin:'card',actor:1,faction:s.players[1].faction,roleModifiers:[{actor:0,kind:'active'}]};give(s,0,card);s.players[0].ap=0;expect(stage4Actions(s,0).cards[card].cost).toBe(1);gRun(s,{type:'play',card,targets:[1],...(buff==='tea'?{direction:'right'}:{})},false);s.players[0].ap=1;s=gDrain(gRun(s,{type:'play',card,targets:[1],...(buff==='tea'?{direction:'right'}:{})}));expect(s.events.filter(e=>e.type==='play')[0].text).toContain('支付1AP');}
});
it('retrying the exact accepted theft request preserves its one fee, one portion and one physical discard',()=>{
 let s=play(setup(),'basic-039#01');const cmd={id:'food-receipt-once',revision:s.revision,actor:0,type:'choose' as const,choice:s.choice!.id,accept:true},first=dispatch(s,cmd,s.time+1);expect(first.ok,first.error).toBe(true);validateState(first.state);s=JSON.parse(JSON.stringify(first.state));const retry=dispatch(s,cmd,s.time+100);expect(retry.ok).toBe(false);expect(retry.error).toBe('命令版本过期');expect(retry.state).toEqual(s);expect(s.players[0]).toMatchObject({hp:2,ap:18});expect(s.discard.filter(c=>c==='basic-039#01')).toHaveLength(1);expect(s.events.filter(e=>e.text.includes('过境支付2AP'))).toHaveLength(1);
});
it('after the thief spends its last2AP the remaining group portions go to their original recipients',()=>{
 let s=gFixture(['character-021','character-010','character-040','character-049']);s.active=1;s.players[0].ap=2;for(const p of s.players)p.hp=1;s=play(s,'basic-040#01');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toBeNull();expect(s.players[0]).toMatchObject({hp:2,ap:0});expect(s.players[1].hp).toBe(1);expect(s.players[2].hp).toBe(s.players[2].maxHp);expect(s.players[3].hp).toBe(2);
});
it('prime food leaves skill provenance on its lasting buff but no pricing receipt for the next physical card',()=>{
 for(const [food,card,buff] of [['basic-042#01','basic-002#01','tea'],['basic-044#01','basic-003#01','exerciseFree']] as const){let s=gFixture();s.players[0].cell='r1c2';give(s,0,food);s=gDrain(gRun(s,{type:'play',card:food,targets:[]}));expect(s.stage4!.buffSources[`0:${buff}`].roleModifiers).toContainEqual({actor:0,kind:'active'});expect(s.stage4!.buffSources[`0:${buff}`]).not.toHaveProperty('gPrimeQuoted');give(s,0,card);s.players[0].ap=0;expect(stage4Actions(s,0).cards[card].cost).toBe(1);gRun(s,{type:'play',card,targets:[1],...(buff==='tea'?{direction:'right'}:{})},false);s.players[0].ap=1;const previous=s.events.filter(e=>e.type==='play').length;s=gDrain(gRun(s,{type:'play',card,targets:[1],...(buff==='tea'?{direction:'right'}:{})}));expect(s.events.filter(e=>e.type==='play')[previous].text).toContain('支付1AP');}
});
