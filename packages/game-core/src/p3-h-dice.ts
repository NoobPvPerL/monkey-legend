import {hActiveAllowed} from './p3-h-active';
import {hEnabled,hState} from './p3-h-state';
import {eRoot} from './p3-e';
import {onBoard} from './stage4-board';
import type {GameState} from './types';
export interface HDieStep {root:string;rolled:boolean;reroll:number|null;sixActor:number|null;draw:boolean}
export const hRerollKey=(s:GameState,owner:number)=>`${owner}:${eRoot(s).replace(/^(?:revision|move)([0-9]+)$/,'action$1')}`;
export function hCanReroll(s:GameState,owner:number|null){return hEnabled(s.version)&&owner!==null&&onBoard(s,owner)&&hActiveAllowed(s,owner)&&s.players[owner].character==='character-015'&&!hState(s).rerollRoots[hRerollKey(s,owner)];}
export function hSixActor(s:GameState,owner:number|null,value:number):number|null{return !hEnabled(s.version)||owner===null||value!==6?null:s.order.find(a=>hActiveAllowed(s,a)&&onBoard(s,a)&&s.players[a].character==='character-001')??null;}
