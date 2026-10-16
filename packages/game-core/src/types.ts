import type {CharacterId} from '../../game-data/src/index';
export type Mode = 'ffa'|'team';
export interface Player { seat:number; character:CharacterId; team:string; faction:string; hp:number; maxHp:number; ap:number; shield:number; cell:string; hand:string[]; moved:boolean; attacks:number; skillUsed:boolean; rewarded:number[]; kills:number; damage:number; eliminated:number|null }
export interface RandomState { seed:number; dice:number[]; bombs:string[]; reshuffles:string[][]; sortedReshuffles:boolean }
export interface Setup { mode:Mode; seed:number; seats:number[]; ruleVersion?:'web-v0.1.1'|'web-v0.1.2'; characters?:CharacterId[]; teams?:string[]; first?:number; deck?:string[]; dice?:number[]; bombs?:string[]; reshuffles?:string[][]; sortedReshuffles?:boolean }
export interface Event { seq:number; type:string; text:string; data?:unknown }
export type ChoiceKind = 'draw-start'|'draw-end'|'response'|'lemon-reward'|'lemon-support'|'runner-roll'|'runner-pay'|'teleport'|'discard';
export interface Choice { id:number; kind:ChoiceKind; actor:number; deadline:number; paused:boolean; cards?:string[]; cells?:string[]; count?:number; source?:number }
export interface Attack { actor:number; card:string; targets:number[]; cancelled:number[]; elbows:number[] }
export interface Task { kind:'turn-start'|'action'|'end-draw'|'discard'|'next'|'response'|'resolve'|'cleanup'|'after-env'|'trigger'; actor?:number; trigger?:ChoiceKind; source?:number }
export interface Ranking { label:string; players:number[]; rank:number; alive:number; hp:number; maxHp:number; kills:number; damage:number }
export interface Result { reason:'natural'|'round-limit'|'draw'; winners:number[]; ranking:Ranking[] }
export interface GameState {
 version:'web-v0.1.1'|'web-v0.1.2'; revision:number; time:number; mode:Mode; players:Player[]; order:number[]; cursor:number; active:number; round:number;
 phase:'action'|'moving'|'choice'|'resolving'|'over'; deck:string[]; discard:string[]; resolving:string[];
 random:RandomState; queue:Task[]; choice:Choice|null; choiceSerial:number; attack:Attack|null;
 movement:{remaining:number; lastEmpty:string; origin:string; path:string[]; costDue?:boolean}|null;
 safe:string[]; bomb:string|null; forecast:{round:number; safe:string[]; bomb:string|null}|null;
 clock:{remaining:number; since:number|null}; events:Event[]; eventSerial:number; batch:number; reshuffleCount:number;
 seen:string[]; result:Result|null;
}
export type Command = { id:string; revision:number; actor:number } & (
 {type:'play';card:string;targets:number[]}|{type:'move'}|{type:'step';path:string[]}|{type:'stop'}|{type:'end'}|
 {type:'choose';choice:number;accept?:boolean;card?:string|null;cell?:string|null;cards?:string[]}|{type:'tick'}
);
export interface DispatchResult { state:GameState; ok:boolean; error?:string }
