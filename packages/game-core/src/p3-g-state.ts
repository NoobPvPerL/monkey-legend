import {hasP3GRules} from '../../game-data/src/index';
import type {GameState} from './types';
import type {GDiePending} from './p3-g-dice';
export const gEnabled=hasP3GRules;
export interface GGearPair {parts:string[];removed:string[];open:boolean}
export interface P3GState {
 invisEndTurn:(number|null)[];programUsed:boolean[];counterUsed:boolean[];invisible:boolean[];face:number[];marks:(number|null)[];
 forecast:{round:number;regions:string[]}|null;pairs:Record<string,GGearPair>;dice?:GDiePending;
 gearBreadReadyAt:Record<string,number>;
 gearTerrain:Record<string,boolean>;
}
export function initialGState():P3GState {return {invisEndTurn:[null,null,null,null],programUsed:[false,false,false,false],counterUsed:[false,false,false,false],invisible:[false,false,false,false],face:[0,0,0,0],marks:[null,null,null,null],forecast:null,pairs:{},gearBreadReadyAt:{},gearTerrain:{}};}
export function gState(s:GameState):P3GState {if(!s.stage3?.g)throw Error('G批状态缺失');return s.stage3.g;}
export function gTurnStart(s:{version?:string;stage3:{g?:P3GState}},a:number){if(!gEnabled(s.version))return;const g=s.stage3.g;if(!g)throw Error('G批状态缺失');g.programUsed.fill(false);g.counterUsed.fill(false);g.invisible[a]=false;g.face[a]=0;g.marks=g.marks.map(owner=>owner===a?null:owner);}
