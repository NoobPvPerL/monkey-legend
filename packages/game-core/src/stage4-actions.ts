import {hEquipmentWatch} from './p3-h-equipment';
import {dPay} from './p3-d';
import {gEnabled,gState} from './p3-g-state';
import type {GameState,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
import type {ResourceState} from './stage3-resources';
import * as resources from './stage3-resources';
import {boardEmptyEntry,onBoard} from './stage4-board';
import {combatGear,combatGears} from './stage4-combat';
import {terrainMoveCost} from './stage4-terrain';
import {basicMoveCost} from './locations';
type State=GameState&ResourceState&{stage4:NonNullable<GameState['stage4']>};
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
export function stage4EquipmentSkill(s:GameState,cmd:Extract<Command,{type:'skill'}>,now:number,p:Stage3Ports):boolean {
 const st=s as State,a=cmd.actor,user=s.players[a];
 if(cmd.kind==='terrain'){const cards=combatGears(s,a,'basic-069');need(onBoard(s,a)&&cards.length&&typeof cmd.accept==='boolean'&&(!gEnabled(s.version)||!cmd.card||cards.includes(cmd.card)),'唐车设置不可用或选项无效');if(gEnabled(s.version)){for(const card of cmd.card?[cmd.card]:cards)gState(s).gearTerrain[card]=cmd.accept!;st.stage4.terrainIgnore[a]=cards.some(card=>gState(s).gearTerrain[card]);}else st.stage4.terrainIgnore[a]=cmd.accept!;resources.refreshSharedEquipment(st);p.emit(s,'terrain',`S${a+1} 唐车${cmd.accept?'忽略':'恢复'}地点效果`);return true;}
 if(!['watch','flight','gift'].includes(cmd.kind))return false;
 need(cmd.kind==='gift'||!resources.mountMovementBlocked(st,a),'当前不能主动位移或发动该坐骑');
 if(cmd.kind==='watch'){
  const card=gEnabled(s.version)?combatGears(s,a,'basic-060').find(c=>(!cmd.card||cmd.card===c)&&hEquipmentWatch(s,a,c)?.previous&&hEquipmentWatch(s,a,c)!.usedTurn!==st.stage3.turn&&hEquipmentWatch(s,a,c)!.previous!==user.cell&&boardEmptyEntry(st,a,hEquipmentWatch(s,a,c)!.previous!,[a])):combatGear(s,a,'basic-060'),watch=card?hEquipmentWatch(s,a,card):null;
  need(card&&watch?.previous&&watch.usedTurn!==st.stage3.turn,'手表尚无上一开始格或本回合已使用');
  need(boardEmptyEntry(st,a,watch!.previous!,[a])&&watch!.previous!==user.cell,'手表原格当前不可进入');
  st.stage4.watches[card!].usedTurn=st.stage3.turn;s.queue.push(...p.relocate(s,a,watch!.previous!,true));p.emit(s,'skill',`S${a+1} 手表回到上次个人开始格`);return true;
 }
 if(cmd.kind==='flight'){
  need(combatGear(s,a,'basic-074')&&!user.moved,'子腾未装备或基础移动次数已用');
  need(cmd.cell&&cmd.cell!==user.cell&&boardEmptyEntry(st,a,cmd.cell,[a]),'请选择合法传送空格');
  const normal=resources.fixedApCost(st,a,terrainMoveCost(s,a)),cost=normal+1;need(user.ap>=cost,`子腾需要${cost}AP`);
  dPay(s,a,cost);st.stage3.basicUsed[a]++;user.moved=st.stage3.basicUsed[a]>=resources.basicMoveAllowance(st,a);
  s.queue.push(...p.relocate(s,a,cmd.cell!,true));p.emit(s,'cost',`S${a+1} 子腾传送支付${cost}AP，不掷移动骰`);return true;
 }
 need(combatGear(s,a,'basic-075'),'未装备快速车');const target=cmd.target!,cards=cmd.cards??[];
 need(target!==a&&onBoard(s,target)&&cards.length>0&&new Set(cards).size===cards.length&&cards.every(c=>user.hand.includes(c)),'送牌对象或实体手牌不合法');
 user.hand=user.hand.filter(c=>!cards.includes(c));s.players[target].hand.push(...cards);p.emit(s,'transfer',`S${a+1} 快速车送S${target+1} ${cards.length}张手牌`);return true;
}
