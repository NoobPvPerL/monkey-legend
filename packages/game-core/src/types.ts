import type {CharacterId,RuleVersion} from '../../game-data/src/index';
import type {Stage3Resources,EquipmentSource} from './stage3-resources';
import type {CardStack} from './stage3-card-stack';
import type {Direction} from './stage3-roles';
import type {Stage4State} from './stage4-state';
export type Mode = 'ffa'|'team';
export interface Player { seat:number; character:CharacterId; team:string; faction:string; hp:number; maxHp:number; ap:number; shield:number; cell:string; hand:string[]; moved:boolean; attacks:number; skillUsed:boolean; rewarded:number[]; kills:number; damage:number; eliminated:number|null }
export interface RandomTraceEntry {bound:number;value:number;seed:number}
export interface RandomState { seed:number; dice:number[]; bombs:string[]; reshuffles:string[][]; sortedReshuffles:boolean;_gTrace?:{index:number;entries:RandomTraceEntry[]} }
export interface Setup { mode:Mode; seed:number; seats:number[]; ruleVersion?:RuleVersion; characters?:CharacterId[]; teams?:string[]; first?:number; deck?:string[]; dice?:number[]; bombs?:string[]; reshuffles?:string[][]; sortedReshuffles?:boolean }
export interface Event { seq:number; type:string; text:string; data?:unknown }
export interface DamageHit {target:number;amount:number;source:number|null;category:'attack'|'response'|'environment';trueDamage?:boolean;reflected?:boolean;directHp?:boolean;extra?:boolean;originCard?:string;jelly?:boolean}
export type ChoiceKind = 'h-equip-draw'|'h-small'|'h-birth'|'h-respect'|'h-ren-retreat'|'h-ren-back'|'h-ren-expel'|'h-ren-gear'|'h-cooperate'|'h-circle-pay'|'h-attract'|'h-reroll'|'h-six'|'g-haki'|'g-food'|'g-invisible'|'g-white-eye'|'g-counter'|'g-discard'|'g-program'|'g-math'|'f-bccb'|'f-sting'|'f-self-harm'|'f-discard'|'f-target'|'f-tenacity'|'move-consent'|'egg-move'|'force-step'|'encourage'|'encourage-discard'|'primitive-food'|'draw-start'|'draw-end'|'response'|'lemon-reward'|'lemon-support'|'runner-roll'|'runner-pay'|'teleport'|'discard'|'water-discard'|'easy'|'qb-pursuit'|'east-start'|'xiao-overflow'|'xie-ledger'|'elbow-push'|'west-carry'|'equipment-loss'|'revival-confirm'|'card-counter'|'forced-card'|'board-path'|'board-cell'|'board-guess'|'board-tax'|'board-return'|'gear-loss'|'gear-cloak'|'gear-reflect'|'gear-chalk'|'gear-plant'|'gear-react'|'gear-push'|'gear-terrain'|'native-shore';
export interface Choice { id:number; kind:ChoiceKind; actor:number; deadline:number; paused:boolean; cards?:string[]; cells?:string[]; count?:number; source?:number;targets?:number[];data?:unknown;options?:Record<string,string[]> }
export interface Attack { actor:number; card:string; targets:number[]; cancelled:number[]; elbows:number[] }
export interface Task { kind:'turn-start'|'action'|'end-draw'|'discard'|'next'|'response'|'resolve'|'cleanup'|'after-env'|'trigger'|'water'|'classic-start'|'round-next'|'walk'|'cave-end'|'cave-after'|'stage3'; actor?:number; trigger?:ChoiceKind; source?:number; path?:string[];action?:string;target?:number;serial?:number;card?:string;data?:unknown }
export interface Ranking { label:string; players:number[]; rank:number; alive:number; hp:number; maxHp:number; kills:number; damage:number }
export interface Result { reason:'natural'|'round-limit'|'draw'|'combo'; winners:number[]; ranking:Ranking[] }
export interface GameState {
 exercise?:import('./exercise').ExerciseOwnership;
 version:RuleVersion; revision:number; time:number; mode:Mode; players:Player[]; order:number[]; cursor:number; active:number; round:number;
 phase:'action'|'moving'|'choice'|'resolving'|'over'; deck:string[]; discard:string[]; resolving:string[];
 random:RandomState; queue:Task[]; choice:Choice|null; choiceSerial:number; attack:Attack|null;
 movement:{haki?:number[];remaining:number; lastEmpty:string; origin:string; path:string[]; costDue?:boolean;gearRoot?:number;gearQueued?:boolean;gearQuiet?:boolean;direction?:Direction;carry?:{actor:number;origin:string}[]}|null;
 safe:string[]; bomb:string|null; forecast:{round:number; safe:string[]; bomb:string|null}|null;
 clock:{remaining:number; since:number|null}; events:Event[]; eventSerial:number; batch:number; reshuffleCount:number;
 classic?:{poison:string[];bombs:string[];exposure:{region:string|null;streak:number}[];shipUsed:number[];farmClosed:boolean;bombRound?:number;caveEnds?:number[]};
 stage3?:Stage3Resources;
 stage4?:Stage4State;
 cardStack?:CardStack;
 seen:string[]; result:Result|null;
}
export type Command = { id:string; revision:number; actor:number } & (
 {type:'play';card:string;targets:number[];as?:'elbow'|'dodge';direction?:Direction;replacement?:string;replacements?:string[];x?:number;region?:string;take?:'hand'|'equipment';item?:string;copy?:string;northGroup?:'north'|'others'}|{type:'move';direction?:Direction;cell?:string}|{type:'location';kind:'ship'|'commute';cell:string}|{type:'step';path:string[]}|{type:'stop'}|{type:'end'}|
 {type:'choose';choice:number;accept?:boolean;card?:string|null;cell?:string|null;cards?:string[];target?:number;targets?:number[];action?:'draw'|'steal'|'ap';option?:string;guess?:number}|{type:'tick'}|
 {type:'skill';kind:'ren'|'cooperate'|'circle'|'freeze'|'dog'|'jj'|'bread'|'revival-quote'|'quote-cost'|'watch'|'flight'|'gift'|'terrain'|'mayi'|'feather'|'clan'|'gas'|'escape'|'execute'|'magma';direction?:Direction;region?:string;accept?:boolean;target?:number;card?:string;cell?:string;cards?:string[]}
);
export interface DispatchResult { state:GameState; ok:boolean; error?:string }
