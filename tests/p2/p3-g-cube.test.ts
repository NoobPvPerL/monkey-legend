import {expect,it} from 'vitest';
import {gFixture,gRun,gDrain} from './p3-g-fixture';
import {give,equip} from './p3-fixture';
import {gCubeFace,gCubeDestinations} from '../../packages/game-core/src/p3-g-cube';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import {fDamage,fMovementGate} from '../../packages/game-core/src/p3-f';
import {eGate} from '../../packages/game-core/src/p3-e';
import {boardEmptyEntry} from '../../packages/game-core/src/stage4-board';
import {bombingRegions} from '../../packages/game-core/src/classic';
import {mapForVersion} from '../../packages/game-data/src/index';
import type {GameState,DamageHit} from '../../packages/game-core/src/types';
function face(n:number,ids=['character-028','character-048','character-025','character-031']){const s=gFixture(ids);s.stage3!.g!.face[0]=n;return s;}
function hit(s:GameState,hits:DamageHit[],environment=false){s.queue.push(...fDamage(s,hits,environment));s.phase='resolving';return gDrain(gRun(s,{type:'end'}));}
it('each real personal start judges exactly once and applies all six final faces, including first-round draw2',()=>{
 for(let n=1;n<=6;n++){let s=gFixture(['character-048','character-028','character-025','character-031']);s.random.dice=[n];const ap=s.players[1].ap,deck=s.deck.length;s=gRun(s,{type:'end'});expect(s.active).toBe(1);expect(s.stage3!.g!.face[1]).toBe(n);expect(s.players[1].ap).toBe(ap+(n===4?2:0));expect(s.players[1].hand).toHaveLength(n===3?2:0);expect(s.deck).toHaveLength(deck-(n===3?2:0));expect(s.events.filter(e=>e.type==='dice'&&e.text.startsWith('魔法有方'))).toHaveLength(1);expect(s.random.dice).toEqual([]);expect(s.phase).toBe('action');}
});
it('programming finalizes the start face before resources/draw and survives persistence without a second start',()=>{
 let s=gFixture(['character-033','character-028','character-025','character-031']);s.random.dice=[2,3];s=gRun(s,{type:'end'});expect(s.choice).toMatchObject({kind:'g-program',actor:0});expect(s.stage3!.g!.face[1]).toBe(0);expect(s.players[1].hand).toEqual([]);const starts=s.stage3!.starts[1];s=JSON.parse(JSON.stringify(s));s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.stage3!.g!.face[1]).toBe(3);expect(s.players[1].hand).toHaveLength(2);expect(s.stage3!.starts[1]).toBe(starts);expect(s.events.filter(e=>e.type==='turn'&&e.text==='S2 魔方小子 开始行动')).toHaveLength(1);
});
it('face3 adds to normal farm draw and blocked normal draw suppresses both the first-round and later bonus',()=>{
 for(const [round,blocked,count] of [[1,true,0],[2,true,0],[2,false,5]] as const){let s=gFixture(['character-048','character-028','character-025','character-031']);s.round=round;s.players[1].cell='r1c1';s.stage4!.downPending[1]=blocked;s.random.dice=[3];s=gRun(s,{type:'end'});expect(s.players[1].hand).toHaveLength(count);}
});
it('face4 is independent of coffee blocked normal AP, and Xiaochong siphons its real overflow',()=>{
 let s=gFixture(['character-048','character-028','character-043','character-031']);s.players[1].ap=6;s.stage3!.coffeeUntilStart[1]=s.stage3!.starts[1]+1;s.random.dice=[4];const collector=s.players[2].ap;s=gRun(s,{type:'end'});expect(s.players[1].ap).toBe(7);expect(s.players[2].ap).toBe(collector+1);expect(s.stage3!.coffeeUntilStart[1]).toBeNull();
});
it('face1 blocks proactive actual attacks and tea elbow without taking AP, card, buff or basic movement',()=>{
 for(const card of ['basic-003#01','basic-007#01','basic-009#01','basic-002#01']){const s=face(1);s.players[0].cell='r1c2';s.stage4!.tea[0]=true;give(s,0,card);expect(stage4Actions(s,0).cards[card].allowed).toBe(false);gRun(s,{type:'play',card,targets:[1],...(card.startsWith('basic-002')?{direction:'right'}:{})},false);}
 let s=face(1);give(s,0,'basic-039#01');s.players[0].hp=1;s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.players[0].hp).toBe(2);s.random.dice=[2];s=gRun(s,{type:'move'});expect(s.phase).toBe('moving');
});
it('face1 does not block nonattack damage, or higher exercise responses on the following personal turn',()=>{
 let s=face(1);s.players[0].hp=3;s.random.dice=[6];give(s,0,'basic-048#01');s=gRun(s,{type:'play',card:'basic-048#01',targets:[]});expect(s.players[0].hp).toBe(2);
 s=face(1);give(s,0,'basic-004#01');s=gDrain(gRun(s,{type:'end'}));expect(gCubeFace(s,0)).toBe(0);give(s,1,'basic-003#01');s=gRun(s,{type:'play',card:'basic-003#01',targets:[0]});expect(s.choice).toMatchObject({kind:'response',actor:0});expect(s.choice!.cards).toContain('basic-004#01');s=gDrain(gRun(s,{type:'choose',choice:s.choice!.id,card:'basic-004#01'}));
});
it('face2 blocks voluntary/forced relocation, swap and leaving the map while placement exceptions remain valid',()=>{
 let s=face(2);expect(stage3Actions(s,0).movementBlocked).toBe(true);gRun(s,{type:'move'},false);expect(fMovementGate(s,0,'r1c8',()=>6)).toBe(false);expect(eGate(s,0,1,[])).toEqual([]);expect(boardEmptyEntry(s,0,'r1c8',[0])).toBe(false);expect(boardEmptyEntry(s,0,'r1c8',[0],true)).toBe(true);expect(fMovementGate(s,0,'r1c8',()=>6,true)).toBe(true);
 give(s,0,'basic-016#01');gRun(s,{type:'play',card:'basic-016#01',targets:[1]},false);give(s,0,'basic-034#01');s.random.dice=[1];s=gRun(s,{type:'skill',kind:'quote-cost',card:'basic-034#01'});s=gRun(s,{type:'play',card:'basic-034#01',targets:[]});expect(s.stage4!.offMap[0]).toBe(false);
});
it('face2 also blocks equipment relocation and expires for forced effects after this personal turn',()=>{
 let s=face(2);equip(s,0,'basic-074#01');gRun(s,{type:'skill',kind:'flight',cell:'r1c8'},false);equip(s,0,'basic-060#01');s.stage4!.watches['basic-060#01']={current:s.players[0].cell,previous:'r1c8',usedTurn:null};gRun(s,{type:'skill',kind:'watch'},false);s=gDrain(gRun(s,{type:'end'}));expect(gCubeFace(s,0)).toBe(0);expect(boardEmptyEntry(s,0,'r1c8',[0])).toBe(true);expect(eGate(s,0,1,[])).toBeNull();
});
it('face6 teleports globally using one original basic movement and source-location AP, without a basic die',()=>{
 let s=face(6);s.players[0].cell='r1c2';const dice=[2,4];s.random.dice=[...dice];gRun(s,{type:'move'},false);gRun(s,{type:'move',cell:'r1c3'},false);const ap=s.players[0].ap;s=gRun(s,{type:'move',cell:'r4c8'});expect(s.players[0]).toMatchObject({cell:'r4c8',ap:ap-1,moved:true});expect(s.stage3!.basicUsed[0]).toBe(1);expect(s.movement).toBeNull();expect(s.random.dice).toEqual(dice);gRun(s,{type:'move',cell:'r1c8'},false);
});
it('face6 preserves two basic moves with WaitGoat and pays the second move from the new playground origin',()=>{
 let s=gFixture(['character-048','character-028','character-025','character-031']);equip(s,1,'basic-066#01');s.stage3!.previousBasic[1]=false;s.random.dice=[6];s=gRun(s,{type:'end'});expect(s.stage3!.doubleMove[1]).toBe(true);const ap=s.players[1].ap;s=gRun(s,{type:'move',cell:'r3c4'});expect(s.players[1].moved).toBe(false);expect(s.players[1].ap).toBe(ap-1);s=gRun(s,{type:'move',cell:'r1c8'});expect(s.players[1].moved).toBe(true);expect(s.players[1].ap).toBe(ap-1);expect(s.stage3!.basicUsed[1]).toBe(2);expect(s.random.dice).toEqual([]);
});
it('face6 preserves water entry discard, forbidden water mounts, closed farm and terrain blocks',()=>{
 let s=face(6);give(s,0,'basic-001#01');s=gRun(s,{type:'move',cell:'r3c3'});expect(s.choice).toMatchObject({kind:'water-discard',actor:0});s=gRun(s,{type:'choose',choice:s.choice!.id,cards:['basic-001#01']});expect(s.players[0].cell).toBe('r3c3');
 s=face(6);equip(s,0,'basic-063#01');expect(gCubeDestinations(s,0)).not.toContain('r3c3');gRun(s,{type:'move',cell:'r3c3'},false);s.classic!.farmClosed=true;expect(gCubeDestinations(s,0)).not.toContain('r1c1');
 s.stage4!.blocks.push({region:'飞船',owner:1,until:s.stage3!.starts[1]+1,exempt:[],effect:{origin:'card',actor:1,faction:s.players[1].faction,roleModifiers:[]}});expect(gCubeDestinations(s,0)).not.toContain('r1c8');gRun(s,{type:'move',cell:'r1c8'},false);
});
it('face6 is still a real movement chain for egg reactions but spends only the cubes basic movement',()=>{
 let s=face(6,['character-028','character-024','character-025','character-031']);s.players[0].cell='r1c2';s=gRun(s,{type:'move',cell:'r1c8'});expect(s.choice).toMatchObject({kind:'egg-move',actor:1});expect(s.stage3!.basicUsed[0]).toBe(1);expect(s.stage3!.basicUsed[1]).toBe(0);s=gDrain(s);expect(s.events.filter(e=>e.type==='choice'&&e.text.includes('egg-move'))).toHaveLength(1);
});
it('face5 marks immediately between survived hits in one real damage batch and can remark after consuming it',()=>{
 let s=face(5);const hp=s.players[1].hp;s=hit(s,[{target:1,amount:1,source:0,category:'attack'},{target:1,amount:1,source:0,category:'attack'}]);expect(s.players[1].hp).toBe(hp-3);expect(s.stage3!.g!.marks[1]).toBe(0);const hits=s.events.filter(e=>e.type==='damage');expect(new Set(hits.map(e=>(e.data as any).batch)).size).toBe(1);expect(s.events.filter(e=>e.text.includes('消耗S1魔方标记'))).toHaveLength(1);
});
it('face5 ignores fully shielded and lethal loss, but supports self damage and respects locked-skill immunity',()=>{
 let s=face(5);s.players[1].shield=2;s=hit(s,[{target:1,amount:1,source:0,category:'attack'}]);expect(s.stage3!.g!.marks[1]).toBeNull();s=face(5);s.players[1].hp=1;s=hit(s,[{target:1,amount:1,source:0,category:'attack'}]);expect(s.stage3!.g!.marks[1]).toBeNull();
 s=face(5);s=hit(s,[{target:0,amount:1,source:0,category:'response'}]);expect(s.stage3!.g!.marks[0]).toBe(0);
 for(const role of ['character-026','character-044']){s=face(5,['character-028',role,'character-025','character-031']);s=hit(s,[{target:1,amount:1,source:0,category:'attack'}]);expect(s.stage3!.g!.marks[1]).toBe(role==='character-026'?null:0);}
});
it('existing marks survive complete equipment prevention, consume on full shield, and obey the existing damage cap',()=>{
 let s=face(5);s.active=1;s.stage3!.g!.marks[2]=0;equip(s,2,'basic-070#01');s=hit(s,[{target:2,amount:1,source:1,category:'attack'}]);expect(s.stage3!.g!.marks[2]).toBe(0);expect(s.players[2].hp).toBe(s.players[2].maxHp);
 s=face(5);s.active=1;s.stage3!.g!.marks[2]=0;s.players[2].shield=2;const hp=s.players[2].hp;s=hit(s,[{target:2,amount:1,source:1,category:'attack'}]);expect(s.players[2]).toMatchObject({hp,shield:0});expect(s.stage3!.g!.marks[2]).toBeNull();
 s=face(5);s.active=1;s.stage3!.g!.marks[2]=0;s.players[2].shield=1;equip(s,2,'basic-059#01');s=hit(s,[{target:2,amount:3,source:1,category:'attack'}]);expect(s.players[2]).toMatchObject({hp,shield:0});expect(s.stage3!.g!.marks[2]).toBeNull();
});
it('environment damage can consume an old mark, while face5 no longer creates marks outside its owners personal turn',()=>{
 let s=face(5);s.active=1;s.stage3!.g!.marks[2]=0;const hp=s.players[2].hp;s=hit(s,[{target:2,amount:1,source:null,category:'environment'}],true);expect(s.players[2].hp).toBe(hp-2);expect(s.stage3!.g!.marks[2]).toBeNull();s=hit(s,[{target:1,amount:1,source:0,category:'response'}]);expect(s.stage3!.g!.marks[1]).toBeNull();
});
it('all old owner marks clear at its next personal start before its new face is judged',()=>{
 let s=face(5);s.stage3!.g!.marks[1]=0;const map=mapForVersion(s.version),occupied=new Set(s.players.map(p=>map.map[p.cell].region));s.random.bombs=bombingRegions(s).filter(r=>!occupied.has(r)).slice(0,2);for(let n=0;n<3;n++)s=gDrain(gRun(s,{type:'end'}));s.random.dice=[6];s=gRun(s,{type:'end'});expect(s.active).toBe(0);expect(s.stage3!.g!.marks[1]).toBeNull();expect(s.stage3!.g!.face[0]).toBe(6);
});
it('saved v17 ignores private fixture cube data and rejects the new destination intent',()=>{
 let s=face(2);s.players[0].character='character-003';s.version='web-v0.1.17';expect(stage3Actions(s,0).movementBlocked).toBe(false);gRun(s,{type:'move',cell:'r1c8'},false);s.random.dice=[2];s=gRun(s,{type:'move'});expect(s.phase).toBe('moving');
});
