import {fixture} from './p3-fixture';
import {gDie,gNow} from '../../packages/game-core/src/p3-g-dice';
import {initialGState,gState} from '../../packages/game-core/src/p3-g-state';
import {integer} from '../../packages/game-core/src/random';
import type {GameState,Command,DispatchResult} from '../../packages/game-core/src/types';
import type {Stage3Ports} from '../../packages/game-core/src/stage3-engine';
export const ports={
 emit(s:GameState,type:string,text:string,data?:unknown){s.events.push({seq:++s.eventSerial,type,text,...(data===undefined?{}:{data})});},
 select(s:GameState,kind:any,actor:number,now:number,extra:any={}){
  if(s.clock.since!==null)s.clock.remaining=Math.max(0,s.clock.remaining-(now-s.clock.since));s.clock.since=null;
  s.phase='choice';s.choice={id:++s.choiceSerial,kind,actor,deadline:now+30000,paused:true,...extra};ports.emit(s,'choice',`S${actor+1} 等待选择：${kind}`);
 }
} as Stage3Ports;
export function setup(dice=[1,3,5,4]){
 const s=fixture('web-v0.1.17',['character-003','character-010','character-025','character-031']);
 s.version='web-v0.1.18' as any;s.players[0].character='character-042' as any;s.players[1].character='character-033' as any;
 s.stage3!.g=initialGState();s.random.dice=dice;s.random.seed=12345;return s;
}
export function die(s:GameState,owner:number|null,reason:string){const raw=s.random.dice.length?s.random.dice.shift()!:integer(s.random,6)+1;ports.emit(s,'dice',`${reason}：d6 = ${raw}`,raw);return gDie(s,reason,owner,raw,ports);}
export function driver(count=1):(s:GameState,cmd:Command,now:number)=>DispatchResult {
 return (s,cmd,now)=>{
  if(cmd.revision!==s.revision)return {state:s,ok:false,error:'stale driver'};
  s.players[0].ap-=2;const drawn=s.deck.splice(integer(s.random,s.deck.length),1)[0];s.players[0].hand.push(drawn);
  ports.emit(s,'play','已支付2AP并拿牌');
  for(let i=0;i<count;i++){const n=die(s,0,`目标骰${i}`);s.players[0].ap-=n;ports.emit(s,'skill',`最终${i}=${n}`);}
  s.players[0].shield=integer(s.random,50);s.choice=null;s.phase='action';s.clock.since=gNow(s,now);
  s.seen.push(cmd.id);s.revision++;s.time=now;return {state:s,ok:true};
 };
}
export const command=(s:GameState,body:Partial<Command>={},id='g-command')=>({id,revision:s.revision,actor:0,type:'move',...body}) as Command;
export const unusedInitial=()=>{throw Error('unexpected initial replay');};
export function clean(s:GameState){if('_gReplay' in s||s.random._gTrace||gState(s).dice)throw Error('G临时续接状态未清除');}
