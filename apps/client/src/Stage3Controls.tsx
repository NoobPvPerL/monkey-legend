import CardEffectSummary from './CardEffectSummary';
import {cardForVersion,definitionId} from '../../../packages/game-data/src/index';
import type {Intent,OnlineGame} from '../../../packages/online/src/protocol';
import type {Direction} from '../../../packages/game-core/src/stage3-roles';
import {actionBlockReason,playBlockReason} from './interaction-guards';
export interface Stage3ControlProps {
 game:OnlineGame;seat:number;busy:boolean;now:number;selected:string|null;targets:number[];
 asElbow:boolean;setAsElbow:(v:boolean)=>void;replacement:string;setReplacement:(v:string)=>void;
 direction:Direction|'';setDirection:(v:Direction|'')=>void;breadMode:boolean;setBreadMode:(v:boolean)=>void;
 setTargets:(v:number[])=>void;discard:string[];send:(intent:Intent)=>void;
 locationMode:'ship'|'commute'|null;setLocationMode:(v:'ship'|'commute'|null)=>void;
}
export default function Stage3Controls(props:Stage3ControlProps){
 const {game,seat,busy,now,selected,targets,asElbow,setAsElbow,replacement,setReplacement,direction,setDirection,breadMode,setBreadMode,setTargets,discard,send,locationMode,setLocationMode}=props;
 const me=game.players[seat],c=game.choice,actions=game.actions.stage3,blocked=actionBlockReason(game,seat,busy,now)!==null;
 if(!actions)return <p>正在同步角色操作…</p>;
 const pick=(extra:Omit<Extract<Intent,{type:'choose'}>,'type'|'choice'>)=>{if(c)send({type:'choose',choice:c.id,...extra});};
 if((c?.actor??game.active)!==seat||me.hp===0)return <span className="waiting-action">可左右滑动手牌，点击查看牌面与角色。</span>;
 if(c){
  if(['discard','water-discard','xiao-overflow'].includes(c.kind))return <button className="primary" disabled={blocked||discard.length!==c.count} onClick={()=>pick({cards:discard})}>{c.kind==='xiao-overflow'?'确认转交':'确认弃置'} {discard.length}/{c.count}</button>;
  if(c.kind==='response')return <button disabled={blocked} onClick={()=>pick({card:null})}>不响应</button>;
  if(c.kind==='east-start')return <><span>先选一名高亮玩家</span><button disabled={blocked||targets.length!==1} onClick={()=>pick({action:'draw',target:targets[0]})}>双方各摸1张</button><button disabled={blocked||targets.length!==1||game.players[targets[0]].handCount===0} onClick={()=>pick({action:'steal',target:targets[0]})}>随机拿对方1张</button><button disabled={blocked} onClick={()=>pick({})}>放弃</button></>;
  if(c.kind==='xie-ledger')return <><button className="primary" disabled={blocked||targets.length!==1} onClick={()=>pick({target:targets[0]})}>对所选角色造成1伤</button><button disabled={blocked} onClick={()=>pick({})}>放弃</button></>;
  if(c.kind==='west-carry')return <><span>{targets.length?'在棋盘选择同行落点；与西帝汶分占相邻空格':'先点同行玩家的“选择目标”，再点棋盘高亮空格；免疫角色不可选'}</span><button disabled={blocked} onClick={()=>pick({})}>不带人</button></>;
  if(c.kind==='elbow-push')return <><span>点击高亮空格确定撞飞方向</span><button disabled={blocked||!c.cells?.length} onClick={()=>pick({cell:c.cells![0]})}>使用首个合法方向</button></>;
  if(c.kind==='teleport'||c.kind==='equipment-loss'&&Boolean(c.cells))return <><span>点击高亮空格传送</span><button disabled={blocked} onClick={()=>pick({cell:null})}>放弃传送</button></>;
  if(c.kind==='revival-confirm'){
   const data=c.data as {card:string;cost:number},actual=actions.cards[data.card]?.cost??data.cost;
   return <><span>费用已锁定：d6={data.cost} · 实付 {actual} AP</span><button className="primary" disabled={blocked||me.ap<actual} onClick={()=>pick({accept:true})}>支付并复活 S{(c.source??0)+1}</button><button disabled={blocked} onClick={()=>pick({accept:false})}>取消 · 不重掷</button></>;
  }
  return <><button disabled={blocked} onClick={()=>pick({accept:false})}>放弃</button><button className="primary" disabled={blocked} onClick={()=>pick({accept:true})}>{c.kind==='easy'?'付1 AP · 反制':c.kind==='qb-pursuit'?'免费发动纯菜':c.kind==='equipment-loss'?'回复2生命':'确认发动'}</button></>;
 }
 if(game.phase==='moving')return <>{me.character==='character-040'&&<span>拖泥带水在整段移动结束后选择同行者；可提前点“结束移动”，不会因未走完步数失效。</span>}<button className="primary" disabled={blocked} onClick={()=>send({type:'stop'})}>{(game.movement?.path.length??1)>1?`结束移动 · 扣${game.movement?.costDue?1:0} AP`:'取消移动 · 不扣AP'}</button><button disabled={blocked} onClick={()=>send({type:'end'})}>结束行动</button></>;
 const d=selected?cardForVersion(definitionId(selected),game.version):null,info=selected?actions.cards[selected]:null;
 const elbow=me.character==='character-023'&&(asElbow||d?.id==='basic-002'),pushes=elbow&&targets.length===1?actions.elbowPush[targets[0]]:undefined;
 const playReason=selected?playBlockReason(game,seat,selected,targets,busy,now,{...(asElbow?{as:'elbow'}:{}),...(replacement?{replacement}:{}),...(elbow&&direction?{direction}:{})}):null;
 return <>
  {actions.directionRequired&&<span>拖泥带水：起步时正交相邻的合法角色，可在结束移动后带至终点邻接空格。</span>}{actions.directionRequired&&<label className="stage3-direction">移动方向 <select aria-label="西帝汶声明移动方向" value={direction} disabled={blocked} onChange={e=>setDirection(e.target.value as Direction|'')}><option value="">请选择</option><option value="up">上 ↑</option><option value="right">右 →</option><option value="down">下 ↓</option><option value="left">左 ←</option></select></label>}
  <button disabled={blocked||me.moved||actions.movementBlocked||me.ap<actions.moveCost||actions.directionRequired&&!direction} onClick={()=>send({type:'move',...(direction?{direction}:{})})}>移动 · {actions.moveCost===0?'免费':`结束扣${actions.moveCost} AP`}{actions.basicMovesRemaining>1?` · 余${actions.basicMovesRemaining}次`:''}</button>
  {actions.movementBlocked&&<span>小白马限制主动位移</span>}
  {locationMode?<button onClick={()=>setLocationMode(null)}>取消地点传送</button>:<>{actions.locations.ship.length>0&&<button disabled={blocked} onClick={()=>{setBreadMode(false);setLocationMode('ship');}}>飞船传送 · 免费</button>}{actions.locations.commute.length>0&&<button disabled={blocked} onClick={()=>{setBreadMode(false);setLocationMode('commute');}}>通校 · 耗尽AP</button>}</>}
  {me.character==='character-003'&&<button className="character-skill-button" disabled={blocked||!actions.jj} onClick={()=>send({type:'skill',kind:'jj'})}>{actions.jj?'懒得喷 · 0 AP':'懒得喷 · 本回合已发动'}</button>}
  {actions.breadTargets.length>0&&<button className="character-skill-button" aria-pressed={breadMode} disabled={blocked} onClick={()=>{setBreadMode(!breadMode);setTargets([]);setLocationMode(null);}}>面包黏稠 · {game.stage3?.jjFree[seat]?0:2} AP</button>}
  {breadMode?<><button className="primary" disabled={blocked||targets.length!==1||me.ap<(game.stage3?.jjFree[seat]?0:2)} onClick={()=>send({type:'skill',kind:'bread',target:targets[0]})}>令所选角色下次不能出牌</button><button onClick={()=>{setBreadMode(false);setTargets([]);}}>取消技能</button></>:d&&selected&&info&&<>
   <CardEffectSummary game={game} seat={seat} card={selected} asElbow={asElbow}/>
   {me.character==='character-023'&&d.id!=='basic-002'&&<button aria-pressed={asElbow} disabled={blocked} onClick={()=>{setAsElbow(!asElbow);setTargets([]);setReplacement('');setDirection('');}}>{asElbow?'恢复原牌用法':'当作肘击 · 总价2 AP'}</button>}
   {pushes&&(Object.keys(pushes).length?<label className="stage3-direction">撞飞方向 <select aria-label="牢大撞飞方向" value={direction} disabled={blocked} onChange={e=>setDirection(e.target.value as Direction|'')}><option value="">请选择</option>{Object.entries(pushes).map(([key,cell])=><option key={key} value={key}>{{up:'上 ↑',right:'右 →',down:'下 ↓',left:'左 ←'}[key]} · {cell}</option>)}</select></label>:<span>无合法撞飞落点，本次只造成伤害</span>)}
   {!asElbow&&info.equipment?.required&&<label className="stage3-replacement">替换装备 <select value={replacement} onChange={e=>setReplacement(e.target.value)} disabled={blocked}><option value="">请选择</option>{info.equipment.cards.map(card=><option key={card} value={card}>{cardForVersion(definitionId(card),game.version).name}</option>)}</select></label>}
   {!asElbow&&info.needsQuote?<button className="primary" disabled={blocked||targets.length!==1} onClick={()=>send({type:'skill',kind:'revival-quote',card:selected,target:targets[0]})}>掷骰锁定复活费用</button>:<button className="primary" title={playReason??'确认出牌'} aria-describedby="action-context" disabled={Boolean(playReason)} onClick={()=>send({type:'play',card:selected,targets,...(asElbow?{as:'elbow' as const}:{}),...(replacement?{replacement}:{}),...(elbow&&direction?{direction}:{})})}>{asElbow?'确认转换肘击':'确认出牌'}{targets.length?` · ${targets.map(t=>`S${t+1}`).join('、')}`:''}</button>}
  </>}
  <button disabled={blocked} onClick={()=>send({type:'end'})}>结束行动 →</button>
 </>;
}
