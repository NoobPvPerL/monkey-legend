import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {gFixture} from './p3-g-fixture';
import {run,give,equip,drain} from './p3-fixture';
import {runtimeForVersion,sourceCatalogForVersion,characterTraitsForVersion} from '../../packages/game-data/src/index';
import {createGame,createGDevelopmentGame,dispatch,publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import {STAGE4_CARDS} from '../../packages/game-data/src/stage4';
const db=await database(undefined,29);afterAll(()=>db.close());
async function wear(s:ReturnType<typeof gFixture>,card:string,replacements?:string[]){give(s,s.active,card);const d=STAGE4_CARDS[card.split('#')[0] as keyof typeof STAGE4_CARDS];if(d.cost.kind==='die'||d.cost.kind==='tiers'){s.random.dice=[3];s=await run(db,s,{type:'skill',kind:'quote-cost',card});}return drain(db,await run(db,s,{type:'play',card,targets:[],...(replacements?{replacements}:{})}));}
it('real G database dispatch agrees on ordinary final-math movement, persisted replay, stop and next turn',async()=>{
 let s=gFixture(['character-042','character-033','character-025','character-031']);s.random.dice=[2,5];s=await run(db,s,{type:'move'});expect(s.choice?.kind).toBe('g-program');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('g-math');s=JSON.parse(JSON.stringify(s));s=await run(db,s,{type:'choose',choice:s.choice!.id,option:'6'});s=await run(db,s,{type:'stop'});s=await run(db,s,{type:'end'});expect(s.active).toBe(1);
});
it('real personal-start dispatch resolves all Cube faces once and preserves the complete TS state',async()=>{
 for(let n=1;n<=6;n++){let s=gFixture(['character-048','character-028','character-025','character-031']);s.random.dice=[n];s=await run(db,s,{type:'end'});expect(s.stage3!.g!.face[1]).toBe(n);}
});
it('real Cube global teleport spends its basic allowance and fee, including water arrival choices',async()=>{
 let s=gFixture(['character-028','character-048','character-025','character-031']);s.stage3!.g!.face[0]=6;s.players[0].cell='r1c2';s=await run(db,s,{type:'move',cell:'r4c8'});expect(s.players[0].ap).toBe(19);expect(s.players[0].cell).toBe('r4c8');
 s=gFixture(['character-028','character-048','character-025','character-031']);s.stage3!.g!.face[0]=6;give(s,0,'basic-001#01');s=await run(db,s,{type:'move',cell:'r3c3'});expect(s.choice?.kind).toBe('water-discard');s=await run(db,s,{type:'choose',choice:s.choice!.id,cards:['basic-001#01']});
});
it('real food submission invokes the store discard before a later counter and keeps exact deadlines',async()=>{
 let s=gFixture(['character-048','character-049','character-025','character-031']);give(s,0,'basic-039#01');give(s,1,'basic-001#01');s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice?.kind).toBe('g-discard');s=await run(db,s,{type:'choose',choice:s.choice!.id,cards:['basic-001#01']});
});
it('real food transfer keeps original ownership and uses the complete damage/healing pipeline',async()=>{
 let s=gFixture();s.active=1;s.players[0].hp=1;s.players[1].hp=1;give(s,1,'basic-047#01');s=await run(db,s,{type:'play',card:'basic-047#01',targets:[]});expect(s.choice?.kind).toBe('g-food');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0]).toMatchObject({hp:2,ap:18});expect(s.players[0].hand).toHaveLength(2);
});
it('real observer ending enters invisibility, then begins the next personal turn without dropping state',async()=>{
 let s=gFixture(['character-012','character-048','character-025','character-031']);s.random.dice=[6];s=await run(db,s,{type:'end'});expect(s.choice?.kind).toBe('g-invisible');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.stage3!.g!.invisible[0]).toBe(true);expect(s.active).toBe(1);
});
it('real Haki dispatch traverses two people, persists both choices, and settles the original cost',async()=>{
 let s=gFixture(['character-049','character-016','character-025','character-031']);s.players[0].cell='r1c2';s.players[2].cell='r1c4';s.random.dice=[6];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'step',path:['r1c3','r1c4','r1c5']});expect(s.choice?.kind).toBe('g-haki');s=JSON.parse(JSON.stringify(s));s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.source).toBe(2);s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].cell).toBe('r1c5');expect(s.players[0].ap).toBe(19);expect(s.movement).toBeNull();
});
it('real Haki native leap crosses a water occupant and a bank occupant with original step count',async()=>{
 let s=gFixture(['character-049','character-048','character-025','character-031']);s.players[0].cell='r3c2';s.players[1].cell='r3c3';s.players[2].cell='r3c4';s.random.dice=[6];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'step',path:['r3c4','r3c5']});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:false});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.movement!.remaining).toBe(1);expect(s.players[0].cell).toBe('r3c5');
});
it('real Haki timeout and invalid stopping preserve the temporary occupied state, then return safely on60s expiry',async()=>{
 let s=gFixture(['character-049','character-048','character-025','character-031']);s.players[0].cell='r1c2';s.random.dice=[6];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'step',path:['r1c3']});s=await run(db,s,{type:'tick'},true,s.choice!.deadline);s=await run(db,s,{type:'stop'},false);s=await run(db,s,{type:'end'},false);s=await run(db,s,{type:'tick'},true,s.time+s.clock.remaining);expect(s.active).toBe(1);expect(s.players[0].cell).toBe('r1c2');
});
it('real Haki damage triggers potato relocation before saved path resumes',async()=>{
 let s=gFixture(['character-049','character-037','character-025','character-031']);s.players[0].cell='r1c2';s.random.dice=[6];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'step',path:['r1c3','r1c4']});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('teleport');s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r4c8'});expect(s.players[0].cell).toBe('r1c4');expect(s.players[1].cell).toBe('r4c8');
});
it('real Haki lethal reflection ends the movement, while egg waits for the completed segment',async()=>{
 let s=gFixture(['character-049','character-048','character-025','character-031']);s.players[0].cell='r1c2';s.players[0].hp=1;equip(s,1,'basic-051#01');s.random.dice=[6];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'step',path:['r1c3','r1c4']});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});s=await drain(db,s);expect(s.players[0].hp).toBe(0);expect(s.active).toBe(1);
 s=gFixture(['character-049','character-024','character-025','character-031']);s.players[0].cell='r1c2';s.random.dice=[6];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'step',path:['r1c3','r1c4']});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.choice).toBeNull();s=await run(db,s,{type:'stop'});expect(s.choice?.kind).toBe('egg-move');s=await drain(db,s);
});
it('real Cube face1 rejects attacks and tea elbow without charge but still permits ordinary food',async()=>{
 let s=gFixture(['character-028','character-048','character-025','character-031']);s.stage3!.g!.face[0]=1;s.stage4!.tea[0]=true;for(const card of ['basic-003#01','basic-002#01','basic-007#01']){give(s,0,card);s=await run(db,s,{type:'play',card,targets:[1],...(card==='basic-002#01'?{direction:'right'}:{})},false);}give(s,0,'basic-039#01');s.players[0].hp=1;s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.players[0].hp).toBe(2);
});
it('real Cube face5 marks and enhances later actual attack cards with exact damage/cleanup state',async()=>{
 let s=gFixture(['character-028','character-048','character-025','character-031']);s.stage3!.g!.face[0]=5;s.players[1].ap=0;s.players[1].hp=10;s.players[1].maxHp=10;give(s,0,'basic-003#01');give(s,0,'basic-003#02');s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.stage3!.g!.marks[1]).toBe(0);s=await run(db,s,{type:'play',card:'basic-003#02',targets:[1]});expect(s.players[1].hp).toBe(7);expect(s.stage3!.g!.marks[1]).toBe(0);
});
it('real DaHuanShen counter can wait for programming without a second payment or lost choice',async()=>{
 let s=gFixture(['character-048','character-009','character-033','character-031']);give(s,0,'basic-039#01');s.random.dice=[5,1];s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice?.kind).toBe('g-counter');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('g-program');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].ap).toBe(19);expect(s.stage3!.g!.counterUsed[1]).toBe(true);expect(s.discard).toContain('basic-039#01');
});
it('real white eye replaces only normal start draw and chooses two actual enemies without fallback draws',async()=>{
 let s=gFixture(['character-048','character-009','character-025','character-031']);s.round=2;give(s,0,'basic-001#01');give(s,2,'basic-002#01');s=await run(db,s,{type:'end'});expect(s.choice?.kind).toBe('g-white-eye');s=await run(db,s,{type:'choose',choice:s.choice!.id,targets:[0,2]});expect(s.players[1].hand).toEqual(['basic-001#01','basic-002#01']);
});
it('real Jianmin, alien and food positive discounts preserve submission draws and complete card effects',async()=>{
 for(const [role,card,targets] of [['character-022','basic-019#01',[1]],['character-033','basic-009#01',[1]],['character-049','basic-039#01',[]]] as const){let s=gFixture([role,'character-048','character-025','character-031']);s.players[0].hp=1;s.random.dice=[6];give(s,0,card);s=await run(db,s,{type:'play',card,targets:[...targets]});s=await drain(db,s);expect(s.events.find(e=>e.type==='play')!.text).toContain('支付0AP');}
});
it('real dog displacement follows monkey18 consent and uses no target basic movement',async()=>{
 let s=gFixture(['character-022','character-016','character-025','character-031']);s=await run(db,s,{type:'skill',kind:'dog',target:1,direction:'right'});expect(s.choice?.kind).toBe('move-consent');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].cell).toBe('r1c4');expect(s.stage3!.basicUsed[1]).toBe(0);
});
it('real player projection and legal actions match TS for Cube restrictions and invisible targets',async()=>{
 for(const face of [1,2,6]){const s=gFixture(['character-028','character-012','character-025','character-031']);s.stage3!.g!.face[0]=face;s.stage3!.g!.invisible[1]=true;give(s,0,'basic-003#01');give(s,0,'basic-029#01');s.stage4!.tea[0]=true;give(s,0,'basic-002#01');for(const a of [0,1]){const result=(await db.query<{v:any}>('select ml_private.public_view($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v;delete result.actions;expect(result).toEqual(publicView(s,a));expect((await db.query<{v:any}>('select ml_private.stage3_actions($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v).toEqual(stage3Actions(s,a));expect((await db.query<{v:any}>('select ml_private.stage4_actions($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v).toEqual(stage4Actions(s,a));}}
});
it('development installation keeps formal G factories closed and does not change the v17 health/default',async()=>{
 expect((await db.query<{v:any}>("select ml_private.create_game($1::jsonb,1000) v",[JSON.stringify({ruleVersion:'web-v0.1.18',mode:'ffa',seed:42,seats:[0,1,2,3],characters:['character-009','character-012','character-021','character-022']})])).rows[0].v.version).toBe('web-v0.1.18');const h=(await db.query<{v:any}>('select public.ml_health() v')).rows[0].v;expect(h).toMatchObject({engineRevision:29,ruleVersion:'web-v0.1.18',characterDefinitions:43,batchGReady:true});
});
it('real prime food pays once, resolves two logical cards and returns its physical entity once',async()=>{
 let s=gFixture();s.players[0].hp=1;give(s,0,'basic-039#01');s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.players[0]).toMatchObject({hp:3,ap:18});expect(s.cardStack!.serial).toBe(2);expect(s.discard.filter(c=>c==='basic-039#01')).toHaveLength(1);
});
it('real prime attacks resolve two independent damage chains and physical exercise income only once',async()=>{
 let s=gFixture();s.players[1].ap=0;give(s,0,'basic-003#01');s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.players[1].hp).toBe(3);expect(s.players[0].attacks).toBe(2);expect(s.discard.filter(c=>c==='basic-003#01')).toHaveLength(1);
});
it('real first-copy counter does not cancel the second or repeat the quote/fee',async()=>{
 let s=gFixture(['character-021','character-002','character-025','character-031']);s.players[0].hp=1;give(s,0,'basic-039#01');s.random.dice=[6];s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('easy');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[0]).toMatchObject({hp:2,ap:18});
});
it('real free higher response charges prime1AP and creates two child cards without duplicating its entity',async()=>{
 let s=gFixture(['character-048','character-021','character-025','character-031']);give(s,0,'basic-003#01');give(s,1,'basic-004#01');s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});s=await run(db,s,{type:'choose',choice:s.choice!.id,card:'basic-004#01'});expect(s.cardStack!.serial).toBe(3);expect(s.discard.filter(c=>c==='basic-004#01')).toHaveLength(1);
});
it('real prime submissions repeat leader/store triggers per logical card and keep20s discard windows',async()=>{
 let s=gFixture(['character-021','character-048','character-022','character-031']);give(s,0,'basic-019#01');s=await run(db,s,{type:'play',card:'basic-019#01',targets:[1]});expect(s.players[2].hand).toHaveLength(2);
 s=gFixture(['character-021','character-048','character-049','character-031']);s.players[0].hp=1;give(s,0,'basic-039#01');give(s,2,'basic-001#01');give(s,2,'basic-002#01');s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});s=await run(db,s,{type:'choose',choice:s.choice!.id,cards:['basic-001#01']});expect(s.choice?.kind).toBe('g-discard');s=await run(db,s,{type:'tick'},true,s.choice!.deadline);expect(s.players[0].hp).toBe(3);
});
it('real second-copy revalidation drops a target that went home after the first hit',async()=>{
 let s=gFixture(['character-021','character-018','character-025','character-031']);s.players[0].cell='r1c2';s.players[1].cell='r1c3';give(s,0,'basic-006#01');s.random.dice=[6,6];s=await run(db,s,{type:'play',card:'basic-006#01',targets:[1]});s=await drain(db,s);expect(s.players[1].hp).toBe(3);expect(s.random.dice).toEqual([6]);
});
it('real declared X adds prime1 once and both logical effects keep the original X',async()=>{
 let s=gFixture();give(s,0,'basic-025#01');s=await run(db,s,{type:'play',card:'basic-025#01',targets:[],x:2});expect(s.players[0].ap).toBe(17);expect(s.players[0].hand).toHaveLength(4);
});
it('real first-copy lethal reflection skips the second and advances automatically with one discard',async()=>{
 let s=gFixture();s.players[0].hp=1;s.players[1].ap=0;give(s,0,'basic-003#01');equip(s,1,'basic-051#01');s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});s=await drain(db,s);expect(s.players[0].hp).toBe(0);expect(s.active).toBe(1);expect(s.cardStack!.serial).toBe(1);expect(s.discard.filter(c=>c==='basic-003#01')).toHaveLength(1);
});
it('real paired equipment installs two independent pieces and preserves the single backing entity',async()=>{
 const s=await wear(gFixture(),'basic-051#01');expect(s.stage3!.equipment[0]).toEqual(['basic-051#01~g1','basic-051#01~g2']);expect(Object.values(s.stage4!.durability)).toEqual([3,3]);expect(s.stage3!.g!.pairs['basic-051#01'].open).toBe(false);expect(s.discard).not.toContain('basic-051#01');
});
it('real double equipment replaces only the needed old gear when its first logic is countered',async()=>{
 let s=gFixture(['character-021','character-002','character-025','character-031']);equip(s,0,'basic-049#01');equip(s,0,'basic-050#01');give(s,0,'basic-051#01');s.random.dice=[3];s=await run(db,s,{type:'skill',kind:'quote-cost',card:'basic-051#01'});s.random.dice=[6];s=await run(db,s,{type:'play',card:'basic-051#01',targets:[],replacements:['basic-049#01','basic-050#01']});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.stage3!.equipment[0]).toEqual(['basic-050#01','basic-051#01~g2']);expect(s.discard).toContain('basic-049#01');
});
it('real paired replacement settles two separate loss choices and discards the old backing entity once',async()=>{
 let s=await wear(gFixture(),'basic-054#01');const old=[...s.stage3!.equipment[0]];s.players[0].hp=1;give(s,0,'basic-052#01');s.random.dice=[3];s=await run(db,s,{type:'skill',kind:'quote-cost',card:'basic-052#01'});s=await run(db,s,{type:'play',card:'basic-052#01',targets:[],replacements:old});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(3);expect(s.discard.filter(c=>c==='basic-054#01')).toHaveLength(1);
});
it('real paired theft installs directly and rejects duplicate fallback to hand',async()=>{
 let s=await wear(gFixture(),'basic-070#01');s.active=1;give(s,1,'basic-024#01');s=await run(db,s,{type:'play',card:'basic-024#01',targets:[0],take:'equipment',item:'basic-070#01~g1'});expect(s.stage3!.equipment[1]).toEqual(['basic-070#01~g1']);give(s,1,'basic-024#02');s=await run(db,s,{type:'play',card:'basic-024#02',targets:[0],take:'equipment',item:'basic-070#01~g2'},false);expect(s.players[1].hand).not.toContain('basic-070#01~g2');
});
it('real bread pieces use independent requested cooldowns and preserve remaining starts when stolen',async()=>{
 let s=await wear(gFixture(),'basic-054#01');const [one,two]=s.stage3!.equipment[0];s=await run(db,s,{type:'skill',kind:'bread',target:1,card:two});s=await run(db,s,{type:'skill',kind:'bread',target:2,card:two},false);s=await run(db,s,{type:'skill',kind:'bread',target:2,card:one});s.stage3!.starts[0]++;s.stage3!.starts[1]=5;s.active=1;give(s,1,'basic-024#01');s=await run(db,s,{type:'play',card:'basic-024#01',targets:[0],take:'equipment',item:one});s=await drain(db,s);expect(s.stage3!.g!.gearBreadReadyAt[one]).toBe(6);s=await run(db,s,{type:'skill',kind:'bread',target:2,card:one},false);s.stage3!.starts[1]++;s=await run(db,s,{type:'skill',kind:'bread',target:2,card:one});expect(s.stage3!.g!.gearBreadReadyAt[one]).toBe(8);
});
it('real Tang settings survive independent disabling and moving one piece to another owner',async()=>{
 let s=await wear(gFixture(),'basic-069#01');const [one,two]=s.stage3!.equipment[0];s=await run(db,s,{type:'skill',kind:'terrain',accept:true});s=await run(db,s,{type:'skill',kind:'terrain',card:one,accept:false});s.active=1;give(s,1,'basic-024#01');s=await run(db,s,{type:'play',card:'basic-024#01',targets:[0],take:'equipment',item:one});expect(s.stage4!.terrainIgnore).toEqual([true,false,false,false]);expect(s.stage3!.g!.gearTerrain[two]).toBe(true);s=await run(db,s,{type:'skill',actor:0,kind:'terrain',card:two,accept:false});
});
it('real attack provenance includes only the independently enabled Tang piece',async()=>{
 let s=await wear(gFixture(['character-021','character-002','character-025','character-031']),'basic-069#01');s=await run(db,s,{type:'skill',kind:'terrain',accept:true});s=await run(db,s,{type:'skill',kind:'terrain',card:s.stage3!.equipment[0][0],accept:false});give(s,0,'basic-003#01');s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.choice?.kind).toBe('easy');expect(s.cardStack!.stack.at(-1)!.effect.roleModifiers).toHaveLength(2);s=await drain(db,s);
});
it('real watch pieces each return independently and do not spend the other record',async()=>{
 let s=await wear(gFixture(),'basic-060#01');const [one,two]=s.stage3!.equipment[0];s.stage4!.watches[one]={current:s.players[0].cell,previous:'r1c1',usedTurn:null};s.stage4!.watches[two]={current:s.players[0].cell,previous:'r1c2',usedTurn:null};s=await run(db,s,{type:'skill',kind:'watch',card:two});s=await run(db,s,{type:'skill',kind:'watch',card:two},false);s=await run(db,s,{type:'skill',kind:'watch'});expect(s.players[0].cell).toBe('r1c1');
});
it('real changed installation capacity leaves the paired piece at its old owner',async()=>{
 let s=await wear(gFixture(['character-021','character-048','character-002','character-031']),'basic-070#01');const piece=s.stage3!.equipment[0][0];s.active=1;give(s,1,'basic-024#01');s=await run(db,s,{type:'play',card:'basic-024#01',targets:[0],take:'equipment',item:piece});equip(s,1,'basic-069#01');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.stage3!.equipment[0]).toContain(piece);expect(s.players[1].hand).not.toContain(piece);
});
it('real paired guards spend durability independently and discard the backing entity only after both break',async()=>{
 let s=await wear(gFixture(),'basic-070#01');s.active=1;s.players[0].ap=0;for(let i=1;i<=4;i++){give(s,1,`basic-003#0${i}`);s=await drain(db,await run(db,s,{type:'play',card:`basic-003#0${i}`,targets:[0]}));expect(s.players[0].hp).toBe(3);}expect(s.stage3!.equipment[0]).toEqual([]);expect(s.discard.filter(c=>c==='basic-070#01')).toHaveLength(1);
});
it('real paired cloaks have distinct attempts and the second can block after the first fails',async()=>{
 let s=await wear(gFixture(),'basic-049#01');s.active=1;s.players[1].cell='r1c4';give(s,1,'basic-009#01');s.random.dice=[5,2,3];s=await run(db,s,{type:'play',card:'basic-009#01',targets:[0]});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.data).toMatchObject({card:'basic-049#01~g2'});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(3);
});
it('real paired reflection uses both pieces without recursion and keeps separate durability',async()=>{
 let s=await wear(gFixture(),'basic-051#01');const hp=s.players[1].hp;s.active=1;give(s,1,'basic-007#01');s=await run(db,s,{type:'play',card:'basic-007#01',targets:[0]});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].hp).toBe(hp-2);expect(Object.values(s.stage4!.durability)).toEqual([2,2]);
});
it('real paired sugar deducts once per piece in one logical root',async()=>{
 let s=await wear(gFixture(),'basic-055#01');s.active=1;give(s,1,'basic-007#01');s=await run(db,s,{type:'play',card:'basic-007#01',targets:[0]});expect(s.events.filter(e=>e.text.includes('冰糖雪梨扣S2 1AP'))).toHaveLength(2);
});
it('real paired chalk offers each piece once for each logical attack without recursive extras',async()=>{
 let s=await wear(gFixture(),'basic-052#01');s.players[1].hp=20;s.players[1].maxHp=20;give(s,0,'basic-007#01');s=await run(db,s,{type:'play',card:'basic-007#01',targets:[1]});let count=0;for(;s.choice&&count<8;count++)s=await run(db,s,{type:'choose',choice:s.choice.id,accept:true});expect(count).toBe(4);expect(s.players[1].hp).toBe(12);
});
it('real paired range applies both region edges in action projections and rejects no legal target',async()=>{
 const s=await wear(gFixture(),'basic-058#01');for(let a=0;a<4;a++)expect((await db.query<{v:any}>('select ml_private.stage4_actions($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v).toEqual(stage4Actions(s,a));
});
it('real paired Guan injury rechecks current cells separately after each response',async()=>{
 let s=await wear(gFixture(),'basic-068#01');s.active=1;give(s,1,'basic-007#01');s=await run(db,s,{type:'play',card:'basic-007#01',targets:[0]});s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r1c4'});expect(s.choice?.data).toMatchObject({card:'basic-068#01~g2'});s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r1c5'});expect(s.players[0].cell).toBe('r1c5');
});
it('real paired landing push offers each piece separately and rechecks the moved target',async()=>{
 let s=await wear(gFixture(),'basic-076#01');s.players[0].cell='r1c2';s.players[1].cell='r1c6';s.random.dice=[2];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'step',path:['r1c3']});expect(s.choice).toMatchObject({kind:'gear-push',data:{card:'basic-076#01~g1'}});s=await run(db,s,{type:'choose',choice:s.choice!.id,option:'2:right'});expect(s.choice).toMatchObject({kind:'gear-push',data:{card:'basic-076#01~g2'}});s=await run(db,s,{type:'choose',choice:s.choice!.id,option:'2:right'});expect(s.players[2].cell).toBe('r2c4');
});
it('real paired plants each relocate after the first hit before the second logical target is rechecked',async()=>{
 let s=await wear(gFixture(),'basic-061#01');s.players[0].cell='r1c2';s.players[1].cell='r1c3';s.players[1].hp=20;s.players[1].maxHp=20;give(s,0,'basic-007#01');s=await run(db,s,{type:'play',card:'basic-007#01',targets:[1]});expect(s.choice?.data).toMatchObject({card:'basic-061#01~g1'});s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r1c1'});expect(s.choice?.data).toMatchObject({card:'basic-061#01~g2'});s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r4c8'});expect(s.players[1].cell).toBe('r4c8');expect(s.choice).toBeNull();
});
it('real paired Tong applies each item for each logical hit and the next target start keeps the block',async()=>{
 let s=await wear(gFixture(),'basic-062#01');s.players[1].hp=20;s.players[1].maxHp=20;s.players[1].ap=0;give(s,0,'basic-003#01');s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.events.filter(e=>e.type==='buff'&&e.text.includes('不能主动位移'))).toHaveLength(4);s=await run(db,s,{type:'end'});s=await drain(db,s);expect(s.stage4!.tongBlocked[1]).toBeTruthy();
});
it('real G development installer preserves every saved v1–v17 dispatch state',async()=>{
 for(let n=1;n<=17;n++){const version=`web-v0.1.${n}` as ReturnType<typeof createGame>['version'],s=createGame({mode:'ffa',ruleVersion:version,seed:42,seats:[0,1,2,3],first:0},1000),cmd={id:'g-old',revision:s.revision,actor:s.active,type:'tick' as const},actual=(await db.query<{v:any}>('select ml_private.dispatch($1::jsonb,$2::jsonb,61000) v',[JSON.stringify(s),JSON.stringify(cmd)])).rows[0].v;expect(actual).toEqual(dispatch(s,cmd,61000));expect(actual.state.stage3?.g).toBeUndefined();}
});
it('real G equipment ledger rejects missing origins, virtual hands and duplicate pieces',async()=>{
 const s=await wear(gFixture(),'basic-070#01'),piece=s.stage3!.equipment[0][0];for(let n=0;n<3;n++){const bad=structuredClone(s);if(n===0)delete bad.stage3!.g!.pairs['basic-070#01'];else if(n===1){bad.stage3!.equipment[0].shift();bad.players[0].hand.push(piece);}else bad.stage3!.equipment[1].push(piece);await expect(db.query('select ml_private.validate($1::jsonb)',[JSON.stringify(bad)])).rejects.toThrow('G装备实体账本无效');}
});
it('real death cleanup preserves the final paired discard ledger instead of restoring a stale resource snapshot',async()=>{
 let s=await wear(gFixture(['character-021','character-052','character-025','character-031']),'basic-064#01');s.players[0].cell='r1c2';s.players[1].cell='r1c3';s.players[0].hp=1;s.active=1;s=await run(db,s,{type:'skill',kind:'magma'});s=await drain(db,s);expect(s.players[0].hp).toBe(0);expect(s.stage3!.g!.pairs).toEqual({});expect(s.discard.filter(c=>c==='basic-064#01')).toHaveLength(1);
});
it('real G paired installation agrees for every equipment identity including snapshotted Bob copying',async()=>{
 for(const d of Object.values(STAGE4_CARDS).filter(d=>d.type==='equipment')){let s=gFixture();if(d.id==='basic-073'){equip(s,1,'basic-069#01');give(s,0,'basic-073#01');s.random.dice=[3];s=await run(db,s,{type:'skill',kind:'quote-cost',card:'basic-073#01'});s=await drain(db,await run(db,s,{type:'play',card:'basic-073#01',targets:[],copy:'basic-069#01'}));}else s=await wear(s,`${d.id}#01`);expect(s.stage3!.equipment[0],d.id).toEqual([`${d.id}#01~g1`,`${d.id}#01~g2`]);for(let a=0;a<4;a++){const projected=(await db.query<{v:any}>('select ml_private.public_view($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v;delete projected.actions;expect(projected).toEqual(publicView(s,a));expect((await db.query<{v:any}>('select ml_private.stage4_actions($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v).toEqual(stage4Actions(s,a));}}
},30000);
it('real prime interrupt pays once and succeeds when either logical copy survives its own counter',async()=>{
 for(const accepts of [[false,false],[true,false],[false,true],[true,true]]){let s=gFixture(['character-021','character-048','character-002','character-031']);s.active=1;give(s,0,'basic-017#01');s.random.dice=[6,6];s=await run(db,s,{type:'play',actor:0,card:'basic-017#01',targets:[]});expect(s.choice?.kind).toBe('easy');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:accepts[0]});s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:accepts[1]});s=await drain(db,s);expect(s.discard.filter(c=>c==='basic-017#01')).toHaveLength(1);if(accepts.every(Boolean)){expect(s.active).toBe(1);expect(s.round).toBe(1);}else expect(s.round).toBe(2);}
});
it('real prime aloe counter has two child logical effects, one fee and one discard',async()=>{
 let s=gFixture(['character-048','character-021','character-025','character-031']);s.players[1].hp=1;give(s,0,'basic-039#01');give(s,1,'basic-038#01');s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice?.kind).toBe('card-counter');s=await run(db,s,{type:'choose',choice:s.choice!.id,card:'basic-038#01'});s=await drain(db,s);expect(s.players[1].hp).toBe(3);expect(s.cardStack!.serial).toBe(3);expect(s.discard.filter(c=>c==='basic-038#01')).toHaveLength(1);
});
it('real prime defense and elbow response identities create two independent child chains',async()=>{
 for(const [attack,response] of [['basic-007#01','basic-001#01'],['basic-008#01','basic-002#01']]){let s=gFixture(['character-048','character-021','character-025','character-031']);s.players[0].cell='r1c2';s.players[1].cell='r1c3';give(s,0,attack);give(s,1,response);s=await run(db,s,{type:'play',card:attack,targets:[1]});expect(s.choice?.kind).toBe('response');s=await run(db,s,{type:'choose',choice:s.choice!.id,card:response});s=await drain(db,s);expect(s.cardStack!.serial).toBe(3);expect(s.discard.filter(c=>c===response)).toHaveLength(1);}
});
it('real prime tactic and Jianmin counters retain two independent logical counter effects',async()=>{
 for(const [parent,card] of [['basic-019#01','basic-027#01'],['basic-019#01','basic-028#01']]){let s=gFixture(['character-048','character-021','character-025','character-031']);give(s,0,parent);give(s,1,card);s=await run(db,s,{type:'play',card:parent,targets:[1]});expect(s.choice?.kind).toBe('card-counter');if(stage4Actions(s,1).cards[card].needsQuote){s.random.dice=[3];s=await run(db,s,{type:'skill',kind:'quote-cost',card});}s=await run(db,s,{type:'choose',choice:s.choice!.id,card});s=await drain(db,s);expect(s.cardStack!.serial).toBe(3);expect(s.discard.filter(c=>c===card)).toHaveLength(1);}
});
it('real prime revival restores the first target and rechecks the now living target before the second copy',async()=>{
 let s=gFixture(['character-021','character-052','character-025','character-031']);s.players[1].cell='r1c2';s.players[2].cell='r1c3';s.players[2].hp=1;s.active=1;s=await run(db,s,{type:'skill',kind:'magma'});s=await drain(db,s);expect(s.players[2].hp).toBe(0);s.active=0;give(s,0,'basic-037#01');s.random.dice=[3];s=await run(db,s,{type:'skill',kind:'quote-cost',card:'basic-037#01'});s=await run(db,s,{type:'play',card:'basic-037#01',targets:[2]});s=await drain(db,s);expect(s.players[2].hp).toBe(1);expect(s.cardStack!.serial).toBe(2);expect(s.discard.filter(c=>c==='basic-037#01')).toHaveLength(1);
});
it('real late tick crosses programmer and math windows without paying or sampling twice',async()=>{
 let s=gFixture(['character-042','character-033','character-025','character-031']);s.random.dice=[3];s=await run(db,s,{type:'move'});expect(s.choice?.kind).toBe('g-program');s=await run(db,s,{type:'tick'},true,s.choice!.deadline+30001);expect(s.choice).toBeNull();expect(s.phase).toBe('moving');expect(s.random.dice).toEqual([]);s=await run(db,s,{type:'stop'});
});
it('real private G new-game factory agrees on opening draws, forecasts and recoverable first Cube dice',async()=>{
 for(const characters of [['character-009','character-012','character-021','character-022'],['character-028','character-033','character-042','character-049']])for(const mode of ['ffa','team'] as const){const setup={ruleVersion:'web-v0.1.18' as const,mode,seed:42,seats:[0,1,2,3],first:0,characters:characters as any,dice:[6,3,1]},s=createGDevelopmentGame(setup,1000),sql=(await db.query<{v:any}>('select ml_private.p3g_create_development($1::jsonb,1000) v',[JSON.stringify(setup)])).rows[0].v;expect(sql).toEqual(s);if(s.choice?.kind==='g-program')await run(db,s,{type:'choose',choice:s.choice.id,accept:true});}
});
it('isolated public RPC authenticates G replacement intents, rejects authoritative input and preserves exact retry receipts',async()=>{
 await db.exec("create or replace function ml_private.now_ms() returns bigint language sql as 'select 1000::bigint';");
 const clients=Array.from({length:4},(_,i)=>({name:'G隔离'+i,token:String(i+1).repeat(64),epoch:1})),call=async(a:number,op:string,extra={})=>(await db.query<{v:any}>('select public.ml_room($1::jsonb) v',[JSON.stringify({...clients[a],op,...extra})])).rows[0].v;
 const room=await call(0,'create',{requestId:'g-rpc-create'});expect(room.ok,room.error).toBe(true);const id=room.snapshot.roomId;for(let a=1;a<4;a++)expect((await call(a,'join',{requestId:'g-rpc-join',code:room.snapshot.code})).ok).toBe(true);
 const s=gFixture();equip(s,0,'basic-049#01');equip(s,0,'basic-050#01');give(s,0,'basic-051#01');s.stage4!.costs.locks['basic-051#01']={cost:2,actor:0} as any;s.stage3!.costLocks['basic-051#01']={turn:s.stage3!.turn,cost:2};await db.query("update ml_private.rooms set status='playing',draft=null,match_id=gen_random_uuid(),game=$2::jsonb where id=$1",[id,JSON.stringify(s)]);
 const snapshot=(await call(0,'view',{roomId:id})).snapshot,packet={roomId:id,requestId:'g-rpc-pair',matchId:snapshot.matchId,revision:s.revision,intent:{type:'play',card:'basic-051#01',targets:[],replacements:['basic-049#01','basic-050#01']}};
 expect((await call(1,'game',{...packet,requestId:'g-rpc-wrong'})).ok).toBe(false);expect((await call(0,'game',{...packet,requestId:'g-rpc-forged',intent:{...packet.intent,state:s}})).ok).toBe(false);
 const result=await call(0,'game',packet);expect(result.ok,result.error).toBe(true);expect(result.snapshot.game.stage3.equipment[0]).toEqual(['basic-051#01~g1','basic-051#01~g2']);expect((await call(0,'game',packet)).duplicate).toBe(true);expect((await call(0,'game',{...packet,requestId:'g-rpc-stale'})).ok).toBe(false);
 const dice=gFixture(['character-042','character-033','character-025','character-031']);dice.random.dice=[2,5];await db.query('update ml_private.rooms set match_id=gen_random_uuid(),game=$2::jsonb where id=$1',[id,JSON.stringify(dice)]);
 const current=(await call(0,'view',{roomId:id})).snapshot,move={roomId:id,requestId:'g-rpc-move',matchId:current.matchId,revision:0,intent:{type:'move'}},waiting=await call(0,'game',move);expect(waiting.ok,waiting.error).toBe(true);expect(waiting.snapshot.game.choice).toMatchObject({kind:'g-program',actor:1});expect(waiting.snapshot.game.stage3.g.dice).toBeUndefined();
 const program={roomId:id,requestId:'g-rpc-program',matchId:current.matchId,revision:waiting.snapshot.game.revision,intent:{type:'choose',choice:waiting.snapshot.game.choice.id,accept:true}};expect((await call(0,'game',{...program,requestId:'g-rpc-program-wrong'})).ok).toBe(false);const math=await call(1,'game',program);expect(math.ok,math.error).toBe(true);expect(math.snapshot.game.choice.kind).toBe('g-math');const final={roomId:id,requestId:'g-rpc-math',matchId:current.matchId,revision:math.snapshot.game.revision,intent:{type:'choose',choice:math.snapshot.game.choice.id,option:'6'}},done=await call(0,'game',final);expect(done.ok,done.error).toBe(true);expect(done.snapshot.game.movement.remaining).toBe(3);expect((await call(0,'game',final)).duplicate).toBe(true);
 const observer=gFixture(['character-012','character-048','character-025','character-031']);observer.stage3!.g!.forecast={round:1,regions:['高唐农场','樱花大道']};await db.query('update ml_private.rooms set game=$2::jsonb where id=$1',[id,JSON.stringify(observer)]);expect((await call(0,'view',{roomId:id})).snapshot.game.stage3.g.forecast).toEqual(observer.stage3!.g!.forecast);expect((await call(1,'view',{roomId:id})).snapshot.game.stage3.g.forecast).toBeUndefined();
 const watch=(await db.query<{v:any}>('select public.ml_watch($1::jsonb) v',[JSON.stringify({name:'G隔离观众',token:'a'.repeat(64),epoch:1,op:'join',requestId:'g-rpc-watch',code:room.snapshot.code})])).rows[0].v;expect(watch.ok,watch.error).toBe(true);expect(watch.snapshot.game.stage3.g.forecast).toEqual(observer.stage3!.g!.forecast);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query('select ml_private.p3g_create_development($1::jsonb,1000)',[JSON.stringify({ruleVersion:'web-v0.1.18'})])).rejects.toThrow(/permission denied/);await db.exec('reset role');}
});
it.each(Object.values(STAGE4_CARDS).filter(d=>d.type!=='equipment'&&d.type!=='response'&&!['basic-017','basic-027','basic-028','basic-037','basic-038'].includes(d.id)))('real prime logical identity matrix $id $name',async d=>{
 let s=gFixture();for(const p of s.players){p.hp=40;p.maxHp=40;p.ap=100;}s.players[0].cell='r1c2';s.players[1].cell='r1c3';s.players[2].cell='r2c2';s.players[3].cell='r2c3';if(d.id==='basic-009'){s.players[0].cell='r1c4';s.players[1].cell='r1c5';}if(d.id==='basic-035'){s.stage4!.conversion[1]='monkey';s.players[1].faction='机械猴子';}if(d.id==='basic-036'){s.stage4!.conversion[1]='dimon';s.players[1].faction='帝汶家族';}const card=`${d.id}#01`;give(s,0,card);let info=stage4Actions(s,0).cards[card];if(info.needsQuote){s.random.dice=[3];s=await run(db,s,{type:'skill',kind:'quote-cost',card});info=stage4Actions(s,0).cards[card];}const targets=info.targeted?[info.targets[0]]:[];expect(targets.every(t=>t!==undefined),d.id).toBe(true);s.random.dice=Array(25).fill(5);s=await run(db,s,{type:'play',card,targets,...(info.region?{region:'教学楼'}:{}),...(info.costKind==='variable'?{x:2}:{}),...(d.id==='basic-024'?{take:'hand'}:{})});for(let i=0;s.choice&&i<30;i++)s=await run(db,s,{type:'tick'},true,s.choice.deadline);expect(s.choice).toBeNull();expect(s.discard.filter(c=>c===card)).toHaveLength(1);expect(s.cardStack!.stack).toEqual([]);
});
