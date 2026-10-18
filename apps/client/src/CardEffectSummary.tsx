import {useState} from 'react';
import type {OnlineGame} from '../../../packages/online/src/protocol';
import {cardEffectDescription} from './card-effect-description';
import Dialog from './Dialog';

export default function CardEffectSummary({game,seat,card,asElbow=false,x=1}:{game:OnlineGame;seat:number;card:string;asElbow?:boolean;x?:number}){
 const [open,setOpen]=useState(false),effect=cardEffectDescription(game,seat,card,asElbow,x);
 const content=<><strong>{effect.name} · 本次{effect.cost}{effect.originalName?`（使用${effect.originalName}）`:''}</strong><p>{effect.text}</p></>;
 return <section className="card-effect-summary" aria-label="本次卡牌效果">
  <div className="card-effect-inline">{content}</div><button className="card-effect-open" onClick={()=>setOpen(true)}>牌效与费用</button>
  {open&&<Dialog title="本次卡牌效果" onClose={()=>setOpen(false)}>{content}<small>规则版本 {game.version}。以上为牌效说明；是否命中、反制及最终数值以实际结算为准，计时继续。</small></Dialog>}
 </section>;
}
