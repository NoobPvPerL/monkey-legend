import {useState} from 'react';
import {CHARACTERS} from '../../../packages/game-data/src/index';
import type {OnlineGame} from '../../../packages/online/src/protocol';

// Only transform known engine phrases; preserve unrecognized and original text.
export function compactLine(text:string):string {
 const play=text.match(/^S([1-4])\s.*? 使用(.+?)，支付(\d+)AP(?:，目标(.*))?$/);
 if(play){const targets=[...(play[4]??'').matchAll(/S([1-4])(?:\s|$)/g)].map(match=>'S'+match[1]);return `S${play[1]} [−${play[3]} AP] ─${play[2]}→ ${targets.length?targets.join('、'):'自己'}`;}
 const damage=text.match(/^S([1-4])\s.*? (环境|普通)伤害(\d+)，护盾抵挡(\d+)，实际失血(\d+)$/);
 if(damage)return `${damage[2]==='环境'?'⚠ 环境 → ':''}S${damage[1]} ${Number(damage[5])?`[♥ −${damage[5]}]`:'[♥ 不变]'}${Number(damage[4])?` [◇ 抵挡${damage[4]}]`:''}`;
 const head=text.match(/^S([1-4])\s.*? 头锤：从S([1-4])\s.*?吸收全部(\d+)AP（目标AP (\d+)→0）$/);
 if(head)return `S${head[1]} [AP +${head[3]}] ←头锤─ S${head[2]} [AP ${head[4]}→0]`;
 const response=text.match(/^S([1-4])\s.*? 使用(防御姿态|肘击)，支付(\d+)AP/);
 if(response)return `S${response[1]} [−${response[3]} AP] ${response[2]==='肘击'?'↩':'⛨'} ${response[2]} [取消来袭效果]`;
 const heal=text.match(/^S([1-4])\s.*? 回复(\d+)生命$/);if(heal)return `S${heal[1]} [♥ +${heal[2]}]`;
 const ap=text.match(/^S([1-4])\s.*? 被扣(\d+)AP → (\d+)$/);if(ap)return `S${ap[1]} [AP −${ap[2]} → ${ap[3]}]`;
 let short=text;for(const character of Object.values(CHARACTERS))short=short.replaceAll(' '+character.name+' ',' ');
 return short.replace(/S([1-4]) 淘汰（批次\d+）/g,'S$1 [淘汰]').replace(/(.+) 未命中$/,'$1 → ✕ 未命中');
}
export default function CompactText({text}:{text:string}){
 return <span className="compact-event" title={text} aria-label={text}>{text.split('\n').map((line,index)=><span className="compact-event-line" key={index}>{compactLine(line).split(/(S[1-4](?!\d)|\[[^\]]+\])/g).filter(Boolean).map((part,i)=><span key={i} className={/^S[1-4]$/.test(part)?`event-seat seat-${Number(part[1])-1}`:part.startsWith('[')?'event-effect':undefined}>{part}</span>)}</span>)}</span>;
}
export function PublicLog({events,fullText}:{events:OnlineGame['events'];fullText?:(text:string)=>string}){
 const [full,setFull]=useState(false);
 return <><button aria-pressed={full} onClick={()=>setFull(!full)}>{full?'切换简洁提示':'显示完整描述'}</button><div className="compact-log">{[...events].reverse().map(event=><p key={event.seq}><span>#{event.seq}</span> {full?(fullText?.(event.text)??event.text):<CompactText text={event.text}/>}</p>)}</div></>;
}
