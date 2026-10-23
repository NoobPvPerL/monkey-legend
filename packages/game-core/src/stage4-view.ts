import {hEquipmentWatch,hEquipmentStarts,hEquipmentPublic} from './p3-h-equipment';
import {gCubeAttackBlocked} from './p3-g-cube';
import {gCardTargetAllowed} from './p3-g-observer';
import {gPrimeActive} from './p3-g-cards';
import {gEnabled,gState} from './p3-g-state';
import {hasExerciseRules} from '../../game-data/src/index';
import {exerciseRank} from './exercise';
import {mapForVersion,runtimeForVersion} from '../../game-data/src/index';
import {STAGE4_CARDS} from '../../game-data/src/stage4';
import type {Stage4CardId} from '../../game-data/src/stage4';
import type {GameState} from './types';
import type {ResourceState} from './stage3-resources';
import * as resources from './stage3-resources';
import * as roles from './stage3-roles';
import {stage3Actions} from './stage3-engine';
import {stage4Targets} from './stage4-engine';
import {boardEmptyEntry,boardSingleProtected,onBoard} from './stage4-board';
import {combatGear,combatGears} from './stage4-combat';
import {terrainCard,terrainMoveCost} from './stage4-terrain';
type State=GameState&ResourceState&{stage4:NonNullable<GameState['stage4']>};
export function stage4PublicState(s:GameState){
 const r=s.stage4!;
 return {...hEquipmentPublic(s),copies:r.copies,durability:r.durability,offMap:r.offMap,terrainIgnore:r.terrainIgnore,
  water:Object.fromEntries(Object.entries(r.water).map(([region,e])=>[region,e.owner])),deserts:Object.fromEntries(Object.entries(r.deserts).map(([region,e])=>[region,e.owner])),
  blocks:r.blocks.map(b=>({region:b.region,owner:b.owner,until:b.until})),
  toilet:r.toiletUntil.map(v=>v!==null),lmm:r.lmmUntil.map(v=>v!==null),tongBlocked:s.players.map(p=>Boolean(r.tongBlocked[p.seat])),
  tea:r.tea,dodge:r.dodge,exerciseFree:r.exerciseFree,exerciseGuard:r.exerciseGuard};
}
export function stage4TeaTargets(s:GameState,a:number):number[]{
 const map=mapForVersion(s.version).map;return s.players.filter(q=>q.seat!==a&&onBoard(s,q.seat)&&gCardTargetAllowed(s,a,q.seat,'basic-002')&&!boardSingleProtected(s,a,q.seat)&&map[q.cell].region===map[s.players[a].cell].region).map(q=>q.seat);
}
export function stage4Actions(s:GameState,a:number){
 const st=s as State,base=stage3Actions(s,a),user=s.players[a],r=st.stage4,free=onBoard(s,a)&&s.active===a&&s.phase==='action'&&!s.choice;
 const moveBlocked=resources.mountMovementBlocked(st,a),normal=resources.fixedApCost(st,a,terrainMoveCost(s,a));
 const cards=Object.fromEntries(user.hand.map(card=>{
  const id=card.split('#')[0] as Stage4CardId,def=STAGE4_CARDS[id],info=base.cards[card],tea=id==='basic-002'&&r.tea[a];
  const exercise=['basic-003','basic-004','basic-005'].includes(id)&&r.exerciseFree[a];
  const targeted=tea||def.type==='attack'||['basic-016','basic-037','basic-018','basic-019','basic-021','basic-022','basic-024','basic-029','basic-030','basic-035','basic-036'].includes(id)||id==='basic-002'&&user.character==='character-023';
  const targets=tea?stage4TeaTargets(s,a):def.inherited?info.targets:targeted?stage4Targets(s,a,card):[];
  const elbow=tea||id==='basic-002'&&user.character==='character-023';
  const pushes=elbow?Object.fromEntries(targets.map(target=>{const cells=roles.elbowPushCells({...st,farmClosed:s.classic!.farmClosed},a,target);return [target,Object.fromEntries(roles.DIRECTIONS.map(d=>[d,roles.nextInDirection(s.players[target].cell,d)]).filter(([,cell])=>cell!==null&&cells.includes(cell)))];})):{};
  return [card,{...info,cost:tea||exercise?gPrimeActive(s,a)?1:0:def.cost.kind==='variable'?null:info.cost,needsQuote:!tea&&!exercise&&info.needsQuote,
   costKind:def.cost.kind,printedCost:hasExerciseRules(s.version)&&exerciseRank(card)?String(runtimeForVersion(s.version).cards[id].cost):def.printedCost,targeted,targets,tea,elbow,pushes,
   playable:(def.type!=='response'||elbow)&&!['basic-027','basic-028','basic-038'].includes(id),allowed:terrainCard(s,a,id)&&!gCubeAttackBlocked(s,a,def.type==='attack'||elbow),region:['basic-023','basic-032','basic-033'].includes(id),counter:['basic-027','basic-028','basic-038'].includes(id)}];
 }));
 const copyMounts=s.players.flatMap(q=>q.seat!==a&&onBoard(s,q.seat)?st.stage3.equipment[q.seat].filter(c=>c.split('#')[0]!=='basic-073'&&runtimeForVersion(s.version).cards[c.split('#')[0] as Stage4CardId].slot==='mount').map(card=>({owner:q.seat,card})):[]);
 const stealEquipment=Object.fromEntries(s.players.map(q=>[q.seat,Object.fromEntries(st.stage3.equipment[q.seat].map(card=>[card,resources.equipmentReplacements(st,a,card)]))]));
 const watch=combatGear(s,a,'basic-060'),record=watch?hEquipmentWatch(s,a,watch):null;
 const watchCell=free&&!moveBlocked&&record?.previous&&record.usedTurn!==st.stage3.turn&&record.previous!==user.cell&&boardEmptyEntry(st,a,record.previous,[a])?record.previous:null;
 const flightCost=normal+1,flightCells=free&&!moveBlocked&&!user.moved&&combatGear(s,a,'basic-074')&&user.ap>=flightCost?mapForVersion(s.version).cells.filter(c=>c.id!==user.cell&&boardEmptyEntry(st,a,c.id,[a])).map(c=>c.id):[];
 const giftTargets=free&&combatGear(s,a,'basic-075')?s.players.filter(q=>q.seat!==a&&onBoard(s,q.seat)).map(q=>q.seat):[];
 const interrupt=user.hand.find(c=>c.split('#')[0]==='basic-017'),reserve=s.active===a&&s.movement?.costDue&&s.movement.path.length>1?1:0;
 const canInterrupt=Boolean(interrupt&&onBoard(s,a)&&user.character!=='character-005'&&(s.active!==a||!st.stage3.breadBlocked[a])&&user.ap>=resources.cardApCost(st,a,interrupt!).cost+reserve);
 const equipmentSkills=gEnabled(s.version)?{bread:free?combatGears(s,a,'basic-054').filter(c=>hEquipmentStarts(st,a,c)>=(gState(s).gearBreadReadyAt[c]??0)):[],watch:free&&!moveBlocked?combatGears(s,a,'basic-060').flatMap(card=>{const v=hEquipmentWatch(s,a,card);return v?.previous&&v.usedTurn!==st.stage3.turn&&v.previous!==user.cell&&boardEmptyEntry(st,a,v.previous,[a])?[{card,cell:v.previous}]:[];}):[],terrain:onBoard(s,a)?combatGears(s,a,'basic-069').map(card=>({card,ignored:Boolean(gState(s).gearTerrain[card])})):[]}:undefined;
 return {cards,regions:Object.keys(mapForVersion(s.version).regions).sort(),copyMounts,stealEquipment,watchCell,flightCells,flightCost,giftTargets,canInterrupt,terrainSelectable:Boolean(onBoard(s,a)&&combatGear(s,a,'basic-069')),...(equipmentSkills?{equipmentSkills}:{})};
}
