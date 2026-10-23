import {expect,it} from 'vitest';
import {gFixture,gRun,gDrain} from './p3-g-fixture';
import {give,equip} from './p3-fixture';
import {STAGE4_CARDS} from '../../packages/game-data/src/stage4';
import {gPiece,gPiecePhysical} from '../../packages/game-core/src/p3-g-equipment';
import {gState} from '../../packages/game-core/src/p3-g-state';
import {discardCards} from '../../packages/game-core/src/exercise';
import {validateState} from '../../packages/game-core/src/index';
import type {GameState} from '../../packages/game-core/src/types';
import {stage4CardRange} from '../../packages/game-core/src/stage4-combat';
import {runtimeForVersion,mapForVersion} from '../../packages/game-data/src/index';
import {ignoreLocation} from '../../packages/game-core/src/stage4-terrain';
function quote(s:GameState,card:string){give(s,s.active,card);const d=STAGE4_CARDS[card.split('#')[0] as keyof typeof STAGE4_CARDS];if(d.cost.kind==='die'||d.cost.kind==='tiers'){s.random.dice=[3];s=gRun(s,{type:'skill',kind:'quote-cost',card});}return s;}
function wear(s:GameState,card:string){s=quote(s,card);return gDrain(gRun(s,{type:'play',card,targets:[]}));}
function remove(s:GameState,a:number,part:string){s.stage3!.equipment[a]=s.stage3!.equipment[a].filter(c=>c!==part);delete s.stage3!.equipmentSources[part];delete s.stage4!.durability[part];discardCards(s,[part]);validateState(s);}
it('one physical equipment installs two same-name pieces with independent durability and one backing entity',()=>{
 let s=wear(gFixture(),'basic-051#01');const parts=[gPiece('basic-051#01',1),gPiece('basic-051#01',2)];expect(s.stage3!.equipment[0]).toEqual(parts);expect(parts.map(c=>s.stage4!.durability[c])).toEqual([3,3]);expect(gState(s).pairs['basic-051#01']).toEqual({parts,removed:[],open:false});expect(s.resolving).toEqual([]);expect(s.discard).not.toContain('basic-051#01');
 remove(s,0,parts[0]);expect(s.stage3!.equipment[0]).toEqual([parts[1]]);expect(s.discard).not.toContain('basic-051#01');remove(s,0,parts[1]);expect(s.discard.filter(c=>c==='basic-051#01')).toHaveLength(1);expect(gState(s).pairs).toEqual({});
});
it('bodyguard pieces spend and break separately before the single backing entity is discarded',()=>{
 let s=wear(gFixture(),'basic-070#01');s.active=1;s.players[0].ap=0;const parts=s.stage3!.equipment[0].slice();
 for(let i=1;i<=4;i++){give(s,1,`basic-003#0${i}`);s=gDrain(gRun(s,{type:'play',card:`basic-003#0${i}`,targets:[0]}));expect(s.players[0].hp).toBe(3);if(i===1)expect(parts.map(c=>s.stage4!.durability[c])).toEqual([1,2]);if(i===2){expect(s.stage3!.equipment[0]).toEqual([parts[1]]);expect(s.discard).not.toContain('basic-070#01');}}
 expect(s.stage3!.equipment[0]).toEqual([]);expect(s.discard.filter(c=>c==='basic-070#01')).toHaveLength(1);expect(gState(s).pairs).toEqual({});
});
it('a countered first copy strips no old gear; the second replaces only one selected item',()=>{
 let s=gFixture(['character-021','character-002','character-025','character-031']);equip(s,0,'basic-049#01');equip(s,0,'basic-050#01');s=quote(s,'basic-051#01');s.random.dice=[6];
 s=gRun(s,{type:'play',card:'basic-051#01',targets:[],replacements:['basic-049#01','basic-050#01']});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.stage3!.equipment[0]).toEqual(['basic-049#01','basic-050#01']);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});
 expect(s.stage3!.equipment[0]).toEqual(['basic-050#01',gPiece('basic-051#01',2)]);expect(s.discard).toContain('basic-049#01');expect(s.discard).not.toContain('basic-050#01');expect(s.discard).not.toContain('basic-051#01');
});
it('both hand-slot loss effects have separate choices and the old physical enters discard once',()=>{
 let s=wear(gFixture(),'basic-054#01');const old=[...s.stage3!.equipment[0]];s.players[0].hp=1;s=quote(s,'basic-052#01');s=gRun(s,{type:'play',card:'basic-052#01',targets:[],replacements:old});expect(s.choice?.kind).toBe('gear-loss');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('gear-loss');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});
 expect(s.stage3!.equipment[0]).toEqual([gPiece('basic-052#01',1),gPiece('basic-052#01',2)]);expect(s.players[0].hp).toBe(3);expect(s.discard.filter(c=>c==='basic-054#01')).toHaveLength(1);expect(s.events.filter(e=>e.type==='choice'&&e.text.endsWith('gear-loss'))).toHaveLength(2);
});
it('a stolen paired piece goes directly to equipment and continues sharing one physical source across owners',()=>{
 let s=wear(gFixture(),'basic-070#01');const piece=s.stage3!.equipment[0][0];s.active=1;give(s,1,'basic-024#01');s=gRun(s,{type:'play',card:'basic-024#01',targets:[0],take:'equipment',item:piece});
 expect(s.stage3!.equipment[1]).toEqual([piece]);expect(s.players[1].hand).not.toContain(piece);expect(gPiecePhysical(s,piece)).toBe('basic-070#01');const remaining=s.stage3!.equipment[0][0];
 give(s,1,'basic-024#02');gRun(s,{type:'play',card:'basic-024#02',targets:[0],take:'equipment',item:remaining},false);remove(s,0,remaining);expect(s.discard).not.toContain('basic-070#01');remove(s,1,piece);expect(s.discard.filter(c=>c==='basic-070#01')).toHaveLength(1);
});
it('bread pieces have separate cooldowns and the explicitly selected ready piece is used',()=>{
 let s=wear(gFixture(),'basic-054#01');const [first,second]=s.stage3!.equipment[0],start=s.stage3!.starts[0],ap=s.players[0].ap;
 s=gRun(s,{type:'skill',kind:'bread',target:1,card:second});expect(gState(s).gearBreadReadyAt[second]).toBe(start+2);expect(gState(s).gearBreadReadyAt[first]).toBe(start);
 gRun(s,{type:'skill',kind:'bread',target:2,card:second},false);s=gRun(s,{type:'skill',kind:'bread',target:2,card:first});expect(s.players[0].ap).toBe(ap-4);expect(s.stage3!.breadPending.slice(1,3)).toEqual([true,true]);expect(gState(s).gearBreadReadyAt[first]).toBe(start+2);gRun(s,{type:'skill',kind:'bread',target:3},false);
});
it('stolen bread preserves remaining starts of cooldown at the new owner without refreshing it',()=>{
 let s=wear(gFixture(),'basic-054#01');const piece=s.stage3!.equipment[0][0];s=gRun(s,{type:'skill',kind:'bread',target:1,card:piece});s.stage3!.starts[0]++;s.stage3!.starts[1]=5;s.active=1;give(s,1,'basic-024#01');s=gRun(s,{type:'play',card:'basic-024#01',targets:[0],take:'equipment',item:piece});expect(s.choice?.kind).toBe('gear-loss');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});
 expect(s.stage3!.equipment[1]).toContain(piece);expect(gState(s).gearBreadReadyAt[piece]).toBe(6);gRun(s,{type:'skill',kind:'bread',target:2,card:piece},false);s.stage3!.starts[1]++;s=gRun(s,{type:'skill',kind:'bread',target:2,card:piece});expect(gState(s).gearBreadReadyAt[piece]).toBe(8);
});
it('two cloaks offer distinct attempts and the second can block after the first fails',()=>{
 let s=wear(gFixture(),'basic-049#01');const parts=s.stage3!.equipment[0].slice();s.active=1;s.players[1].cell='r1c4';give(s,1,'basic-009#01');s.random.dice=[5,2,3];s=gRun(s,{type:'play',card:'basic-009#01',targets:[0]});expect(s.choice).toMatchObject({kind:'gear-cloak',data:{card:parts[0]}});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toMatchObject({kind:'gear-cloak',data:{card:parts[1]}});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(3);expect(s.random.dice).toEqual([]);expect(s.choice).toBeNull();
});
it('reflection pieces use separate durability and produce two nonrecursive reflected hits',()=>{
 let s=wear(gFixture(),'basic-051#01');const parts=s.stage3!.equipment[0].slice(),hp=s.players[1].hp;s.active=1;give(s,1,'basic-007#01');s=gRun(s,{type:'play',card:'basic-007#01',targets:[0]});for(const part of parts){expect(s.choice).toMatchObject({kind:'gear-reflect',data:{card:part}});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});}expect(s.players[1].hp).toBe(hp-2);expect(parts.map(c=>s.stage4!.durability[c])).toEqual([2,2]);expect(s.choice).toBeNull();
});
it('two sugar pieces each deduct one AP and extra damage cannot repeat either item within the logical root',()=>{
 let s=wear(gFixture(),'basic-055#01');s.active=1;give(s,1,'basic-007#01');const ap=s.players[1].ap;s=gRun(s,{type:'play',card:'basic-007#01',targets:[0]});expect(s.events.filter(e=>e.text.includes('冰糖雪梨扣S2 1AP'))).toHaveLength(2);expect(s.players[1].ap).toBe(ap-4);
});
it('two chalks each offer once on each logical attack and their extra hits do not recurse',()=>{
 let s=wear(gFixture(),'basic-052#01');s.players[1].hp=20;s.players[1].maxHp=20;give(s,0,'basic-007#01');s=gRun(s,{type:'play',card:'basic-007#01',targets:[1]});const cards:string[]=[];for(let i=0;s.choice&&i<8;i++){expect(s.choice.kind).toBe('gear-chalk');cards.push((s.choice.data as {card:string}).card);s=gRun(s,{type:'choose',choice:s.choice.id,accept:true});}expect(cards).toEqual([...s.stage3!.equipment[0],...s.stage3!.equipment[0]]);expect(s.players[1].hp).toBe(12);expect(s.choice).toBeNull();
});
it('range bonuses from both pieces add one region edge each',()=>{
 let s=gFixture();s.players[0].cell='r1c1';const def=runtimeForVersion(s.version).cards['basic-007'];const before=mapForVersion(s.version).cells.filter(c=>stage4CardRange(s,0,def,c.id)).map(c=>c.id);s=wear(s,'basic-058#01');const parts=s.stage3!.equipment[0].slice(),two=mapForVersion(s.version).cells.filter(c=>stage4CardRange(s,0,def,c.id)).map(c=>c.id);remove(s,0,parts[1]);const one=mapForVersion(s.version).cells.filter(c=>stage4CardRange(s,0,def,c.id)).map(c=>c.id);expect(one.length).toBeGreaterThan(before.length);expect(two.length).toBeGreaterThan(one.length);expect(one.every(c=>two.includes(c))).toBe(true);
});
it('watch pieces can each return once and selecting a used piece does not spend the other',()=>{
 let s=wear(gFixture(),'basic-060#01');const [first,second]=s.stage3!.equipment[0];s.stage4!.watches[first]={current:s.players[0].cell,previous:'r1c1',usedTurn:null};s.stage4!.watches[second]={current:s.players[0].cell,previous:'r1c2',usedTurn:null};s=gRun(s,{type:'skill',kind:'watch',card:second});expect(s.players[0].cell).toBe('r1c2');gRun(s,{type:'skill',kind:'watch',card:second},false);s=gRun(s,{type:'skill',kind:'watch'});expect(s.players[0].cell).toBe('r1c1');expect(s.stage4!.watches[first].usedTurn).toBe(s.stage3!.turn);expect(s.stage4!.watches[second].usedTurn).toBe(s.stage3!.turn);
});
it('one Tang setting can remain active when the other is switched off or stolen',()=>{
 let s=wear(gFixture(),'basic-069#01');const [first,second]=s.stage3!.equipment[0];s=gRun(s,{type:'skill',kind:'terrain',accept:true});s=gRun(s,{type:'skill',kind:'terrain',card:first,accept:false});expect(ignoreLocation(s,0)).toBe(true);s.active=1;give(s,1,'basic-024#01');s=gRun(s,{type:'play',card:'basic-024#01',targets:[0],take:'equipment',item:first});expect(gState(s).gearTerrain[second]).toBe(true);expect(gState(s).gearTerrain[first]).toBe(false);expect(ignoreLocation(s,0)).toBe(true);expect(ignoreLocation(s,1)).toBe(false);s=gRun(s,{type:'skill',kind:'terrain',actor:0,card:second,accept:false});expect(ignoreLocation(s,0)).toBe(false);
});
it('Guan pieces react separately within one root with current cells rechecked after each reaction',()=>{
 let s=wear(gFixture(),'basic-068#01');const parts=s.stage3!.equipment[0].slice();s.active=1;give(s,1,'basic-007#01');s=gRun(s,{type:'play',card:'basic-007#01',targets:[0]});expect(s.choice).toMatchObject({kind:'gear-react',data:{card:parts[0]}});s=gRun(s,{type:'choose',choice:s.choice!.id,cell:'r1c4'});expect(s.choice).toMatchObject({kind:'gear-react',data:{card:parts[1]}});expect(s.choice!.cells).toContain('r1c5');s=gRun(s,{type:'choose',choice:s.choice!.id,cell:'r1c5'});expect(s.players[0].cell).toBe('r1c5');expect(s.choice).toBeNull();
});
it('changed installation capacity leaves a paired piece at its original owner instead of putting it into a hand',()=>{
 let s=wear(gFixture(['character-021','character-048','character-002','character-031']),'basic-070#01');const piece=s.stage3!.equipment[0][0];s.active=1;give(s,1,'basic-024#01');s=gRun(s,{type:'play',card:'basic-024#01',targets:[0],take:'equipment',item:piece});expect(s.choice?.kind).toBe('easy');equip(s,1,'basic-069#01');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});
 expect(s.stage3!.equipment[0]).toContain(piece);expect(s.stage3!.equipment[1]).toEqual(['basic-069#01']);expect(s.players.flatMap(p=>p.hand)).not.toContain(piece);expect(s.events.some(e=>e.text==='成对装备件无法合法安装，留在原装备区')).toBe(true);
});
it('private entity validation rejects missing ledgers, virtual hands and duplicated pieces',()=>{
 const s=wear(gFixture(),'basic-070#01'),piece=s.stage3!.equipment[0][0];let bad=structuredClone(s);delete bad.stage3!.g!.pairs['basic-070#01'];expect(()=>validateState(bad)).toThrow('G装备实体账本无效');bad=structuredClone(s);bad.stage3!.equipment[0].shift();bad.players[0].hand.push(piece);expect(()=>validateState(bad)).toThrow('G装备实体账本无效');bad=structuredClone(s);bad.stage3!.equipment[1].push(piece);expect(()=>validateState(bad)).toThrow('G装备实体账本无效');
});
