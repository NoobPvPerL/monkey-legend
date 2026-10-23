import {hActiveAllowed} from './p3-h-active';
import {gEnabled} from './p3-g-state';
import {onBoard,boardEmptyEntry} from './stage4-board';
import {roleEffectAllowed} from './character-effects';
import {dPay} from './p3-d';
import {DIRECTIONS,nextInDirection} from './stage3-roles';
import type {Direction} from './stage3-roles';
import type {GameState,Task} from './types';
import type {Stage3Ports} from './stage3-engine';
const need=(v:unknown,m:string):void=>{if(!v)throw Error(m);};
export function gDogTargets(s:GameState,a:number):number[]{
 if(!gEnabled(s.version)||!hActiveAllowed(s,a)||!onBoard(s,a)||s.players[a].character!=='character-022')return [];const east=s.players.find(q=>q.character==='character-010');
 return s.players.filter(q=>onBoard(s,q.seat)&&!(east&&(q.seat===east.seat||s.mode==='team'&&q.team===east.team))&&roleEffectAllowed({origin:'role-active',actor:a,roleModifiers:[]},q)).map(q=>q.seat);
}
export function gDog(s:GameState,a:number,target:number,direction:Direction|undefined,p:Stage3Ports){
 need(gEnabled(s.version)&&gDogTargets(s,a).includes(target),'狗头军师角色或目标不合法');need(direction&&DIRECTIONS.includes(direction),'请指定狗头军师正交方向');need(s.players[a].ap>=1,'狗头军师需要1AP');dPay(s,a,1);s.queue.push({kind:'stage3',action:'g-dog-move',actor:a,target,data:{direction}});p.emit(s,'skill',`S${a+1} 狗头军师支付1AP，推动S${target+1}`);
}
export function gSkillTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!gEnabled(s.version)||t.action!=='g-dog-move')return false;const a=t.actor!,target=t.target!,direction=(t.data as {direction:Direction}).direction;if(!gDogTargets(s,a).includes(target))return true;const cell=nextInDirection(s.players[target].cell,direction);
 if(cell&&boardEmptyEntry(s,target,cell,[target]))s.queue.unshift(...p.relocate(s,target,cell,false,false,false,{actor:a}));else p.emit(s,'move',`S${target+1} 狗头军师位移受阻，原地`);return true;
}
