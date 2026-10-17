import type {Stage4Costs} from './stage4-costs';
import {initialStage4Costs} from './stage4-costs';
import type {EquipmentSource} from './stage3-resources';
export interface RegionEffect {owner:number;effect:EquipmentSource}
export interface RegionBlock extends RegionEffect {region:string;until:number;exempt:number[]}
export interface InterruptIntent {actor:number;card:string;effect:EquipmentSource;team:string}
export interface Stage4State {
 costs:Stage4Costs;
 tea:boolean[];dodge:boolean[];exerciseFree:boolean[];exerciseGuard:boolean[];
 downPending:boolean[];drawBlocked:boolean[];
 baseFactions:string[];baseTeams:string[];
 conversion:('monkey'|'dimon'|null)[];
 toiletUntil:(number|null)[];lmmUntil:(number|null)[];
 toiletEffects:Record<string,EquipmentSource>;lmmEffects:Record<string,EquipmentSource>;lmmSerial:number[];
 water:Record<string,RegionEffect>;deserts:Record<string,RegionEffect>;blocks:RegionBlock[];
 offMap:boolean[];
 interrupts:InterruptIntent[];interruptTurn:number|null;interruptSkipEnd:boolean;
 buffSources:Record<string,EquipmentSource>;terrainIgnore:boolean[];
 watches:Record<string,{current:string|null;previous:string|null;usedTurn:number|null}>;
 copies:Record<string,string>;durability:Record<string,number>;gearMarks:Record<string,boolean>;tongPending:Record<string,EquipmentSource>;tongBlocked:Record<string,EquipmentSource>;
}
export function initialStage4State(players:{faction:string;team:string}[]):Stage4State {
 const four=()=>Array.from({length:4},()=>false);
 return {buffSources:{},terrainIgnore:four(),watches:{},gearMarks:{},tongPending:{},tongBlocked:{},copies:{},durability:{},costs:initialStage4Costs(),tea:four(),dodge:four(),exerciseFree:four(),exerciseGuard:four(),
  downPending:four(),drawBlocked:four(),baseFactions:players.map(p=>p.faction),baseTeams:players.map(p=>p.team),conversion:Array.from({length:4},()=>null),
  toiletUntil:Array.from({length:4},()=>null),lmmUntil:Array.from({length:4},()=>null),toiletEffects:{},lmmEffects:{},lmmSerial:[0,0,0,0],water:{},deserts:{},blocks:[],offMap:four(),interrupts:[],interruptTurn:null,interruptSkipEnd:false};
}
