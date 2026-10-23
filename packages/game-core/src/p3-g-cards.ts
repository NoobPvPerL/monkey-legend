import {hActiveAllowed} from './p3-h-active';
import {gEnabled} from './p3-g-state';
import type {ResourceState,EquipmentSource} from './stage3-resources';
import type {PendingCard} from './stage3-card-stack';
import type {GameState} from './types';
import {runtimeForVersion} from '../../game-data/src/index';
export const gPrime=(s:Pick<ResourceState,'version'|'players'|'mode'|'stage4'>,a:number)=>gEnabled(s.version)&&s.players[a]?.character==='character-021';
export const gPrimeActive=(s:Pick<ResourceState,'version'|'players'|'mode'|'stage4'>,a:number)=>gPrime(s,a)&&hActiveAllowed(s,a);
export function gFreeQuote<T extends {cost:number;effect:EquipmentSource}>(s:Pick<ResourceState,'version'|'players'|'mode'|'stage4'>,a:number,definition:string,quote:T,variable=false):T {
 if(!gEnabled(s.version)||variable||quote.cost<=0)return quote;const role=s.players[a].character,tags=runtimeForVersion(s.version!).cardTags[definition]??[],type=runtimeForVersion(s.version!).cards[definition as import('../../game-data/src/index').CardId]?.type;
 if(!(role==='character-022'&&tags.includes('建民')||role==='character-033'&&tags.includes('外星')||role==='character-049'&&type==='food'))return quote;
 return {...quote,cost:0,effect:{...quote.effect,roleModifiers:[...quote.effect.roleModifiers,{actor:a,kind:'cost'}]}};
}
/** Apply after every ordinary discount/temporary free response, exactly once. */
export function gPrimeQuote<T extends {cost:number;effect:EquipmentSource;gPrimeQuoted?:true}>(s:Pick<ResourceState,'version'|'players'|'mode'|'stage4'>,a:number,quote:T):T&{gPrimeQuoted?:true} {
 // The quote flag never enters effect provenance, which can outlive this card in a buff or equipment.
 if(!gPrimeActive(s,a)||quote.gPrimeQuoted)return quote;
 return {...quote,gPrimeQuoted:true,cost:quote.cost+1,effect:{...quote.effect,roleModifiers:[...quote.effect.roleModifiers,{actor:a,kind:'active'}]}};
}
export interface GLogicalCard {copy:1|2;targets:number[];replacements?:string[];firstSucceeded?:boolean}
export function gLogical(s:ResourceState,a:number,targets:number[],copy:1|2=1):GLogicalCard|undefined{return gPrime(s,a)&&(copy===2||hActiveAllowed(s,a))?{copy,targets:[...targets]}:undefined;}
export function gSecondPending(s:GameState,first:PendingCard,begin:(targets:number[],copy:2)=>PendingCard,legal:(target:number)=>boolean):PendingCard {
 const second=begin(first.g!.targets.filter(legal),2);
 if(first.g!.replacements)second.g!.replacements=[...first.g!.replacements];
 if(first.definition==='basic-017'&&!first.countered)second.g!.firstSucceeded=true;
 second.effect=structuredClone(first.effect);second.converted=first.converted;second.pushDirection=first.pushDirection;
 if(first.replacement)second.replacement=first.replacement;
 if(first.stage4){const {counterEffective,counterOffered,guessDie,officeExempt,...intent}=first.stage4;second.stage4=structuredClone(intent);}
 return second;
}
