import {useEffect,useRef,useState} from 'react';
import {CARDS,cardForVersion,CHARACTERS,CELLS,definitionId,safeCells} from '../../../packages/game-data/src/index';
import type {Intent,Snapshot} from '../../../packages/online/src/protocol';
import Dialog from './Dialog';
import {attention,latestAction,nextFeedback} from './board-feedback';

const labels:Record<string,string>={'draw-start':'可额外摸1张','draw-end':'可额外摸1张',response:'选择手牌响应攻击','lemon-reward':'攻击者奖励：可摸1张','lemon-support':'支付1 AP，自己与队友各摸1张','runner-roll':'发动跑者恢复判定','runner-pay':'支付2 AP，回复1生命',teleport:'选择高亮空陆地传送',discard:'选择超限手牌弃置'};
type Overlay='rules'|'log'|'discard'|null;

export default function OnlineBoard({snapshot:s,send,busy,onRematch,animations,onToggleAnimations}:{snapshot:Snapshot;send:(intent:Intent)=>void;busy:boolean;onRematch:()=>void;animations:boolean;onToggleAnimations:()=>void}) {
 const game=s.game!,me=game.players[s.seat],choice=game.choice,deferred=game.version==='web-v0.1.2',walked=(game.movement?.path.length??1)>1;
 const [selected,setSelected]=useState<string|null>(null),[targets,setTargets]=useState<number[]>([]),[discard,setDiscard]=useState<string[]>([]);
 const [now,setNow]=useState(s.serverTime),[reference,setReference]=useState<string|null>(null),[assets,setAssets]=useState<Record<string,string>>({});
 const [overlay,setOverlay]=useState<Overlay>(null),[notice,setNotice]=useState<{id:number;text:string;urgent:boolean}|null>(null),[resultClosed,setResultClosed]=useState<string|null>(null);
 const [sound,setSound]=useState(false),[soundError,setSoundError]=useState('');
 const audio=useRef<AudioContext|null>(null),soundEnabled=useRef(false),cursor=useRef<Parameters<typeof nextFeedback>[0]>(null),noticeSerial=useRef(0);
 useEffect(()=>{setSelected(null);setTargets([]);setDiscard([]);},[game.revision,s.matchId]);
 useEffect(()=>{const start=performance.now();setNow(s.serverTime);const t=setInterval(()=>setNow(s.serverTime+performance.now()-start),150);return()=>clearInterval(t);},[s.serverTime]);
 useEffect(()=>{const controller=new AbortController();void fetch('/references/index.json',{signal:controller.signal}).then(r=>r.json()).then(setAssets).catch(()=>{});return()=>controller.abort();},[]);
 useEffect(()=>()=>{void audio.current?.close();},[]);
 useEffect(()=>{
  const feedback=nextFeedback(cursor.current,s.matchId,game,s.seat);cursor.current=feedback.cursor;
  if(feedback.message){
   setNotice({id:++noticeSerial.current,text:feedback.message,urgent:feedback.urgent});
   if(soundEnabled.current&&audio.current?.state==='running'){
    const context=audio.current,oscillator=context.createOscillator(),gain=context.createGain();oscillator.connect(gain);gain.connect(context.destination);
    oscillator.frequency.value=feedback.urgent?740:520;gain.gain.setValueAtTime(.045,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.18);oscillator.start();oscillator.stop(context.currentTime+.2);
   }
  }
 },[s.matchId,game.revision,s.seat]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),4500);return()=>clearTimeout(timer);},[notice]);
 const toggleSound=async()=>{
  if(sound){soundEnabled.current=false;setSound(false);return;}
  try{audio.current??=new AudioContext();await audio.current.resume();if(audio.current.state!=='running')throw Error();soundEnabled.current=true;setSound(true);setSoundError('');}
  catch{setSoundError('浏览器暂未允许播放提示音，请再次点击开启。');}
 };
 const canAct=!busy&&!game.result&&me.hp>0&&(choice?choice.actor===s.seat:game.active===s.seat);
 const def=selected?cardForVersion(definitionId(selected),game.version):null,legal=selected?game.actions.targets[selected]??[]:[];
 const seatName=(i:number)=>`${s.members[i]?.name??`S${i+1}`} · ${CHARACTERS[game.players[i].character].name}`;
 const publicText=(text:string)=>text.replace(/S([1-4])(?=\s)/g,(_,n:string)=>`${s.members[Number(n)-1]?.name??`S${n}`}（S${n}）`);
 const toggle=(i:number)=>{if(!canAct||!def||!legal.includes(i))return;setTargets(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i].slice(-(def.group?(deferred?3:2):1)));};
 const remaining=choice?choice.deadline-now:game.clock.remaining-(game.clock.since===null?0:now-game.clock.since);
 const latest=latestAction(game.events),cue=attention(game,s.seat);
 const result=game.result,resultOpen=Boolean(result&&resultClosed!==s.matchId&&!overlay&&!reference);
 const buttonDisabled=!canAct;
 return <div className="online-board">
  <section className={`match-status ${cue?'your-turn':''}`} aria-label="当前行动状态">
   <div><strong>{result?'对局结束':cue?cue.text:choice?`等待 ${s.members[choice.actor]?.name} 选择`:`${s.members[game.active]?.name} 行动中`}</strong><span>第 {game.round}/12 轮 · {game.mode==='ffa'?'各自为战':'双人同盟'}</span></div>
   <b className={remaining<10000?'urgent':''} aria-label="剩余操作时间">{result?'—':`${Math.ceil(Math.max(0,remaining)/1000)}s`}</b>
   <nav aria-label="对局工具"><button aria-pressed={sound} onClick={()=>void toggleSound()}>{sound?'提示音：开':'开启提示音'}</button><button onClick={()=>setOverlay('log')}>日志</button><button onClick={()=>setOverlay('rules')}>规则</button>{result&&<button onClick={()=>setResultClosed(null)}>结算</button>}</nav>
  </section>
  <div className="latest-action" role="status" aria-live="polite"><span>最新动作</span><p>{latest?publicText(latest.text):'等待玩家行动'}</p><button aria-label="查看完整动作日志" onClick={()=>setOverlay('log')}>展开</button></div>
  <section className="compact-roster" aria-label="战场玩家">{game.players.map(p=><article key={p.seat} className={`compact-player ${p.seat===game.active&&!result?'active':''} ${p.hp===0?'eliminated':''} ${targets.includes(p.seat)?'targeted':''}`}>
   <div><span className={`seat seat-${p.seat}`}>S{p.seat+1}</span><strong title={s.members[p.seat]?.name}>{s.members[p.seat]?.name}{p.seat===s.seat?' · 你':''}</strong><i className={s.members[p.seat]?.online?'online-dot':'offline-dot'} title={s.members[p.seat]?.online?'在线':'离线'}/></div>
   <button className="compact-character" onClick={()=>setReference(p.character)}>{CHARACTERS[p.character].name} <small>{game.mode==='team'?`${p.team}队`:p.hp===0?'淘汰':''}</small></button>
   <p><span title="生命">♥ {p.hp}/{p.maxHp}</span><span title="行动点">AP {p.ap}</span><span title="护盾">◇ {p.shield}</span><span title="手牌数">▤ {p.handCount}</span></p>
   {canAct&&legal.includes(p.seat)&&<button className="compact-target" aria-pressed={targets.includes(p.seat)} onClick={()=>toggle(p.seat)}>{targets.includes(p.seat)?'已选目标 ✓':'选择目标'}</button>}
  </article>)}</section>
  <section className="compact-map" aria-label="校园战场">
   <div className="map-status"><span>安全 {game.safe.length} 格 · 轰炸：<b>{game.bomb??'无'}</b></span><span>下轮：安全 {game.round<12?safeCells(game.round+1).length:'—'} 格 · 轰炸 {game.forecast?.bomb??'未预告'}</span></div>
   <div className="compact-grid" role="grid" aria-label="32格校园棋盘">{CELLS.map(cell=>{
    const occupants=game.players.filter(p=>p.hp>0&&p.cell===cell.id),safe=game.safe.includes(cell.id),bomb=game.bomb===cell.region;
    const teleport=canAct&&choice?.kind==='teleport'&&choice.cells?.includes(cell.id),step=canAct&&!choice&&game.actions.steps.includes(cell.id),target=occupants.find(p=>legal.includes(p.seat));
    const description=`${cell.id} ${cell.region} ${safe?'安全':'毒圈'}${bomb?' 轰炸':''} ${cell.terrain==='water'?'水域，进入耗2步':'陆地'}${occupants.map(p=>` ${seatName(p.seat)}，生命${p.hp}，AP${p.ap}`).join('')}${teleport?' 可传送':step?' 可移动':''}`;
    return <button role="gridcell" data-region={cell.region} key={cell.id} aria-label={description} title={description} className={`cell ${cell.terrain} ${!safe?'poison':''} ${bomb?'bombed':''} ${teleport||step?'reachable':''} ${target&&canAct?'targetable':''} ${occupants.some(p=>targets.includes(p.seat))?'picked':''}`} onClick={()=>{if(teleport)send({type:'choose',choice:choice!.id,cell:cell.id});else if(step)send({type:'step',path:[cell.id]});else if(target)toggle(target.seat);}}>
     <span className="cell-coord">{cell.id}</span><span className="region-name">{cell.region}</span><span className="map-markers" aria-hidden="true">{!safe?'☠':''}{bomb?'✹':''}{cell.terrain==='water'?'≈':''}</span><span className="pieces">{occupants.map(p=><span key={p.seat} className={`piece seat-${p.seat}`} title={seatName(p.seat)}>S{p.seat+1}</span>)}</span>
    </button>;
   })}</div>
  </section>
  <section className="compact-hand" aria-label="你的手牌"><header><strong>{me.hp===0?'你已淘汰':'你的手牌'} · {me.handCount} 张</strong><span>AP {me.ap} · 攻击 {me.attacks}/2 · 移动{me.moved?'已用':'可用'}</span><button onClick={()=>setOverlay('discard')}>牌堆 {game.deckCount} / 弃牌 {game.discard.length}</button></header>
   <div className="compact-cards" tabIndex={0} aria-label="左右滑动查看手牌">{(me.hand??[]).map(card=>{
    const d=cardForVersion(definitionId(card),game.version),enabled=canAct&&(choice?.kind==='discard'||(choice?.kind==='response'?choice.cards?.includes(card):!choice&&game.phase==='action'&&d.type!=='response'));
    return <button key={card} className={`compact-card ${!enabled?'unavailable':''} ${selected===card||discard.includes(card)?'selected':''}`} aria-label={`${d.name}，${d.cost} AP，${d.text}${enabled?'':'，点击查看牌面'}`} title={d.text} aria-pressed={selected===card||discard.includes(card)} onClick={()=>{
     if(!enabled){setReference(d.id);return;}
     if(choice?.kind==='response')send({type:'choose',choice:choice.id,card});
     else if(choice?.kind==='discard')setDiscard(prev=>prev.includes(card)?prev.filter(x=>x!==card):[...prev,card]);
     else{setSelected(selected===card?null:card);setTargets([]);}
    }}><span>{d.type==='attack'?'攻击':d.type==='food'?'补给':'响应'}<b>{d.cost} AP</b></span><strong>{d.name}</strong><small>{d.text}</small></button>;
   })}{!me.hand?.length&&<p className="empty">暂无手牌</p>}</div>
  </section>
  <section className="compact-actions" aria-label="操作区">
   <div className="action-context" role="status">{soundError||(!canAct?(result?'本局已结束':busy?'等待操作确认或连接恢复':me.hp===0?'你已淘汰，可继续查看战场':'等待其他玩家行动'):choice?`${labels[choice.kind]}${choice.kind==='discard'?` · 已选 ${discard.length}/${choice.count}`:''}`:game.phase==='moving'?`剩余 ${game.movement?.remaining} 步 · ${deferred?(walked?'结束时扣1 AP':'未走可取消；移动次数已用'):'点击高亮格移动'}`:def?`${def.name}：${def.text}${def.type==='attack'?` · 已选 ${targets.length} 个目标`:''}`:'选择手牌出牌，或移动、结束行动。')}</div>
   <div className="compact-buttons">{result?<><button className="primary" onClick={onRematch}>再来一局</button><button onClick={()=>setResultClosed(null)}>查看结算</button></>:me.hp<=0||(choice?choice.actor!==s.seat:game.active!==s.seat)?<span className="waiting-action">{me.hp<=0?'可查看角色和日志':'可左右滑动手牌，点击查看牌面'}</span>:choice?<>
    {choice.kind==='discard'?<button className="primary" disabled={buttonDisabled||discard.length!==choice.count} onClick={()=>send({type:'choose',choice:choice.id,cards:discard})}>确认弃置 {discard.length}/{choice.count}</button>:choice.kind==='response'?<button disabled={buttonDisabled} onClick={()=>send({type:'choose',choice:choice.id,card:null})}>不响应</button>:choice.kind==='teleport'?<button disabled={buttonDisabled} onClick={()=>send({type:'choose',choice:choice.id,cell:null})}>放弃传送</button>:<><button disabled={buttonDisabled} onClick={()=>send({type:'choose',choice:choice.id,accept:false})}>放弃</button><button className="primary" disabled={buttonDisabled} onClick={()=>send({type:'choose',choice:choice.id,accept:true})}>确认发动</button></>}
   </>:game.phase==='moving'?<><button className="primary" disabled={buttonDisabled} onClick={()=>send({type:'stop'})}>{deferred?(walked?'结束移动 · 扣1 AP':'取消移动 · 不扣AP'):'结束移动'}</button><button disabled={buttonDisabled} onClick={()=>send({type:'end'})}>结束行动</button></>:<>
    <button disabled={buttonDisabled||game.phase!=='action'||me.moved||me.ap<1} onClick={()=>send({type:'move'})}>{deferred?'移动 · 结束扣1 AP':'移动 · 1 AP'}</button>
    {def&&<><button onClick={()=>setReference(def.id)}>牌面</button><button className="primary" disabled={buttonDisabled||me.ap<def.cost||(def.type==='attack'&&(!targets.length||me.attacks>=2))} onClick={()=>send({type:'play',card:selected!,targets})}>确认出牌{targets.length?` · ${targets.map(t=>`S${t+1}`).join('、')}`:''}</button></>}
    <button disabled={buttonDisabled} onClick={()=>send({type:'end'})}>结束行动 →</button>
   </>}</div>
  </section>
  {notice&&!resultOpen&&!overlay&&!reference&&<div className={`action-toast ${notice.urgent?'attention-toast':''}`} role="status" aria-live={notice.urgent?'assertive':'polite'} key={notice.id}><strong>{notice.urgent?'请操作':'战场动态'}</strong><p>{publicText(notice.text)}</p><button aria-label="关闭动作提示" onClick={()=>setNotice(null)}>×</button></div>}
  {overlay&&<Dialog title={overlay==='rules'?'游戏规则':overlay==='log'?'公开动作日志':'牌堆与公开弃牌'} onClose={()=>setOverlay(null)}>
   {overlay==='rules'?<div className="online-rules"><p>规则版本 {game.version}。四人各自为战或随机 2 对 2。</p><button aria-pressed={animations} onClick={onToggleAnimations}>{animations?'关闭对局动画':'开启对局动画'}</button><h3>行动与移动</h3><p>{deferred?'每次主动出牌成功时立即重置60秒；弃牌20秒，其他选择通常10秒。':'行动预算60秒，选择通常10秒。'}断线继续计时。每回合最多两张攻击牌、一次基础移动。{deferred?'移动先掷骰获得1—3步，结束时扣1 AP；未走可取消或超时结束，不扣AP但移动次数已用。走出后返回起点仍扣费。':'移动先支付1 AP，再掷骰获得1—3步；放弃不退款。'}上下左右移动，水域耗 2 步，可经过角色但不能停在占用格。</p><h3>手牌与战斗</h3><p>点击手牌查看效果，再选择高亮玩家并确认出牌。响应时选择手牌或“不响应”。自己的行动结束时，手牌上限为当前生命向下取整。点击玩家角色名可查看能力。</p><h3>环境与胜负</h3><p>安全区依轮次缩小，轰炸区域提前预告。☠ 为毒圈，✹ 为轰炸，≈ 为水域。环境伤害不受普通护盾抵挡。最后一人或一队获胜；第 12 轮结束按规则判分，同批次淘汰或同分可并列。</p><p><a href={`https://github.com/NoobPvPerL/monkey-legend/blob/main/docs/${deferred?'web-rules-v0.1.2.md':'web-rules-v0.1.md'}`} target="_blank" rel="noreferrer">查看完整规则</a></p></div>:overlay==='log'?<div className="compact-log">{[...game.events].reverse().map(event=><p key={event.seq}><span>#{event.seq}</span> {publicText(event.text)}</p>)}</div>:<><p>抽牌堆 {game.deckCount} 张 · 弃牌堆 {game.discard.length} 张 · 结算区 {game.resolving.length} 张</p>{game.discard.length?game.discard.map(card=><p key={card}>{cardForVersion(definitionId(card),game.version).name}</p>):<p>暂无公开弃牌</p>}</>}
  </Dialog>}
  {reference&&<Dialog title={reference.startsWith('character')?CHARACTERS[reference as keyof typeof CHARACTERS].name:CARDS[reference as keyof typeof CARDS].name} onClose={()=>setReference(null)}><div className="online-reference">{assets[reference]&&<img src={assets[reference]} alt="原始牌面参考"/>}<p>{reference.startsWith('character')?CHARACTERS[reference as keyof typeof CHARACTERS].text:cardForVersion(reference as keyof typeof CARDS,game.version).text}</p><small>执行费用、范围与效果以 {game.version} 为准。</small></div></Dialog>}
  {resultOpen&&result&&<Dialog title={result.winners.length?'本局结算':'本局平局'} className="settlement-dialog" onClose={()=>setResultClosed(s.matchId)}><p>{result.reason==='round-limit'?'达到第 12 轮，按存活、生命比例、击杀和伤害判分。':result.reason==='draw'?'同批次全体淘汰，本局平局。':'最后存活的玩家或队伍获胜。'}同批次淘汰或同分可并列。</p><ol className="settlement-ranking">{result.ranking.map(row=><li key={row.label}><b>#{row.rank}</b><div><strong>{row.players.map(i=>s.members[i]?.name??`S${i+1}`).join(' / ')}{game.mode==='team'?` · ${row.label}`:''}</strong><span>生命 {row.hp}/{row.maxHp} · 击杀 {row.kills} · 伤害 {row.damage}</span></div></li>)}</ol><div className="settlement-actions"><button className="primary" onClick={onRematch}>再来一局 · 返回准备</button><button onClick={()=>setResultClosed(s.matchId)}>查看战场</button></div><p className="settlement-note">原房间码和成员保留。返回准备后，四人重新准备，由房主开始。</p></Dialog>}
 </div>;
}
