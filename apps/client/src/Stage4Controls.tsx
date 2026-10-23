import {SharedEquipmentLine,equipmentSourceLabel} from './Stage3Status';
import CardEffectSummary from './CardEffectSummary';
import {hasPlaytestRules} from '../../../packages/game-data/src/index';
import {useEffect,useState} from 'react';
import {cardForVersion,definitionId,mapForVersion,runtimeForVersion} from '../../../packages/game-data/src/index';
import type {Intent} from '../../../packages/online/src/protocol';
import {anytimeReason,primeSkillActive} from './stage4-guards';
import {actionBlockReason,playBlockReason} from './interaction-guards';
import Stage3Controls from './Stage3Controls';
import type {Stage3ControlProps} from './Stage3Controls';
export type Stage4Mode='flight'|'gift'|null;
export interface Stage4ControlProps extends Stage3ControlProps {mode:Stage4Mode;setMode:(mode:Stage4Mode)=>void}
const directions:Record<string,string>={up:'上 ↑',right:'右 →',down:'下 ↓',left:'左 ←'};
export default function Stage4Controls(props:Stage4ControlProps){
 const {game,seat,busy,now,selected,targets,setTargets,asElbow,setAsElbow,replacement,setReplacement,direction,setDirection,discard,send,mode,setMode}=props;
 const [replacements,setReplacements]=useState<string[]>([]);
 useEffect(()=>setReplacements([]),[selected,game.stage3?.turn,asElbow]);
 const [region,setRegion]=useState(''),[x,setX]=useState(1),[take,setTake]=useState<'hand'|'equipment'>('hand'),[item,setItem]=useState(''),[copy,setCopy]=useState(''),[northGroup,setNorthGroup]=useState<'north'|'others'|''>('');
 useEffect(()=>{setRegion('');setX(1);setTake('hand');setItem('');setCopy('');setNorthGroup('');},[selected,game.stage3?.turn,game.choice?.id]);
 useEffect(()=>{const a=game.actions.stage4;if(!a)return;setRegion(v=>a.regions.includes(v)?v:'');setCopy(v=>a.copyMounts.some(g=>g.card===v)?v:'');setItem(v=>Object.hasOwn(a.stealEquipment[targets[0]]??{},v)?v:'');setX(v=>Math.max(1,Math.min(v,game.players[seat].ap)));const options=selected?.startsWith('basic-024#')&&take==='equipment'?a.stealEquipment[targets[0]]?.[item]:selected?a.cards[selected]?.equipment:null;if(options&&replacement&&!options.cards.includes(replacement))setReplacement('');},[game.revision]);
 const a=game.actions.stage4,c=game.choice,me=game.players[seat],blocked=actionBlockReason(game,seat,busy,now)!==null,anyBlocked=anytimeReason(game,seat,busy,now)!==null;
 if(!a)return <span>正在同步本版本操作…</span>;
 const choose=(extra:Omit<Extract<Intent,{type:'choose'}>,'type'|'choice'>)=>{if(c)send({type:'choose',choice:c.id,...extra});};
 const interrupt=me.hand?.find(card=>card.startsWith('basic-017#'));
 const common=<><SharedEquipmentLine game={game} seat={seat}/>{a.canInterrupt&&interrupt&&<button className="interrupt-action" disabled={anyBlocked} onClick={()=>send({type:'play',card:interrupt,targets:[]})}>插队 · {a.cards[interrupt]?.cost??0} AP</button>}{!a.equipmentSkills&&a.terrainSelectable&&<button aria-pressed={game.stage4?.terrainIgnore[seat]} disabled={anyBlocked} onClick={()=>send({type:'skill',kind:'terrain',accept:!game.stage4?.terrainIgnore[seat]})}>唐车 · {game.stage4?.terrainIgnore[seat]?'恢复地点效果':'忽略地点效果'}</button>}{a.equipmentSkills?.terrain.map((g,i)=><button key={g.card} aria-pressed={g.ignored} disabled={anyBlocked} onClick={()=>send({type:'skill',kind:'terrain',card:g.card,accept:!g.ignored})}>唐车{a.equipmentSkills!.terrain.length>1?` ${i+1}`:''}{equipmentSourceLabel(game,seat,g.card)} · {g.ignored?'恢复地点效果':'忽略地点效果'}</button>)}</>;
 if(c&&c.actor===seat){
  if(c.kind==='card-counter'){
   const eligible=selected&&c.cards?.includes(selected),info=eligible?a.cards[selected!]:null;
   return <>{common}{eligible&&<CardEffectSummary game={game} seat={seat} card={selected!}/>}<span>选择一张可用反制牌；每层10秒，报价不续时。</span>{info?.needsQuote?<button className="primary" disabled={blocked} onClick={()=>send({type:'skill',kind:'quote-cost',card:selected!})}>锁定反制牌费用 · {info.printedCost}</button>:<button className="primary" disabled={blocked||!eligible||info?.cost===null||me.ap<Math.max(0,info?.cost??0)} onClick={()=>choose({card:selected!})}>使用所选反制牌{info?` · ${info.cost} AP`:''}</button>}<button disabled={blocked} onClick={()=>choose({})}>不反制</button></>;
  }
  if(c.kind==='forced-card')return <>{common}<span>点击手牌上交，不发动牌效、不支付该牌费用。</span><button disabled={blocked} onClick={()=>choose({})}>不交牌 · 承受1伤</button></>;
  if(c.kind==='board-tax')return <>{common}<span>点击一张手牌上交{(c.data as {mode:string})?.mode==='desert'?'，或支付1AP':''}。</span>{(c.data as {mode:string})?.mode==='desert'&&<button disabled={blocked||me.ap<1} onClick={()=>choose({action:'ap'})}>支付1 AP</button>}</>;
  if(c.kind==='board-guess')return <>{common}<span>卫汶找你：猜1—6；猜错由出牌者选择传送落点</span>{[1,2,3,4,5,6].map(guess=><button key={guess} disabled={blocked} onClick={()=>choose({guess})}>{guess}</button>)}</>;
  if(c.kind==='board-path'||c.kind==='gear-push')return <>{common}<span>{c.kind==='board-path'?'选择移动路径':'选择推动对象与方向'}</span><div className="stage4-options">{Object.entries(c.options??{}).map(([option,cells])=><button key={option} disabled={blocked} onClick={()=>choose({option})}>{c.kind==='gear-push'?`S${Number(option.split(':')[0])+1} · ${directions[option.split(':')[1]]} → `:''}{cells.map(cell=>`${mapForVersion(game.version).map[cell].region} ${cell}`).join(' → ')}</button>)}</div>{c.kind==='gear-push'&&<button disabled={blocked} onClick={()=>choose({})}>不推动</button>}</>;
  if(['board-cell','board-return','native-shore','gear-plant','gear-react'].includes(c.kind))return <>{common}<span>{c.kind==='board-cell'?`卫汶找你：为S${(c.source??0)+1}选择落点。`:''}点击棋盘高亮空格{c.kind==='board-return'?'返回地图':c.kind==='native-shore'?'上岸':'确定落点'}。</span>{c.kind==='board-return'||c.kind==='native-shore'?<button disabled={blocked||!c.cells?.length} onClick={()=>choose({cell:c.cells![0]})}>选择首个合法格</button>:<button disabled={blocked} onClick={()=>choose({cell:null})}>放弃本次位移</button>}</>;
  if(c.kind==='gear-loss'){
   const definition=(c.data as {definition:string}).definition;
   return <>{common}<span>失去装备的效果</span>{definition==='basic-052'?<button className="primary" disabled={blocked||targets.length!==1} onClick={()=>choose({target:targets[0]})}>粉笔 · 对所选角色伤1</button>:definition==='basic-063'?<span>点击高亮空格前往山洞</span>:<button className="primary" disabled={blocked} onClick={()=>choose({accept:true})}>回复{definition==='basic-054'?2:1}生命</button>}<button disabled={blocked} onClick={()=>choose({})}>放弃失去效果</button></>;
  }
  if(['gear-cloak','gear-reflect','gear-chalk','gear-terrain'].includes(c.kind))return <>{common}<button className="primary" disabled={blocked||c.kind==='gear-chalk'&&me.ap<1} onClick={()=>choose({accept:true})}>{c.kind==='gear-cloak'?'斗篷 · 掷骰尝试抵挡':c.kind==='gear-reflect'?'正装 · 反伤1（耗1耐久）':c.kind==='gear-chalk'?'粉笔 · 付1AP追加1伤':'唐车 · 忽略本次地形'}</button><button disabled={blocked} onClick={()=>choose({accept:false})}>{c.kind==='gear-terrain'?'按地形效果执行':'放弃'}</button></>;
  return <>{common}<Stage3Controls {...props}/></>;
 }
 if((c?.actor??game.active)!==seat||me.hp===0)return <>{common}<span className="waiting-action">可查看战场、手牌与日志。</span></>;
 if(game.stage4?.offMap[seat])return <>{common}<span>已移出地图，下一次个人开始返回。</span><button disabled={blocked} onClick={()=>send({type:'end'})}>结束行动</button></>;
 if(game.phase==='moving')return <>{common}<Stage3Controls {...props}/></>;
 const d=selected?cardForVersion(definitionId(selected),game.version):null,info=selected?a.cards[selected]:null;
 const dodge=asElbow&&me.character==='character-029',elbow=asElbow&&!dodge||Boolean(info?.elbow),pushes=targets.length===1?(asElbow?game.actions.stage3?.elbowPush[targets[0]]:info?.pushes[targets[0]]):undefined;
 const steal=take==='equipment'&&item&&targets.length===1?a.stealEquipment[targets[0]]?.[item]:null;
 const equipment=d?.id==='basic-024'?steal:info?.equipment;
 const primeEquipment=primeSkillActive(game,seat)&&d?.type==='equipment'&&!asElbow;
 const options={...(primeEquipment?{replacements}:{}),...(asElbow?{as:dodge?'dodge' as const:'elbow' as const}:{}),...(replacement?{replacement}:{}),...(elbow&&direction?{direction}:{}),...(info?.region?{region}:{}),...(info?.costKind==='variable'?{x}:{}),...(d?.id==='basic-024'?{take,...(take==='equipment'?{item}:{})}:{}),...(d?.id==='basic-073'?{copy}:{}),...(northGroup?{northGroup}:{})};
 const groupRequired=Boolean(hasPlaytestRules(game.version)&&!asElbow&&d&&['basic-011','basic-012','basic-014','basic-013','basic-031','basic-026','basic-040','basic-041'].includes(d.id)&&game.players.some(q=>q.hp>0&&q.character==='character-006'));
 const reason=selected?playBlockReason(game,seat,selected,targets,busy,now,options):null;
 return <>{common}<div className="ordinary-actions"><Stage3Controls {...props} hideCardForm/></div>
  <div className="stage4-skills">{!a.equipmentSkills&&a.watchCell&&<button disabled={blocked} onClick={()=>send({type:'skill',kind:'watch'})}>手表 · 回到{a.watchCell}</button>}{a.equipmentSkills?.watch.map((g,i)=><button key={g.card} disabled={blocked} onClick={()=>send({type:'skill',kind:'watch',card:g.card})}>手表{a.equipmentSkills!.watch.length>1?` ${i+1}`:''}{equipmentSourceLabel(game,seat,g.card)} · 回到{g.cell}</button>)}{a.flightCells.length>0&&<button aria-pressed={mode==='flight'} disabled={blocked} onClick={()=>{setMode(mode==='flight'?null:'flight');setTargets([]);}}>子腾 · 传送 {a.flightCost} AP</button>}{a.giftTargets.length>0&&<button aria-pressed={mode==='gift'} disabled={blocked} onClick={()=>{setMode(mode==='gift'?null:'gift');setTargets([]);}}>快速车 · 送手牌</button>}</div>
  {mode==='flight'&&<><span>在高亮空格选择子腾落点；仍占一次基础移动。</span><button onClick={()=>setMode(null)}>取消传送</button></>}
  {mode==='gift'&&<><label>收牌玩家 <select value={targets[0]??''} onChange={e=>setTargets(e.target.value===''?[]:[Number(e.target.value)])}><option value="">请选择</option>{a.giftTargets.map(t=><option value={t} key={t}>S{t+1}</option>)}</select></label><span>在手牌区选择要送的牌。</span><button className="primary" disabled={blocked||targets.length!==1||discard.length===0} onClick={()=>send({type:'skill',kind:'gift',target:targets[0],cards:discard})}>送出{discard.length}张 · 0AP</button><button onClick={()=>setMode(null)}>取消送牌</button></>}
  {!mode&&!props.breadMode&&d&&selected&&info&&<div className="stage4-card-form">
   <CardEffectSummary game={game} seat={seat} card={selected} asElbow={asElbow} x={x}/>
   {!asElbow&&['basic-021','basic-037'].includes(d.id)&&<div className="card-target-options" role="group" aria-label={d.id==='basic-037'?'紫檀木复活目标':'卫汶找你目标'}>
    <span>{d.id==='basic-037'?'复活目标：':'猜点对象：'}</span>
    {info.targets.map(t=><button key={t} aria-pressed={targets.includes(t)} disabled={blocked} onClick={()=>setTargets(targets.includes(t)?[]:[t])}>S{t+1} · {game.players[t].character===me.character?'自己':runtimeForVersion(game.version).characters[game.players[t].character].name}{d.id==='basic-037'?' · 已阵亡':''}</button>)}
    {!info.targets.length&&<span role="status">{d.id==='basic-037'?'无合法复活目标：仅死亡后未跨过完整个人回合结束、且出生地区有合法空格的角色可选。':'当前没有合法猜点对象。'}</span>}
   </div>}
   {me.character==='character-029'&&game.actions.stage3?.clan&&<button className="character-skill-button" aria-pressed={asElbow} disabled={blocked} onClick={()=>{setAsElbow(!asElbow);setTargets([]);setReplacement('');setDirection('');}}>{dodge?'恢复原牌用法':'变 · 当作躲避球 · 总价2AP'}</button>}
   {me.character==='character-023'&&d.id!=='basic-002'&&<button aria-pressed={asElbow} disabled={blocked} onClick={()=>{setAsElbow(!asElbow);setTargets([]);setReplacement('');setDirection('');}}>{asElbow?'恢复原牌用法':'当作肘击 · 2AP'}</button>}
   {groupRequired&&<label>群体目标分支 <select aria-label="群体目标分支" value={northGroup} onChange={e=>setNorthGroup(e.target.value as typeof northGroup)}><option value="">请选择</option><option value="north">北帝汶及合法机械猴子</option><option value="others">其他合法目标（不含北帝汶）</option></select></label>}
   {!asElbow&&info.region&&<label>作用地区 <select aria-label="作用地区" value={region} onChange={e=>setRegion(e.target.value)}><option value="">请选择</option>{a.regions.map(r=><option key={r}>{r}</option>)}</select></label>}
   {!asElbow&&info.costKind==='variable'&&<label>X：付多少AP摸多少牌 <input aria-label="收集石头X" type="number" min={1} max={me.ap} step={1} value={x} onChange={e=>setX(Number(e.target.value))}/></label>}
   {!asElbow&&d.id==='basic-024'&&<><label>拿取 <select value={take} onChange={e=>{setTake(e.target.value as 'hand'|'equipment');setItem('');setReplacement('');}}><option value="hand">随机拿最多2张手牌</option><option value="equipment">一件公开装备</option></select></label>{take==='equipment'&&<label>目标装备 <select aria-label="拿取公开装备" value={item} onChange={e=>{setItem(e.target.value);setReplacement('');}}><option value="">先选玩家，再选装备</option>{Object.keys(a.stealEquipment[targets[0]]??{}).map(card=><option key={card} value={card}>{cardForVersion(definitionId(card),game.version).name}</option>)}</select></label>}{steal&&!steal.allowed&&<span>{item.includes('~g')?'成对装备件不能拿入手牌，须合法安装。':'同名装备将拿入手牌。'}</span>}</>}
   {!asElbow&&d.id==='basic-073'&&<label>Bob复制坐骑 <select aria-label="Bob复制坐骑" value={copy} onChange={e=>setCopy(e.target.value)}><option value="">请选择</option>{a.copyMounts.map(g=><option value={g.card} key={g.card}>S{g.owner+1} · {cardForVersion(definitionId(g.card),game.version).name}</option>)}</select></label>}
   {!asElbow&&!primeEquipment&&equipment&&equipment.allowed&&equipment.cards.length>0&&<label>替换装备 <select aria-label="替换装备" value={replacement} onChange={e=>setReplacement(e.target.value)}><option value="">{equipment.required?'必须选择替换':'新增，不替换'}</option>{equipment.cards.map(card=><option key={card} value={card}>{cardForVersion(definitionId(card),game.version).name}</option>)}</select></label>}
   {primeEquipment&&equipment&&equipment.cards.length>0&&<div role="group" aria-label="双装备替换对象"><span>请选择{equipment.cards.length}件替换装备；逐份成功安装时才移除。</span>{equipment.cards.map((card,i)=><button key={card} aria-pressed={replacements.includes(card)} disabled={blocked} onClick={()=>setReplacements(old=>old.includes(card)?old.filter(c=>c!==card):[...old,card])}>{i+1} · {cardForVersion(definitionId(card),game.version).name}</button>)}</div>}
   {elbow&&pushes&&Object.keys(pushes).length>0&&<label className="character-skill-control">撞飞方向 <select aria-label="肘击撞飞方向" value={direction} onChange={e=>setDirection(e.target.value as typeof direction)}><option value="">请选择</option>{Object.entries(pushes).map(([d,cell])=><option key={d} value={d}>{directions[d]} · {String(cell)}</option>)}</select></label>}
   {!asElbow&&info.needsQuote?<button className="primary" disabled={blocked||d.id==='basic-037'&&targets.length!==1} onClick={()=>send({type:'skill',kind:'quote-cost',card:selected})}>锁定本张费用 · {info.printedCost}</button>:<button className="primary" disabled={Boolean(reason)} title={reason??'确认出牌'} onClick={()=>send({type:'play',card:selected,targets,...options})}>确认{asElbow?(dodge?'转换躲避球':'转换肘击'):'出牌'} · {asElbow?2:info.costKind==='variable'?x+(primeSkillActive(game,seat)?1:0):info.cost} AP</button>}
   {reason&&<span role="status">{reason}</span>}
  </div>}
 </>;
}
