import {gEnabled,gState} from './p3-g-state';
import {runtimeForVersion} from '../../game-data/src/index';
import type {GameState} from './types';
import type {ResourceState} from './stage3-resources';
const piecePattern=/#\d{2}~g[12]$/;
type State=Omit<ResourceState,'stage3'>&{stage3?:ResourceState['stage3'];resolving?:string[]};
function ledger(s:State){return s.stage3?.g?.pairs;}
export function gPiecePhysical(s:State,piece:string):string|null {return Object.entries(ledger(s)??{}).find(([,p])=>p.parts.includes(piece))?.[0]??null;}
export function gBeginPair(s:State,physical:string){if(!gEnabled(s.version))return;const pairs=ledger(s);if(!pairs)throw Error('G装备账本缺失');pairs[physical]??={parts:[`${physical}~g1`,`${physical}~g2`],removed:[],open:true};}
export const gPiece=(physical:string,copy:1|2)=>`${physical}~g${copy}`;
/** Returns physical entries only; the equipment fragments never enter a hand. */
export function gDiscardEntries(s:State,card:string):string[]{
 if(!gEnabled(s.version))return [card];const pairs=ledger(s);if(!pairs)throw Error('G装备账本缺失');
 if(s.stage3?.g){delete s.stage3.g.gearBreadReadyAt[card];delete s.stage3.g.gearTerrain[card];}
 const physical=gPiecePhysical(s,card);
 if(physical){const pair=pairs[physical];if(!pair.removed.includes(card))pair.removed.push(card);if(pair.open||pair.removed.length!==pair.parts.length)return [];delete pairs[physical];return [physical];}
 if(piecePattern.test(card))throw Error('成对装备件缺少实体来源');
 const pair=pairs[card];if(!pair)return [card];pair.open=false;
 const active=[...(s.stage3?.equipment.flat()??[]),...(s.resolving??[])];for(const part of pair.parts)if(!active.includes(part)&&!pair.removed.includes(part))pair.removed.push(part);
 if(pair.removed.length!==pair.parts.length)return [];delete pairs[card];return [card];
}
export function gPhysicalEquipment(s:GameState):string[]{return !gEnabled(s.version)?[]:Object.entries(gState(s).pairs).filter(([,p])=>!p.open).map(([id])=>id);}
export function gEquipmentValid(s:GameState):boolean {
 if(!gEnabled(s.version))return true;const pairs=s.stage3?.g?.pairs;if(!pairs)return false;
 const pieces=[...(s.stage3?.equipment.flat()??[]),...s.resolving].filter(c=>piecePattern.test(c));
 const cards=runtimeForVersion(s.version).cards;
 for(const player of s.players){const slots:Record<string,number>={},names=new Set<string>();for(const gear of s.stage3!.equipment[player.seat]){const id=gear.split('#')[0] as keyof typeof cards,slot=cards[id]?.slot;if(!slot)return false;slots[slot]=(slots[slot]??0)+1;if(slots[slot]>(player.character==='character-021'||slot==='hand'?2:1)||player.character!=='character-021'&&names.has(id))return false;names.add(id);}}
 if(new Set(pieces).size!==pieces.length||[...s.deck,...s.discard,...s.players.flatMap(p=>p.hand)].some(c=>piecePattern.test(c)))return false;
 for(const piece of pieces)if(!gPiecePhysical(s,piece))return false;
 for(const [physical,pair] of Object.entries(pairs)){
  if(typeof pair.open!=='boolean'||pair.parts.length!==2||pair.parts[0]!==gPiece(physical,1)||pair.parts[1]!==gPiece(physical,2)||new Set(pair.removed).size!==pair.removed.length||pair.removed.some(p=>!pair.parts.includes(p)))return false;
  if(pair.open?!s.resolving.includes(physical):s.resolving.includes(physical))return false;
  for(const piece of pair.parts)if(pair.removed.includes(piece)?pieces.includes(piece):!pair.open&&!pieces.includes(piece))return false;
 }
 return true;
}
