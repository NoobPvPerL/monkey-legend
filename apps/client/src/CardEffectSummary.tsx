import {useState} from 'react';
import {cardForVersion,definitionId} from '../../../packages/game-data/src/index';
import type {OnlineGame} from '../../../packages/online/src/protocol';
import {cardEffectDescription} from './card-effect-description';
import Dialog from './Dialog';

export default function CardEffectSummary({game,seat,card,asElbow=false,x=1}:{game:OnlineGame;seat:number;card:string;asElbow?:boolean;x?:number}){
 const [open,setOpen]=useState(false),effect=cardEffectDescription(game,seat,card,asElbow,x);
 const range=game.phase==='action'&&game.stage3?.c?.feather[seat]&&cardForVersion(definitionId(card),game.version).type==='attack'&&effect.name!=='肘击';
 const content=<><strong>{effect.name} · 本次{effect.cost}{effect.originalName?`（使用${effect.originalName}）`:''}</strong><p>{effect.text}</p>{range&&<p>手长：本次攻击牌不限距离；主动技能免疫与地点禁牌照常。</p>}</>;
 return <section className="card-effect-summary" aria-label="本次卡牌效果">
  <div className="card-effect-inline">{content}</div><button className="card-effect-open" onClick={()=>setOpen(true)}>牌效与费用</button>
  {open&&<Dialog title="本次卡牌效果" onClose={()=>setOpen(false)}>{content}<small>规则版本 {game.version}。以上为牌效说明；是否命中、反制及最终数值以实际结算为准，计时继续。</small></Dialog>}
 </section>;
}
