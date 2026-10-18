import {isClassicVersion,mapForVersion,sourceCatalogForVersion,characterTraitsForVersion,classicLocationPolicy} from '../../game-data/src/index';
export interface LocationPlayer {character:string;cell:string;ap:number;hp:number;maxHp:number}
const policy=classicLocationPolicy();
export function regionAt(version:string,cell:string):string {const found=mapForVersion(version).map[cell];if(!found)throw Error('位置无效');return found.region;}
export function basicMoveCost(version:string,origin:string):number {return isClassicVersion(version)&&regionAt(version,origin)==='操场'?policy.playground.moveCost:1;}
export function normalDrawCount(version:string,cell:string,round:number):number {
 if(round===1)return 0;return 2+(isClassicVersion(version)&&regionAt(version,cell)==='高唐农场'?policy.farm.normalDrawBonus:0);
}
export function personalStartAp(version:string,p:LocationPlayer,round:number):number {
 let ap=p.character==='character-031'&&p.ap<6?6:p.ap;
 if(isClassicVersion(version)&&round>1&&regionAt(version,p.cell)==='尚德荟')ap+=policy.campus.apBonus;return ap;
}
export function foodHealing(version:string,p:LocationPlayer,base:number):number {
 if(p.hp<=0||p.character==='character-027')return 0;
 return Math.min(Math.max(0,p.maxHp-p.hp),base+(isClassicVersion(version)&&regionAt(version,p.cell)==='XDF'?policy.xdf.foodHealBonus:0));
}
export function locationCardAllowed(version:string,cell:string,card:string):boolean {
 if(!isClassicVersion(version))return true;
 const prohibited:Record<string,readonly string[]>=classicLocationPolicy(version).prohibitedCards;return !(prohibited[regionAt(version,cell)]??[]).includes(card.split('#')[0]);
}
export function locationEffectAllowed(version:string,cell:string,card:string):boolean {
 if(!isClassicVersion(version)||regionAt(version,cell)!=='办公室')return true;
 const definition=sourceCatalogForVersion(version).cards[card.split('#')[0]];if(!definition)throw Error('卡牌未在此版本目录');return !definition.tags.includes(policy.officeImmuneTag);
}
export function stopsWalking(version:string,cell:string):boolean {return isClassicVersion(version)&&regionAt(version,cell)==='山洞';}
export function canWalkThrough(version:string,cell:string,occupied:boolean):boolean {return !occupied||!stopsWalking(version,cell);}
export interface LocationActionState {version:string;round:number;phase:string;choice:unknown;active:number;players:LocationPlayer[];shipUsed:number[];farmClosed:boolean}
export function locationDestinations(s:LocationActionState,actor:number,kind:'ship'|'commute'):string[]{
 if(!isClassicVersion(s.version)||s.phase!=='action'||s.choice||s.active!==actor)return [];
 const p=s.players[actor];if(!p||p.hp<=0||p.ap<1)return [];
 if(kind==='ship'&&(regionAt(s.version,p.cell)!=='飞船'||s.shipUsed.includes(actor)))return [];
 return mapForVersion(s.version).cells.filter(cell=>
  (kind!=='commute'||cell.region==='云上学府')&&(!s.farmClosed||cell.region!=='高唐农场')&&
  !s.players.some(other=>other.hp>0&&other.cell===cell.id)).map(cell=>cell.id);
}
export function isWaterNative(version:string,character:string):boolean {return characterTraitsForVersion(version,character).waterNative;}
// Pure reference effect, invoked inside the authority's command transaction.
// The caller must resolve arrival water effects before allowing another action.
export function applyLocationTeleport(previous:LocationActionState,actor:number,kind:'ship'|'commute',cell:string){
 if(!locationDestinations(previous,actor,kind).includes(cell))throw Error('地点传送当前不可用或落点不合法');
 const state=structuredClone(previous),p=state.players[actor];
 if(kind==='ship')state.shipUsed.push(actor);else p.ap=0;
 p.cell=cell;
 return {state,arrival:{actor,cell,kind,water:mapForVersion(state.version).map[cell].terrain==='water'}};
}
