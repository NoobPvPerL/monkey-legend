import useHandScroll from './use-hand-scroll';
import {createGameAudio} from './game-audio';
import CardEffectSummary from './CardEffectSummary';
import ActionPanel from './ActionPanel';
import BattleMap from './BattleMap';
import {formContext} from './board-form-state';
import {useEffect,useRef,useState} from 'react';
import {hasPlaytestRules,hasExerciseRules,hasCardFeedbackRules,cardForVersion,definitionId,hasInteractionRules,unlimitedAttacks,runtimeForVersion,safeCellsForVersion,hasStage3} from '../../../packages/game-data/src/index';
import Stage4Controls from './Stage4Controls';
import type {Stage4Mode} from './Stage4Controls';
import Stage3Controls from './Stage3Controls';
import Stage3Rules from './Stage3Rules';
import {EquipmentLine,ComboProgress} from './Stage3Status';
import type {Direction} from '../../../packages/game-core/src/stage3-roles';
import type {Intent,Snapshot} from '../../../packages/online/src/protocol';
import Dialog from './Dialog';
import SettlementStats from './SettlementStats';
import CompactText,{PublicLog} from './CompactText';
import MapMarkers from './MapMarkers';
import {lastBombing,poisonLimit,classicEnvironmentText} from './environment-view';
import {actionBlockReason,playBlockReason} from './interaction-guards';
import {basicMoveCost,locationDestinations} from '../../../packages/game-core/src/locations';
import {attention,latestAction,nextFeedback} from './board-feedback';

const labels:Record<string,string>={'draw-start':'可额外摸1张','draw-end':'可额外摸1张',response:'选择手牌响应攻击','lemon-reward':'攻击者奖励：可摸1张','lemon-support':'支付1 AP，自己与队友各摸1张','runner-roll':'发动跑者恢复判定','runner-pay':'支付2 AP，回复1生命',teleport:'选择高亮空陆地传送',discard:'选择超限手牌弃置','water-discard':'入水／轮初水域：选择1张手牌弃置（10秒）',easy:'easy：每次1 AP，3—6整牌失效；失败不续时','qb-pursuit':'QB：免费判定追击，失败自己受1伤','east-start':'东帝汶：选择其他玩家共同摸牌或随机拿牌','xiao-overflow':'选择超限手牌交给晓虫（10秒）','xie-ledger':'谢bro：选择一名高亮参与者造成1伤','elbow-push':'选择高亮空格确定撞飞方向','west-carry':'选择同行者及终点邻接空格','equipment-loss':'失去装备：选择是否发动失去效果','board-guess':'卫汶找你：受牌者猜1—6，猜错后由出牌者选落点','board-cell':'卫汶找你：出牌者点击高亮空格传送目标','revival-confirm':'紫檀木费用已锁定，确认支付后复活'};
type Overlay='rules'|'log'|'discard'|'hand'|'players'|null;

export default function OnlineBoard({snapshot:s,send,busy,onRematch,animations,onToggleAnimations}:{snapshot:Snapshot;send:(intent:Intent)=>void;busy:boolean;onRematch:()=>void;animations:boolean;onToggleAnimations:()=>void}) {
 const game=s.game!,catalog=runtimeForVersion(game.version),me=game.players[s.seat],choice=game.choice,deferred=hasInteractionRules(game.version),unlimited=unlimitedAttacks(game.version),walked=(game.movement?.path.length??1)>1;
 const handScroll=useHandScroll();
 const [stage4Mode,setStage4Mode]=useState<Stage4Mode>(null);
 const [locationMode,setLocationMode]=useState<'ship'|'commute'|null>(null);
 const staged=hasStage3(game.version),[asElbow,setAsElbow]=useState(false),[replacement,setReplacement]=useState(''),[direction,setDirection]=useState<Direction|''>(''),[breadMode,setBreadMode]=useState(false);
 const [selected,setSelected]=useState<string|null>(null),[targets,setTargets]=useState<number[]>([]),[discard,setDiscard]=useState<string[]>([]);
 const [now,setNow]=useState(s.serverTime),[reference,setReference]=useState<string|null>(null),[assets,setAssets]=useState<Record<string,string>>({});
 const [overlay,setOverlay]=useState<Overlay>(null),[notice,setNotice]=useState<{id:number;text:string;urgent:boolean;effects:ReturnType<typeof nextFeedback>['effects']}|null>(null),[resultClosed,setResultClosed]=useState<string|null>(null);
 const audio=useRef<ReturnType<typeof createGameAudio>|null>(null),cursor=useRef<Parameters<typeof nextFeedback>[0]>(null),noticeSerial=useRef(0);
 const context=formContext(s),priorContext=useRef(context);
 useEffect(()=>{
  const changed=priorContext.current!==context;priorContext.current=context;
  if(changed||me.hp===0){setStage4Mode(null);setSelected(null);setTargets([]);setDiscard([]);setLocationMode(null);setAsElbow(false);setReplacement('');setDirection('');setBreadMode(false);return;}
  setSelected(card=>card&&me.hand?.includes(card)?card:null);
  setTargets(old=>old.filter(t=>legal.includes(t)));
  setDiscard(old=>old.filter(card=>me.hand?.includes(card)));
  setReplacement(old=>old&&game.stage3?.equipment[s.seat].includes(old)?old:'');
  setDirection(old=>old&&targets.length===1&&!(asElbow?game.actions.stage3?.elbowPush[targets[0]]:selected?game.actions.stage4?.cards[selected]?.pushes[targets[0]]:null)?.[old]?'':old);
  setStage4Mode(old=>old==='flight'&&!game.actions.stage4?.flightCells.length||old==='gift'&&!game.actions.stage4?.giftTargets.length?null:old);
 },[game.revision,context]);
 useEffect(()=>{const start=performance.now();setNow(s.serverTime);const t=setInterval(()=>setNow(s.serverTime+performance.now()-start),150);return()=>clearInterval(t);},[s.serverTime]);
 useEffect(()=>{const controller=new AbortController();void fetch('/references/index.json',{signal:controller.signal}).then(r=>r.json()).then(setAssets).catch(()=>{});return()=>controller.abort();},[]);
 useEffect(()=>{
  const controller=createGameAudio(document,()=>new AudioContext(),Boolean(navigator.userActivation?.hasBeenActive));audio.current=controller;
  return()=>{controller.dispose();if(audio.current===controller)audio.current=null;};
 },[]);
 useEffect(()=>{
  const feedback=nextFeedback(cursor.current,s.matchId,game,s.seat);cursor.current=feedback.cursor;
  if(feedback.message){
   setNotice({id:++noticeSerial.current,text:feedback.message,urgent:feedback.urgent,effects:feedback.effects});
   audio.current?.play(feedback.hit,feedback.urgent);
  }
 },[s.matchId,game.revision,s.seat]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),notice.effects.length?12000:4500);return()=>clearTimeout(timer);},[notice]);
 const bombing=lastBombing(game);
 const classic=Boolean(game.classic),locationState={...game,shipUsed:game.classic?.shipUsed??[],farmClosed:game.classic?.farmClosed??false};
 const locationCells=locationMode?(staged?game.actions.stage3?.locations[locationMode]??[]:locationDestinations(locationState,s.seat,locationMode)):[];
 const freeMove=basicMoveCost(game.version,me.cell)===0,moveFee=game.movement?.costDue===false?0:1,discardChoice=choice?.kind==='discard'||choice?.kind==='water-discard'||choice?.kind==='xiao-overflow'||stage4Mode==='gift';
 const actionReason=actionBlockReason(game,s.seat,busy,now),canAct=actionReason===null;
 const def=selected?cardForVersion(definitionId(selected),game.version):null,legal=stage4Mode==='gift'?game.actions.stage4?.giftTargets??[]:staged?(choice?.targets??(breadMode?game.actions.stage3?.breadTargets??[]:selected?(asElbow?game.actions.stage3?.cards[selected]?.convertTargets:game.actions.stage4?.cards[selected]?.targets??game.actions.stage3?.cards[selected]?.targets)??[]:[])):selected?game.actions.targets[selected]??[]:[];
 const playReason=selected&&!game.stage4?playBlockReason(game,s.seat,selected,targets,busy,now,{...(asElbow?{as:'elbow'}:{}),...(replacement?{replacement}:{}),...(direction?{direction}:{})}):null;
 const seatName=(i:number)=>`${s.members[i]?.name??`S${i+1}`} · ${catalog.characters[game.players[i].character].name}`;
 const publicText=(text:string)=>text.replace(/S([1-4])(?=\s)/g,(_,n:string)=>`${s.members[Number(n)-1]?.name??`S${n}`}（S${n}）`);
 const toggle=(i:number)=>{if(!canAct||!legal.includes(i))return;const max=staged&&(choice||breadMode||asElbow)?1:def?.group?(deferred?3:2):1;setDirection('' );setTargets(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i].slice(-max));};
 const remaining=choice?choice.deadline-now:game.clock.remaining-(game.clock.since===null?0:now-game.clock.since);
 const latest=latestAction(game.events),cue=attention(game,s.seat);
 const result=game.result,resultOpen=Boolean(result&&resultClosed!==s.matchId&&!overlay&&!reference);
 const buttonDisabled=!canAct;
 return <div className={`online-board ${staged?'stage3-board':''}`}>
  <section className={`match-status ${cue?'your-turn':''}`} aria-label="当前行动状态">
   <div><strong>{result?'对局结束':cue?cue.text:choice?`等待 ${s.members[choice.actor]?.name} 选择`:`${s.members[game.active]?.name} 行动中`}</strong><span>第 {game.round}{classic?'':'/12'} 轮 · {game.mode==='ffa'?'各自为战':'双人同盟'}</span></div>
   <b className={remaining<10000?'urgent':''} aria-label="剩余操作时间">{result?'—':`${Math.ceil(Math.max(0,remaining)/1000)}s`}</b>
   <nav aria-label="对局工具"><button className="mobile-player-details" onClick={()=>setOverlay('players')}>玩家</button><button onClick={()=>setOverlay('log')}>日志</button><button onClick={()=>setOverlay('rules')}>规则</button>{result&&<button onClick={()=>setResultClosed(null)}>结算</button>}</nav>
  </section>
  <div className="latest-action" role="status" aria-live="polite"><span>最新动作</span><p>{latest?<CompactText text={latest.text}/>:'等待玩家行动'}</p><button aria-label="查看完整动作日志" onClick={()=>setOverlay('log')}>展开</button></div>
  <section className="compact-roster" aria-label="战场玩家">{game.players.map(p=><article key={p.seat} className={`compact-player ${p.seat===game.active&&!result?'active':''} ${p.hp===0?'eliminated':''} ${targets.includes(p.seat)?'targeted':''}`}>
   <div><span className={`seat seat-${p.seat}`}>S{p.seat+1}</span><strong title={s.members[p.seat]?.name}>{s.members[p.seat]?.name}{p.seat===s.seat?' · 你':''}</strong><i className={s.members[p.seat]?.online?'online-dot':'offline-dot'} title={s.members[p.seat]?.online?'在线':'离线'}/></div>
   <button className="compact-character" onClick={()=>setReference(p.character)}>{catalog.characters[p.character].name} <small>{game.mode==='team'?`${p.team}队`:p.hp===0?'淘汰':''}</small></button>
   <p><span title="生命">♥ {p.hp}/{p.maxHp}</span><span title="行动点">AP {p.ap}</span><span title="护盾">◇ {p.shield}</span><span title="手牌数">▤ {p.handCount}</span><span className="mobile-equipment-count">装 {game.stage3?.equipment[p.seat].length??0}</span></p>
   <EquipmentLine game={game} seat={p.seat} onReference={setReference}/>
   {canAct&&legal.includes(p.seat)&&<button className="compact-target" aria-pressed={targets.includes(p.seat)} onClick={()=>toggle(p.seat)}>{targets.includes(p.seat)?'已选目标 ✓':'选择目标'}</button>}
  </article>)}</section>
  <BattleMap label="校园战场">
   <div className="map-status">{classic?<><span>永久毒区 {game.classic!.poison.length}/{poisonLimit(game.version)} 区 · 轮末轰炸2区</span><span>{game.classic!.farmClosed?'高唐农场已封闭':'第5轮封闭高唐农场'} · 无轰炸预告</span><span className="bomb-history">{bombing.label}</span></>:<><span>安全 {game.safe.length} 格 · 轰炸：<b>{game.bomb??'无'}</b></span><span>下轮：安全 {game.round<12?safeCellsForVersion(game.version,game.round+1).length:'—'} 格 · 轰炸 {game.forecast?.bomb??'未预告'}</span></>}</div>
   <div className="compact-grid" role="grid" aria-label="32格校园棋盘">{catalog.cells.map(cell=>{
    const occupants=game.players.filter(p=>p.hp>0&&!game.stage4?.offMap[p.seat]&&p.cell===cell.id),safe=game.safe.includes(cell.id),bomb=classic?bombing.regions.includes(cell.region):game.bomb===cell.region;
    const flight=canAct&&stage4Mode==='flight'&&game.actions.stage4?.flightCells.includes(cell.id),waterCell=cell.terrain==='water'||Object.hasOwn(game.stage4?.water??{},cell.region),desert=Object.hasOwn(game.stage4?.deserts??{},cell.region);
    const location=canAct&&locationCells.includes(cell.id),closed=game.classic?.farmClosed&&cell.region==='高唐农场';
    const chosenCells=choice?.kind==='west-carry'?(targets.length?choice.options?.[targets[0]]:[]):choice?.cells;
    const teleport=canAct&&choice&&['teleport','elbow-push','equipment-loss','west-carry','board-cell','board-return','native-shore','gear-plant','gear-react','gear-loss'].includes(choice.kind)&&chosenCells?.includes(cell.id),step=canAct&&!choice&&game.actions.steps.includes(cell.id),target=occupants.find(p=>legal.includes(p.seat));
    const description=`${cell.id} ${cell.region} ${safe?'安全':'毒圈'}${bomb?' 轰炸':''} ${waterCell?'水域':'陆地'}${desert?' 沙漠':''}${occupants.map(p=>` ${seatName(p.seat)}，生命${p.hp}，AP${p.ap}`).join('')}${closed?' 已封闭，不能进入':''}${location?' 可地点传送':teleport?' 可传送':step?' 可移动':''}`;
    return <button role="gridcell" data-region={cell.region} key={cell.id} aria-label={description} title={description} className={`cell ${cell.terrain} ${!safe?'poison':''} ${bomb?'bombed':''} ${teleport||step||location||flight?'reachable':''} ${desert?'desert-overlay':''} ${waterCell?'water':''} ${closed?'closed-region':''} ${target&&canAct?'targetable':''} ${occupants.some(p=>targets.includes(p.seat))?'picked':''}`} onClick={()=>{if(flight)send({type:'skill',kind:'flight',cell:cell.id});else if(location)send({type:'location',kind:locationMode!,cell:cell.id});else if(teleport)send({type:'choose',choice:choice!.id,cell:cell.id,...(choice!.kind==='west-carry'?{target:targets[0]}:{})});else if(step)send({type:'step',path:[cell.id]});else if(target)toggle(target.seat);}}>
     <span className="cell-coord">{cell.id}</span><span className="region-name">{cell.region}</span><MapMarkers poison={!safe} bomb={bomb} bombTitle={classic?bombing.label:undefined} water={waterCell} desert={desert}/><span className="pieces">{occupants.map(p=><span key={p.seat} className={`piece seat-${p.seat}`} title={seatName(p.seat)}>S{p.seat+1}</span>)}</span>
    </button>;
   })}</div>
  </BattleMap>
  <div className="board-controls">
  <section className="compact-hand" aria-label="你的手牌"><header><strong>{me.hp===0?'你已淘汰':'你的手牌'} · {me.handCount} 张</strong><span>AP {me.ap} · {unlimited?`攻击已出${me.attacks}张 · 不限次数`:`攻击 ${me.attacks}/2（旧版）`} · 移动{me.moved?'已用':'可用'}</span><button className="hand-detail-button" onClick={()=>setOverlay('hand')}>牌效详情</button><button onClick={()=>setOverlay('discard')}>牌堆 {game.deckCount} / 弃牌 {game.discard.length}</button></header>
   <ComboProgress game={game}/>
   <div ref={handScroll} className="compact-cards mouse-scroll-hand" tabIndex={0} aria-label="左右滑动查看手牌">{(me.hand??[]).map(card=>{
    const d=cardForVersion(definitionId(card),game.version),info=game.actions.stage4?.cards[card],cost=staged?(info??game.actions.stage3?.cards[card])?.cost:d.cost;
    const cardChoice=choice&&['response','card-counter','forced-card','board-tax'].includes(choice.kind);
    const handAction=game.stage4?(info?.playable||me.character==='character-023'):(d.type!=='response'||staged&&me.character==='character-023');
    const enabled=canAct&&(discardChoice||(cardChoice?choice.cards?.includes(card):!choice&&game.phase==='action'&&handAction));
    return <button key={card} className={`compact-card ${!enabled?'unavailable':''} ${selected===card||discard.includes(card)?'selected':''}`} aria-label={`${d.name}，${game.actions.stage4?.cards[card]?.costKind==='variable'?'X AP':cost===null?`随机费用 ${game.actions.stage4?.cards[card]?.printedCost??'d6'}`:`${cost??d.cost} AP`}，${d.text}${enabled?'':'，点击查看牌面'}`} title={d.text} aria-pressed={selected===card||discard.includes(card)} onClick={()=>{
     if(!enabled){setReference(d.id);return;}
     if(choice&&['response','forced-card','board-tax'].includes(choice.kind))send({type:'choose',choice:choice.id,card});
     else if(discardChoice)setDiscard(prev=>prev.includes(card)?prev.filter(x=>x!==card):[...prev,card]);
     else{setStage4Mode(null);setLocationMode(null);setSelected(selected===card?null:card);setTargets([]);setAsElbow(false);setReplacement('');setDirection('');setBreadMode(false);}
    }}><span>{d.type==='attack'?'攻击':d.type==='food'?'补给':d.type==='equipment'?'装备':d.type==='tactic'?'锦囊':'响应'}<b>{game.actions.stage4?.cards[card]?.costKind==='variable'?'X AP':cost===null?game.actions.stage4?.cards[card]?.printedCost??'d6费用':`${cost??d.cost} AP`}</b></span><strong>{d.name}</strong><small>{d.text}</small></button>;
   })}{!me.hand?.length&&<p className="empty">暂无手牌</p>}</div>
  </section>
  <ActionPanel selected={Boolean(selected)}>
   <div id="action-context" className={`action-context ${playReason&&canAct?'blocked-action':''}`} role="status">{actionReason||(choice?`${labels[choice.kind]??'请在操作区完成当前选择'}${discardChoice?` · 已选 ${discard.length}/${choice.count}`:''}`:locationMode?`选择高亮空格${locationMode==='ship'?'飞船传送（不扣AP）':'通校（耗尽AP）'}，点取消可返回`:game.phase==='moving'?`剩余 ${game.movement?.remaining} 步 · ${deferred?(walked?`结束时扣${moveFee} AP`:'未走可取消；移动次数已用'):'点击高亮格移动'}`:breadMode?'选择高亮玩家，发动面包黏稠':def?playReason??(staged&&asElbow?'转换为肘击 · 总费用2 AP：伤1，按所选方向撞飞一格并瞬移至目标原位置。':`${def.name}：${def.text}${def.type==='attack'?` · 已选 ${targets.length} 个目标`:''}`):'选择手牌出牌，或移动、结束行动。')}</div>
   <div className="compact-buttons">{result?<><button className="primary" onClick={onRematch}>再来一局</button><button onClick={()=>setResultClosed(null)}>查看结算</button></>:staged?(game.stage4?<Stage4Controls mode={stage4Mode} setMode={setStage4Mode} game={game} seat={s.seat} busy={busy} now={now} selected={selected} targets={targets} asElbow={asElbow} setAsElbow={setAsElbow} replacement={replacement} setReplacement={setReplacement} direction={direction} setDirection={setDirection} breadMode={breadMode} setBreadMode={setBreadMode} setTargets={setTargets} discard={discard} send={send} locationMode={locationMode} setLocationMode={setLocationMode}/>:<Stage3Controls game={game} seat={s.seat} busy={busy} now={now} selected={selected} targets={targets} asElbow={asElbow} setAsElbow={setAsElbow} replacement={replacement} setReplacement={setReplacement} direction={direction} setDirection={setDirection} breadMode={breadMode} setBreadMode={setBreadMode} setTargets={setTargets} discard={discard} send={send} locationMode={locationMode} setLocationMode={setLocationMode}/>):me.hp<=0||(choice?choice.actor!==s.seat:game.active!==s.seat)?<span className="waiting-action">{me.hp<=0?'可查看角色和日志':'可左右滑动手牌，点击查看牌面'}</span>:choice?<>
    {discardChoice?<button className="primary" disabled={buttonDisabled||discard.length!==choice.count} onClick={()=>send({type:'choose',choice:choice.id,cards:discard})}>确认弃置 {discard.length}/{choice.count}</button>:choice.kind==='response'?<button disabled={buttonDisabled} onClick={()=>send({type:'choose',choice:choice.id,card:null})}>不响应</button>:choice.kind==='teleport'?<button disabled={buttonDisabled} onClick={()=>send({type:'choose',choice:choice.id,cell:null})}>放弃传送</button>:<><button disabled={buttonDisabled} onClick={()=>send({type:'choose',choice:choice.id,accept:false})}>放弃</button><button className="primary" disabled={buttonDisabled} onClick={()=>send({type:'choose',choice:choice.id,accept:true})}>确认发动</button></>}
   </>:game.phase==='moving'?<><button className="primary" disabled={buttonDisabled} onClick={()=>send({type:'stop'})}>{deferred?(walked?`结束移动 · 扣${moveFee} AP`:'取消移动 · 不扣AP'):'结束移动'}</button><button disabled={buttonDisabled} onClick={()=>send({type:'end'})}>结束行动</button></>:<>
    <button disabled={buttonDisabled||game.phase!=='action'||me.moved||me.ap<basicMoveCost(game.version,me.cell)} onClick={()=>send({type:'move'})}>{freeMove?'操场移动 · 免费':deferred?'移动 · 结束扣1 AP':'移动 · 1 AP'}</button>
    {classic&&<>{locationMode?<button onClick={()=>setLocationMode(null)}>取消地点传送</button>:<>{locationDestinations(locationState,s.seat,'ship').length>0&&<button disabled={buttonDisabled} onClick={()=>{setSelected(null);setLocationMode('ship');}}>飞船传送 · 0 AP</button>}{locationDestinations(locationState,s.seat,'commute').length>0&&<button disabled={buttonDisabled} onClick={()=>{setSelected(null);setLocationMode('commute');}}>通校 · 耗尽AP</button>}</>}</>}
    {def&&<><CardEffectSummary game={game} seat={s.seat} card={selected!}/><button onClick={()=>setReference(def.id)}>牌面</button><button className="primary" aria-describedby="action-context" title={playReason??'确认出牌'} disabled={Boolean(playReason)} onClick={()=>send({type:'play',card:selected!,targets})}>确认出牌{targets.length?` · ${targets.map(t=>`S${t+1}`).join('、')}`:''}</button></>}
    <button disabled={buttonDisabled} onClick={()=>send({type:'end'})}>结束行动 →</button>
   </>}</div>
  </ActionPanel>
  </div>
  {notice&&!resultOpen&&!overlay&&!reference&&<div className={`action-toast ${notice.urgent?'attention-toast':''}`} role="status" aria-live={notice.urgent?'assertive':'polite'} key={notice.id}><strong>{notice.urgent?'请操作':'战场动态'}</strong><p><CompactText text={notice.text}/></p>{notice.effects.length>0&&<div className="toast-card-effects">{notice.effects.map(effect=><article key={effect.seq}><b>{effect.name} · 牌效说明</b><p>{effect.text}</p></article>)}<small>是否命中、反制及最终数值以实际结算为准；对局计时继续。</small></div>}<button aria-label="关闭动作提示" onClick={()=>setNotice(null)}>×</button></div>}
  {overlay==='players'&&<Dialog title="玩家与装备" onClose={()=>setOverlay(null)}>{game.players.map(p=><article key={p.seat}><h3>S{p.seat+1} {s.members[p.seat]?.name} · {catalog.characters[p.character].name}</h3><p>生命{p.hp}/{p.maxHp} · AP{p.ap} · 护盾{p.shield} · 手牌{p.handCount}</p><EquipmentLine game={game} seat={p.seat} onReference={setReference}/></article>)}</Dialog>}
  {overlay==='hand'&&<Dialog title="手牌完整牌效" onClose={()=>setOverlay(null)}><p>手牌可左右滑动；下列为当前规则的完整说明。</p><ComboProgress game={game}/>{(me.hand??[]).map(card=>{const d=cardForVersion(definitionId(card),game.version);return <article key={card}><h3>{d.name}</h3><p>{d.text}</p></article>;})}</Dialog>}
  {overlay&&overlay!=='hand'&&overlay!=='players'&&<Dialog title={overlay==='rules'?'游戏规则':overlay==='log'?'公开动作日志':'牌堆与公开弃牌'} onClose={()=>setOverlay(null)}>
   {overlay==='rules'?<div className="online-rules"><p>规则版本 {game.version}。四人各自为战或随机 2 对 2。</p><button aria-pressed={animations} onClick={onToggleAnimations}>{animations?'关闭对局动画':'开启对局动画'}</button><h3>行动与移动</h3><p>{deferred?'每次主动出牌成功时立即重置60秒；弃牌20秒，其他选择通常10秒。':'行动预算60秒，选择通常10秒。'}断线继续计时。{unlimited?'每回合攻击牌不限张数，逐张支付AP并满足使用条件；基础移动仍每回合一次。':'旧版每回合最多两张攻击牌、一次基础移动。'}{classic?'移动先掷骰获得1—3步；操场出发免费，其他地点走过后结束扣1 AP。':deferred?'移动先掷骰获得1—3步，结束时扣1 AP；未走可取消或超时结束，不扣AP但移动次数已用。走出后返回起点仍扣费。':'移动先支付1 AP，再掷骰获得1—3步；放弃不退款。'}上下左右移动，水域耗 2 步，可经过角色但不能停在占用格。</p><h3>手牌与战斗</h3><p>点击手牌查看效果，再选择高亮玩家并确认出牌。响应时选择手牌或“不响应”。自己的行动结束时，手牌上限为当前生命向下取整。点击玩家角色名可查看能力。</p>{classic&&<><h3>经典地点与水域</h3><p>操场出发免费；农场常规补牌+1，尚德荟首轮后行动开始+1 AP；XDF食物总治疗+1，角色限制优先。{hasCardFeedbackRules(game.version)?'教学楼只禁躲避球，秀松苑只禁猴子游戏；':'教学楼／秀松苑禁止使用躲避球和猴子游戏；'}办公室免建民效果；进山洞停止移动。非水生从陆地入水自选弃1，连续水域不重复，轮初在水域再弃1；无牌免费，10秒超时代弃。lemon可直线越水，整段只耗1步。</p></>}{staged&&<Stage3Rules stage4={Boolean(game.stage4)} playtest={hasPlaytestRules(game.version)} exercise={hasExerciseRules(game.version)} cardFeedback={hasCardFeedbackRules(game.version)}/>}<h3>环境与胜负</h3>{classic?<p>{classicEnvironmentText(game.version)}</p>:<p>安全区依轮次缩小，轰炸区域提前预告。☠ 为毒圈，✹ 为轰炸，≈ 为水域。环境伤害不受普通护盾抵挡。最后一人或一队获胜；第 12 轮结束按规则判分，同批次淘汰或同分可并列。</p>}<p><a href={`https://github.com/NoobPvPerL/monkey-legend/blob/main/docs/${classic?game.version.replace('web-','web-rules-')+'.md':unlimited?'web-rules-v0.1.3.md':deferred?'web-rules-v0.1.2.md':'web-rules-v0.1.md'}`} target="_blank" rel="noreferrer">查看完整规则</a></p></div>:overlay==='log'?<PublicLog events={game.events} fullText={publicText}/>:<><p>抽牌堆 {game.deckCount} 张 · 弃牌堆 {game.discard.length} 张 · 结算区 {game.resolving.length} 张</p>{game.discard.length?game.discard.map(card=><p key={card}>{cardForVersion(definitionId(card),game.version).name}</p>):<p>暂无公开弃牌</p>}</>}
  </Dialog>}
  {reference&&<Dialog title={reference.startsWith('character')?catalog.characters[reference as keyof typeof catalog.characters].name:catalog.cards[reference as keyof typeof catalog.cards].name} onClose={()=>setReference(null)}><div className="online-reference">{assets[reference]&&<img src={assets[reference]} alt="原始牌面参考"/>}<p>{reference.startsWith('character')?catalog.characters[reference as keyof typeof catalog.characters].text:cardForVersion(reference as keyof typeof catalog.cards,game.version).text}</p><small>执行费用、范围与效果以 {game.version} 为准。</small></div></Dialog>}
  {resultOpen&&result&&<Dialog title={result.winners.length?'本局结算':'本局平局'} className="settlement-dialog" onClose={()=>setResultClosed(s.matchId)}><p>{result.reason==='round-limit'?'达到第 12 轮，按存活、生命比例、击杀和伤害判分。':result.reason==='combo'?'达成角色组合胜利。':result.reason==='draw'?'同批次全体淘汰、同分或多方同时达成组合，本局平局。':'最后存活的玩家或队伍获胜。'}同批次淘汰或同分可并列。</p><ol className="settlement-ranking">{result.ranking.map(row=><li key={row.label}><b>#{row.rank}</b><div><strong>{row.players.map(i=>s.members[i]?.name??`S${i+1}`).join(' / ')}{game.mode==='team'?` · ${row.label}`:''}</strong><span>生命 {row.hp}/{row.maxHp} · 击杀 {row.kills} · 伤害 {row.damage}</span></div></li>)}</ol><SettlementStats game={game} members={s.members}/><div className="settlement-actions"><button className="primary" onClick={onRematch}>再来一局 · 返回准备</button><button onClick={()=>setResultClosed(s.matchId)}>查看战场</button></div><p className="settlement-note">原房间码和成员保留。返回准备后，四人重新准备，由房主开始。</p></Dialog>}
 </div>;
}
