import type {GameState} from './types';
import {refreshSharedEquipment} from './stage3-resources';
import type {ResourceState} from './stage3-resources';
export function changeStage4Faction(s:GameState,target:number,kind:'monkey'|'dimon'|null):void {
 if(!s.stage4||!s.players[target]||s.players[target].hp<=0)throw Error('阵营变更目标无效');
 const p=s.players[target],r=s.stage4;r.conversion[target]=kind;
 p.faction=kind===null?r.baseFactions[target]:kind==='monkey'?'机械猴子':'帝汶家族';
 if(s.mode==='team')p.team=kind===null?r.baseTeams[target]:kind==='monkey'?'A':'B';
 if(s.stage3)refreshSharedEquipment(s as GameState&ResourceState);
}
