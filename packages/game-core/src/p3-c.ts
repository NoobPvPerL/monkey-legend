import {hActiveAllowed} from './p3-h-active';
import {hasP3CRules,runtimeForVersion} from '../../game-data/src/index';
import {onBoard} from './stage4-board';
import type {ResourceState,EquipmentSource} from './stage3-resources';
import type {GameState} from './types';
import type {PendingCard,CardStackState} from './stage3-card-stack';
import type {Stage3Ports} from './stage3-engine';
export interface P3CState {feather:boolean[];blocked:boolean[];used:boolean[];sleep:boolean[]}
export const initialP3C=():P3CState=>({feather:[false,false,false,false],blocked:[false,false,false,false],used:[false,false,false,false],sleep:[false,false,false,false]});
export function cTurnStart(s:ResourceState,a:number){if(!hasP3CRules(s.version))return;const c=s.stage3.c??=initialP3C();c.feather[a]=false;c.blocked[a]=false;c.used[a]=false;}
export function cTurnEnd(s:ResourceState,a:number){if(!hasP3CRules(s.version))return;const c=s.stage3.c!;c.sleep[a]=hActiveAllowed(s,a)&&s.players[a].character==='character-047'&&onBoard(s,a)&&!c.used[a];c.feather[a]=false;}
export function cMarkCard(s:CardStackState,a:number){if(hasP3CRules(s.version)&&s.active===a&&s.players[a].character==='character-047')s.stage3.c!.used[a]=true;}
export function cMarkFood(s:GameState,c:PendingCard,targets:number[]){if(hasP3CRules(s.version)&&targets.length&&runtimeForVersion(s.version).cards[c.definition as keyof ReturnType<typeof runtimeForVersion>['cards']].type==='food')c.cFood=true;}
export function cFoodTasks(s:GameState,c:PendingCard){return hasP3CRules(s.version)&&c.cFood?s.order.filter(a=>s.players[a].character==='character-047'&&onBoard(s,a)).map(actor=>({kind:'stage3' as const,action:'primitive-food',actor})):[];}
export function cFoodTask(s:GameState,a:number,now:number,p:Stage3Ports){if(hasP3CRules(s.version)&&s.players[a].character==='character-047'&&onBoard(s,a))p.select(s,'primitive-food',a,now);}
export function featherActive(s:Pick<ResourceState,'version'|'stage3'|'players'>,a:number){return hasP3CRules(s.version)&&s.players[a].character==='character-046'&&s.stage3.c?.feather[a]===true;}
export function featherEffect(s:ResourceState,a:number,card:string,effect:EquipmentSource):EquipmentSource {
 return featherActive(s,a)&&runtimeForVersion(s.version!).cards[card.split('#')[0] as keyof ReturnType<typeof runtimeForVersion>['cards']].type==='attack'?{...effect,roleModifiers:[...effect.roleModifiers,{actor:a,kind:'active-range'}]}:effect;
}
