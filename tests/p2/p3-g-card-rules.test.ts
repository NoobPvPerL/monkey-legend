import {expect,it} from 'vitest';
import {gFixture,gRun,gDrain} from './p3-g-fixture';
import {give} from './p3-fixture';
import {gFreeQuote} from '../../packages/game-core/src/p3-g-cards';
import {cardApCost} from '../../packages/game-core/src/stage3-resources';
import {runtimeForVersion} from '../../packages/game-data/src/index';

it('all three G discounts use actual identity, only free positive costs, and preserve signed/X fees',()=>{
 const data=runtimeForVersion('web-v0.1.18');for(const role of ['character-022','character-033','character-049']){
  const s=gFixture([role,'character-048','character-025','character-031']);for(const [definition,card] of Object.entries(data.cards))for(const cost of [-1,0,1,6])for(const variable of [false,true]){
   const effect={origin:'card' as const,actor:0,faction:s.players[0].faction,roleModifiers:[]},free=!variable&&cost>0&&(role==='character-022'&&data.cardTags[definition].includes('建民')||role==='character-033'&&data.cardTags[definition].includes('外星')||role==='character-049'&&card.type==='food'),q=gFreeQuote(s as any,0,definition,{cost,effect},variable);
   expect(q.cost).toBe(free?0:cost);expect(q.effect.roleModifiers).toEqual(free?[{actor:0,kind:'cost'}]:[]);
  }
 }
});
it('real Jianmin, alien and food submissions pay zero after the matching role discount',()=>{
 for(const [role,card,targets] of [['character-022','basic-019#01',[1]],['character-033','basic-009#01',[1]],['character-049','basic-039#01',[]]] as const){
  let s=gFixture([role,'character-048','character-025','character-031']);s.players[0].hp=1;s.random.dice=[6];give(s,0,card);const ap=s.players[0].ap;s=gDrain(gRun(s,{type:'play',card,targets:[...targets]}));expect(s.events.find(e=>e.type==='play')?.text).toContain('支付0AP');expect(s.players[0].ap).toBe(ap+(role==='character-022'?2:0));
 }
});
it('Jianmin leader draws on paid submission before easy even when that card is later countered',()=>{
 let s=gFixture(['character-022','character-002','character-009','character-049']);give(s,0,'basic-019#01');s.random.dice=[6];s=gRun(s,{type:'play',card:'basic-019#01',targets:[1]});expect(s.choice).toMatchObject({kind:'easy',actor:1});expect(s.players[0].hand).toHaveLength(1);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toBeNull();expect(s.players[0].hand).toHaveLength(1);expect(s.stage3!.g!.counterUsed[2]).toBe(false);expect(s.players[1].ap).toBe(19);
});
it('prime Jianmin pays once but triggers leader separately on each logical submission',()=>{
 let s=gFixture(['character-021','character-048','character-022','character-031']);give(s,0,'basic-019#01');const fee=cardApCost(s as any,0,'basic-019#01').cost;s=gDrain(gRun(s,{type:'play',card:'basic-019#01',targets:[1]}));expect(s.players[2].hand).toHaveLength(2);expect(s.players[0].ap,JSON.stringify(s.events.filter(e=>['play','ap','effect'].includes(e.type)))).toBe(20-fee+4);expect(s.discard.filter(c=>c==='basic-019#01')).toHaveLength(1);
});
it('prime food opens two independent store discards with20s windows before either counter/result',()=>{
 let s=gFixture(['character-021','character-048','character-049','character-031']);give(s,0,'basic-039#01');give(s,2,'basic-001#01');give(s,2,'basic-002#01');s.players[0].hp=1;s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice).toMatchObject({kind:'g-discard',actor:2,count:1});expect(s.choice!.deadline-s.time).toBe(20000);expect(s.players[0].hp).toBe(1);
 gRun(s,{type:'choose',choice:s.choice!.id,cards:['basic-001#01','basic-001#01']},false);s=gRun(s,{type:'choose',choice:s.choice!.id,cards:['basic-001#01']});expect(s.choice?.kind).toBe('g-discard');expect(s.players[0].hp).toBe(2);s=gRun(s,{type:'tick'},true,s.choice!.deadline);expect(s.choice).toBeNull();expect(s.players[2].hand).toEqual([]);expect(s.players[0]).toMatchObject({hp:3,ap:18});expect(s.events.filter(e=>e.text==='S3 店长弃1张牌')).toHaveLength(2);
});
it('own food is free and causes no store discard, while another persons countered food still does',()=>{
 let s=gFixture(['character-049','character-002','character-025','character-031']);give(s,0,'basic-039#01');give(s,0,'basic-001#01');s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice?.kind).toBe('easy');expect(s.players[0].hand).toEqual(['basic-001#01']);s=gDrain(s);expect(s.players[0].hand).toEqual(['basic-001#01']);
 s.active=2;give(s,2,'basic-039#02');s=gRun(s,{type:'play',card:'basic-039#02',targets:[]});expect(s.choice?.kind).toBe('g-discard');s=gRun(s,{type:'choose',choice:s.choice!.id,cards:['basic-001#01']});expect(s.choice?.kind).toBe('easy');s.random.dice=[6];s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hand).toEqual([]);expect(s.discard).toContain('basic-039#02');
});
it('easy precedes the role counter, which precedes other card-counter windows',()=>{
 let s=gFixture(['character-048','character-002','character-009','character-031']);give(s,0,'basic-039#01');give(s,3,'basic-038#01');s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice?.kind).toBe('easy');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice).toMatchObject({kind:'g-counter',actor:2});expect(s.choice!.deadline-s.time).toBe(30000);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice).toMatchObject({kind:'card-counter',actor:3});expect(s.stage3!.g!.counterUsed[2]).toBe(false);s=gDrain(s);expect(s.discard).toContain('basic-039#01');
});
it('a successful role counter cancels the whole logical group card once, with payment and use consumed',()=>{
 let s=gFixture(['character-048','character-025','character-009','character-031']);give(s,0,'basic-005#01');s.players[1].ap=0;s.players[3].ap=0;const hp=s.players.map(p=>p.hp);s.random.dice=[2];s=gRun(s,{type:'play',card:'basic-005#01',targets:[1,3]});expect(s.choice?.kind).toBe('g-counter');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players.map(p=>p.hp)).toEqual(hp);expect(s.players[2].ap).toBe(19);expect(s.stage3!.g!.counterUsed[2]).toBe(true);expect(s.discard.filter(c=>c==='basic-005#01')).toHaveLength(1);expect(s.choice).toBeNull();
});
it('failed role counter still consumes its one personal-turn attempt; next personal start refreshes it',()=>{
 let s=gFixture(['character-048','character-025','character-009','character-031']);s.players[0].hp=1;give(s,0,'basic-039#01');give(s,0,'basic-039#02');s.random.dice=[5];s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(2);expect(s.stage3!.g!.counterUsed[2]).toBe(true);s=gRun(s,{type:'play',card:'basic-039#02',targets:[]});expect(s.choice).toBeNull();s=gDrain(gRun(s,{type:'end'}));expect(s.stage3!.g!.counterUsed[2]).toBe(false);
});
it('active-immune casters and the counter owners own cards cannot be countered by this role',()=>{
 for(const role of ['character-026','character-044','character-009']){
  const ids=role==='character-009'?[role,'character-048','character-025','character-031']:[role,'character-048','character-009','character-031'];let s=gFixture(ids);give(s,0,'basic-039#01');s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice).toBeNull();expect(s.events.some(e=>e.text.endsWith('g-counter'))).toBe(false);
 }
});
it('response cards get their own role-counter window after the parent attempt was declined',()=>{
 let s=gFixture(['character-048','character-025','character-009','character-031']);give(s,0,'basic-008#01');give(s,1,'basic-002#01');s.players[0].cell='r2c3';s.players[1].cell='r1c3';s=gRun(s,{type:'play',card:'basic-008#01',targets:[1]});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice).toMatchObject({kind:'response',actor:1});s=gRun(s,{type:'choose',choice:s.choice!.id,card:'basic-002#01'});expect(s.choice).toMatchObject({kind:'g-counter',actor:2});s.random.dice=[1];s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].ap).toBe(0);expect(s.discard).toContain('basic-002#01');expect(s.events.filter(e=>e.text.endsWith('g-counter'))).toHaveLength(2);
});
it('white eye replaces only normal start draw and selects at most two different opponents without deck fallback',()=>{
 let s=gFixture(['character-048','character-009','character-025','character-031']);s.round=2;give(s,0,'basic-039#01');give(s,2,'basic-040#01');give(s,3,'basic-001#01');const deck=s.deck.length;s=gRun(s,{type:'end'});expect(s.choice).toMatchObject({kind:'g-white-eye',actor:1,count:2,targets:[0,2,3]});expect(s.choice!.deadline-s.time).toBe(30000);expect(s.deck).toHaveLength(deck);gRun(s,{type:'choose',choice:s.choice!.id,targets:[0,0]},false);s=gRun(s,{type:'choose',choice:s.choice!.id,targets:[3,0]});expect(s.players[1].hand).toEqual(['basic-001#01','basic-039#01']);expect(s.players[3].hand).toEqual([]);expect(s.players[0].hand).toEqual([]);expect(s.players[2].hand).toEqual(['basic-040#01']);expect(s.deck).toHaveLength(deck);expect(s.phase).toBe('action');
});
it('white-eye timeout chooses action-order enemies, skips teammates and immune targets, and draws no fallback',()=>{
 let s=gFixture(['character-048','character-009','character-026','character-031']);s.round=2;s.mode='team';s.players.forEach((q,a)=>q.team=a%2?'A':'B');give(s,0,'basic-039#01');give(s,2,'basic-040#01');give(s,3,'basic-001#01');s=gRun(s,{type:'end'});expect(s.choice).toMatchObject({kind:'g-white-eye',targets:[0],count:1});const deck=s.deck.length;s=gRun(s,{type:'tick'},true,s.choice!.deadline);expect(s.players[1].hand).toEqual(['basic-039#01']);expect(s.players[2].hand).toEqual(['basic-040#01']);expect(s.players[3].hand).toEqual(['basic-001#01']);expect(s.deck).toHaveLength(deck);
});
it('white eye opens no first-round/blocked/empty normal draw window and extra card draw still uses the deck',()=>{
 for(const kind of ['first','blocked','empty']){let s=gFixture(['character-048','character-009','character-025','character-031']);if(kind!=='first')s.round=2;if(kind!=='empty')give(s,0,'basic-039#01');if(kind==='blocked')s.stage4!.downPending[1]=true;const deck=s.deck.length;s=gRun(s,{type:'end'});expect(s.choice).toBeNull();expect(s.active).toBe(1);expect(s.deck).toHaveLength(deck);}
 let s=gFixture(['character-009','character-048','character-025','character-031']);give(s,0,'basic-047#01');const deck=s.deck.length;s=gRun(s,{type:'play',card:'basic-047#01',targets:[]});expect(s.players[0].hand).toHaveLength(2);expect(s.deck).toHaveLength(deck-2);expect(s.choice).toBeNull();
});
