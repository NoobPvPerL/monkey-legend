import {gEnabled,gState} from './p3-g-state';
import {runtimeForVersion} from '../../game-data/src/index';
import type {GameState,Task,Command} from './types';
import type {Stage3Ports} from './stage3-engine';
import {onBoard} from './stage4-board';

/** Reserve after the new poison regions are known. Off-map living observers still act. */
export function gReserveForecast(s:GameState,pick:()=>string[]):void {
 if(!gEnabled(s.version))return;
 gState(s).forecast=s.players.some(q=>q.character==='character-012'&&q.hp>0)?{round:s.round,regions:pick()}:null;
}
export function gBombs(s:GameState):string[]|null {
 if(!gEnabled(s.version))return null;const forecast=gState(s).forecast;
 return forecast?.round===s.round?[...forecast.regions]:null;
}
export function gPublicState(s:GameState,viewer:number){
 const g=gState(s),allowed=viewer===-1||s.players[viewer]?.character==='character-012';
 return {programUsed:g.programUsed,counterUsed:g.counterUsed,invisible:g.invisible,face:g.face,marks:g.marks,
  gearBreadReadyAt:g.gearBreadReadyAt,gearTerrain:g.gearTerrain,...(allowed?{forecast:g.forecast}:{})};
}
/** Only card targeting is restricted; skills, equipment and environment use their existing rules. */
export function gCardTargetAllowed(s:{version?:string;stage3?:{g?:{invisible:boolean[]}}},a:number,target:number,definition:string):boolean {
 return !gEnabled(s.version)||a===target||!s.stage3?.g?.invisible[target]||Boolean(runtimeForVersion(s.version!).cards[definition as keyof ReturnType<typeof runtimeForVersion>['cards']]?.group);
}
export function gEndTasks(s:GameState):Task[]{
 return gEnabled(s.version)&&onBoard(s,s.active)&&s.players[s.active].character==='character-012'?[{kind:'stage3',action:'g-invisible',actor:s.active}]:[];
}
export function gObserverTask(s:GameState,t:Task,now:number,p:Stage3Ports):boolean {
 if(!gEnabled(s.version)||t.action!=='g-invisible')return false;const a=t.actor!,g=gState(s);
 if(onBoard(s,a)&&s.players[a].character==='character-012'&&g.invisEndTurn[a]!==s.stage3!.turn){g.invisEndTurn[a]=s.stage3!.turn;p.select(s,'g-invisible',a,now);}return true;
}
export function gObserverChoose(s:GameState,cmd:Extract<Command,{type:'choose'}>,now:number,p:Stage3Ports,timeout:boolean):boolean {
 if(!gEnabled(s.version)||s.choice?.kind!=='g-invisible')return false;const a=s.choice.actor;
 if(!timeout&&cmd.accept&&onBoard(s,a)&&s.players[a].character==='character-012'){
  const roll=p.die(s,'隐身',a);if(roll>=4)gState(s).invisible[a]=true;
  p.emit(s,'skill',`S${a+1} 隐身${roll>=4?'成功，至自己下次个人开始':'判定未生效'}`);
 }return true;
}
