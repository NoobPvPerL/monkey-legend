import {hasP3Characters,neighboringForVersion,mapForVersion,runtimeForVersion} from '../../game-data/src/index';
import type {GameState} from './types';
import type {EquipmentSource} from './stage3-resources';
import {roleEffectAllowed,modifiedByRole} from './character-effects';
import {onBoard} from './stage4-board';

export function monkeyEightEffect(s:{version?:string;players:{character:string}[]},actor:number,card:string,effect:EquipmentSource):EquipmentSource {
 const id=card.split('#')[0];
 if(!hasP3Characters(s.version)||s.players[actor].character!=='character-013'||!runtimeForVersion(s.version!).cardTags[id]?.includes('外星')||!(runtimeForVersion(s.version!).cards[id as keyof ReturnType<typeof runtimeForVersion>['cards']].type==='attack'||id==='basic-048'))return effect;
 return {...modifiedByRole(effect,{actor,kind:'damage'}),faction:effect.faction};
}
export interface P3Hit {target:number;source:number|null;amount:number;category:string;extra?:boolean;reflected?:boolean;originCard?:string}
export function prepareP3Hit<T extends P3Hit>(s:GameState,h:T,environment:boolean,emit:(s:GameState,type:string,text:string)=>void):T|null {
 if(!hasP3Characters(s.version)||environment||h.amount<=0||h.source===null||s.players[h.source].character!=='character-013')return h;
 const pending=s.cardStack?.stack.at(-1),card=h.originCard??(pending?.actor===h.source&&h.category==='attack'&&!h.extra&&!h.reflected?pending.definition:undefined);
 if(!card||!runtimeForVersion(s.version).cardTags[card.split('#')[0]]?.includes('外星'))return h;
 if(!roleEffectAllowed({origin:'card',actor:h.source,roleModifiers:[{actor:h.source,kind:'damage'}]},s.players[h.target]))return null;
 emit(s,'skill',`S${h.source+1} 武士刀：外星伤害+1`);return {...h,amount:h.amount+1};
}
export function mayiTargets(s:GameState,actor:number):number[]{
 if(!hasP3Characters(s.version)||s.players[actor]?.character!=='character-025'||!onBoard(s,actor))return [];
 const region=mapForVersion(s.version).map[s.players[actor].cell].region;
 return s.players.filter(p=>onBoard(s,p.seat)&&(p.seat===actor||s.mode==='team'&&p.team===s.players[actor].team)&&roleEffectAllowed({origin:'role-active',actor,roleModifiers:[]},p)&&
  (mapForVersion(s.version).map[p.cell].region===region||neighboringForVersion(s.version,region,mapForVersion(s.version).map[p.cell].region))).map(p=>p.seat);
}
