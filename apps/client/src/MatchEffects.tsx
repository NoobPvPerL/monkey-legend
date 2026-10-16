import {useEffect,useRef,useState} from 'react';
import {CHARACTERS} from '../../../packages/game-data/src/index';
import type {RoomSnapshot} from '../../../packages/online/src/protocol';

type DiceEvent={seq:number;text:string;roll:number};
export default function MatchEffects({room,dealMatchId,enabled}:{room:RoomSnapshot;dealMatchId:string|null;enabled:boolean}) {
 const game=room.game!;
 const cursor=useRef<{matchId:string|null;epoch:number;seq:number}|null>(null),dealt=useRef<string|null>(null);
 const [queue,setQueue]=useState<DiceEvent[]>([]),[deal,setDeal]=useState(false);
 useEffect(()=>{
  const last=cursor.current,seq=game.events.at(-1)?.seq??0,same=last?.matchId===room.matchId&&last.epoch===room.epoch;
  if(enabled&&same){const dice=game.events.filter(e=>e.seq>last.seq&&e.type==='dice'&&Number.isInteger(e.roll)&&e.roll!>=1&&e.roll!<=6) as DiceEvent[];if(dice.length)setQueue(old=>[...old,...dice].slice(-3));}
  else setQueue([]);
  cursor.current={matchId:room.matchId,epoch:room.epoch,seq};
  if(dealMatchId===room.matchId&&dealt.current!==room.matchId){dealt.current=room.matchId;if(enabled)setDeal(true);}
 },[room.matchId,room.epoch,game.revision,enabled,dealMatchId]);
 useEffect(()=>{if(!enabled){setQueue([]);setDeal(false);}},[enabled]);
 useEffect(()=>{if(!deal)return;const timer=setTimeout(()=>setDeal(false),1200);return()=>clearTimeout(timer);},[deal]);
 const dice=queue[0];
 useEffect(()=>{if(!dice)return;const timer=setTimeout(()=>setQueue(old=>old.slice(1)),800);return()=>clearTimeout(timer);},[dice?.seq,room.matchId]);
 return <div className="match-effects" aria-live="polite">
  {dice&&<div className="dice-effect" key={`${room.matchId}:${dice.seq}`}><strong className="dice-face" aria-label={`骰子结果${dice.roll}`}>{dice.roll}</strong><span>{dice.text}</span><button onClick={()=>setQueue(old=>old.slice(1))}>跳过</button></div>}
  {deal&&<div className="deal-effect"><strong>角色已分配 · 正在发牌</strong><div>{game.players.map((player,index)=><div className="deal-card" style={{animationDelay:`${index*100}ms`}} key={player.seat}><span>{room.members[player.seat]?.name}</span><b>{CHARACTERS[player.character].name}</b><small>手牌 {player.handCount} 张</small></div>)}</div><button onClick={()=>setDeal(false)}>跳过动画</button></div>}
 </div>;
}
