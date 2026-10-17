import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {io} from 'socket.io-client';
import type {Socket} from 'socket.io-client';
import type {Attachment,Credential,Intent,OnlineCommand,RoomReply,RoomSnapshot} from '../../../packages/online/src/protocol';
import OnlineBoard from './OnlineBoard';
import DraftBoard from './DraftBoard';
import type {DraftPickIntent} from '../../../packages/online/src/draft-protocol';
import SpectatorBoard from './SpectatorBoard';
import RoomChat from './RoomChat';
import MatchEffects from './MatchEffects';
import Dialog from './Dialog';
import {commandError,prepareGameCommand,prepareDraftCommand} from './interaction-guards';
import './style.css';
import './online.css';
const LocalTable=lazy(()=>import('./LocalTable'));
const key='monkey-legend-p2-credentials',intakeKey='monkey-legend-p2-intake';
interface Saved extends Credential {code:string}
function saved():Saved[]{try{return JSON.parse(localStorage.getItem(key)??'[]');}catch{return [];}}
function store(c:Saved){localStorage.setItem(key,JSON.stringify([...saved().filter(x=>x.roomId!==c.roomId||x.name.toLowerCase()!==c.name.toLowerCase()),c]));}
function forget(c:Credential){localStorage.setItem(key,JSON.stringify(saved().filter(x=>x.roomId!==c.roomId||x.name.toLowerCase()!==c.name.toLowerCase())));}
const freshToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
function App(){
 const [name,setName]=useState(''),[confirmed,setConfirmed]=useState(false),[code,setCode]=useState(''),[local,setLocal]=useState(false),[attachment,setAttachment]=useState<Attachment|null>(null),[room,setRoom]=useState<RoomSnapshot|null>(null),[error,setError]=useState(''),[connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[revoked,setRevoked]=useState(false),[records,setRecords]=useState<Saved[]>(saved);
 const [showLobby,setShowLobby]=useState(false),[showSpectators,setShowSpectators]=useState(false),[animations,setAnimations]=useState(true),[dealMatchId,setDealMatchId]=useState<string|null>(null);
 useEffect(()=>setShowLobby(false),[room?.roomId,room?.matchId]);
 const socket=useRef<Socket|null>(null),credential=useRef<Credential|null>(null),pending=useRef<OnlineCommand|null>(null),sending=useRef(false),snapshot=useRef<RoomSnapshot|null>(null),pendingKey=useRef('');
 const acceptedAt=useRef(performance.now());
 const accept=(s:RoomSnapshot)=>{const old=snapshot.current;if(old?.roomId===s.roomId&&(s.epoch<old.epoch||s.roomRevision<old.roomRevision||s.serverTime<old.serverTime))return;if(old?.roomId===s.roomId&&s.matchId&&old.matchId!==s.matchId)setDealMatchId(s.matchId);snapshot.current=s;acceptedAt.current=performance.now();setRoom(s);};
 const clearPending=()=>{pending.current=null;if(pendingKey.current)sessionStorage.removeItem(pendingKey.current);setBusy(false);setUncertain(false);};
 const leaveScreen=()=>{socket.current?.disconnect();socket.current=null;credential.current=null;snapshot.current=null;pending.current=null;pendingKey.current='';sending.current=false;setAttachment(null);setRoom(null);setConnected(false);setRevoked(false);setBusy(false);setUncertain(false);setRecords(saved());};
 const flush=()=>{
  const command=pending.current,transport=socket.current;if(!command||!transport?.connected||sending.current)return;
  sending.current=true;setBusy(true);setUncertain(false);
  transport.timeout(25000).emit('command',command,(failure:Error|null,reply:RoomReply)=>{
   if(transport!==socket.current||pending.current?.requestId!==command.requestId)return;
   sending.current=false;
   if(failure||!reply||/尚未确认/.test(reply.error??'')){setUncertain(true);setError('操作结果尚未确认。请重试原请求，确认前不会发送新操作。');return;}
   clearPending();if(reply.snapshot)accept(reply.snapshot);
   if(reply.left&&reply.ok){if(credential.current)forget(credential.current);leaveScreen();setError('已离开房间');return;}
   setError(commandError(command,reply));
  });
 };
 useEffect(()=>{
  if(!attachment)return;
  const transport=io({autoConnect:false,transports:['polling','websocket'],upgrade:true,reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:5000});socket.current=transport;
  let dead=false,attaching=false;
  const attach=()=>{
   if(dead||attaching)return;attaching=true;
   const input:Attachment=credential.current?{op:credential.current.kind==='spectator'?'watch-resume':'resume',name:credential.current.name,token:credential.current.token,roomId:credential.current.roomId}:attachment;
   transport.timeout(45000).emit('attach',input,(failure:Error|null,reply:RoomReply)=>{
    attaching=false;if(dead)return;
    if(failure||!reply||/尚未确认/.test(reply.error??'')){setError('入房结果尚未确认，正在恢复原请求');transport.disconnect().connect();return;}
    if(!reply.ok||!reply.snapshot){setError(reply.error??'入房失败');transport.disconnect();setConnected(false);return;}
    try{
     const s=reply.snapshot,c={name:attachment.name,token:attachment.token,roomId:s.roomId,kind:s.role==='spectator'?'spectator' as const:'player' as const};
     credential.current=c;store({...c,code:s.code});sessionStorage.removeItem(intakeKey);
     pendingKey.current=`monkey-legend-p2-pending:${s.roomId}:${s.memberId}`;
     const raw=sessionStorage.getItem(pendingKey.current);pending.current=raw?JSON.parse(raw):null;
     accept(s);setConnected(true);setError('');setBusy(Boolean(pending.current));if(pending.current)flush();
    }catch{setError('浏览器无法保存恢复凭据，请允许本站存储后重新连接');transport.disconnect();}
   });
  };
  transport.on('connect',()=>{attaching=false;attach();});
  transport.on('disconnect',()=>{setConnected(false);sending.current=false;attaching=false;});
  transport.on('connect_error',()=>setError('连接中断，正在重连；对局计时继续。'));
  transport.on('snapshot',(s:RoomSnapshot)=>{if(!dead)accept(s);});
  transport.on('availability',()=>setError('云端暂不可达；计时继续，连接恢复后同步。'));
  transport.on('revoked',({error:message}:{error:string})=>{setRevoked(true);setConnected(false);setError(message);transport.disconnect();});
  transport.connect();return()=>{dead=true;transport.removeAllListeners();transport.disconnect();if(socket.current===transport)socket.current=null;};
 },[attachment]);
 const send=(command:OnlineCommand)=>{if(pending.current||!connected||revoked)return;try{sessionStorage.setItem(pendingKey.current,JSON.stringify(command));pending.current=command;setBusy(true);flush();}catch{setError('无法保存待确认操作，请允许本站存储');}};
 const lobby=(op:'ready'|'mode'|'start'|'leave',extra:Record<string,unknown>={})=>{if(!room)return;send({op,requestId:crypto.randomUUID(),roomRevision:room.roomRevision,...extra} as OnlineCommand);};
 const game=(intent:Intent)=>{const latest=snapshot.current;if(!room||!latest)return;const prepared=prepareGameCommand(room,latest,intent,crypto.randomUUID(),latest.serverTime+performance.now()-acceptedAt.current);if(prepared.command)send(prepared.command);else setError(prepared.error??'请查看最新状态后重试');};
 const draft=(intent:DraftPickIntent)=>{const latest=snapshot.current;if(!room||!latest)return;const prepared=prepareDraftCommand(room,latest,intent,crypto.randomUUID(),latest.serverTime+performance.now()-acceptedAt.current);if(prepared.command)send(prepared.command);else setError(prepared.error??'请查看最新选角状态');};
 const enter=(op:'create'|'join'|'watch')=>{
  if(op!=='create'&&!/^\d{4}$/.test(code)){setError('请输入完整的4位数字房间码');return;}
  try{const input:Attachment={op,name:name.trim(),token:freshToken(),requestId:crypto.randomUUID(),...(op!=='create'?{code}:{})} as Attachment;sessionStorage.setItem(intakeKey,JSON.stringify(input));credential.current=null;setRoom(null);setAttachment(input);setError('');}catch{setError('浏览器无法保存入房凭据，请允许本站存储');}
 };
 const resume=(c:Saved)=>{credential.current=null;setAttachment({op:c.kind==='spectator'?'watch-resume':'resume',name:name.trim(),token:c.token,roomId:c.roomId});setError('');};
 const errorPanel=error&&<div className="error" role="alert">{error}<button aria-label="关闭提示" onClick={()=>setError('')}>×</button></div>;
 if(local)return <><button className="local-return" onClick={()=>setLocal(false)}>返回联机入口</button><Suspense fallback={<p>载入本地桌…</p>}><LocalTable/></Suspense></>;
 if(!room)return <main className="landing online-entry"><div className="landing-art"><span className="eyebrow">MONKEY LEGEND / FRIENDS ONLINE</span><div className="large-mark">高<br/>唐</div><span className="art-caption">十五个地点 · 三十二格战场</span></div><section className="landing-content"><span className="eyebrow">应猴传说 / P2</span><h1>应猴传说</h1>{!confirmed?<form onSubmit={e=>{e.preventDefault();const n=name.trim();if(!n||n.length>24||/[\x00-\x1f\x7f]/.test(n)){setError('请输入1至24个可见字符的玩家名');return;}setName(n);setConfirmed(true);setError('');}}><label className="online-label">本次玩家名<input autoFocus maxLength={24} value={name} onChange={e=>setName(e.target.value)} autoComplete="nickname"/></label><button className="primary start" type="submit">确认玩家名 →</button></form>:<><p>玩家：{name} <button className="link" disabled={Boolean(attachment)} onClick={()=>setConfirmed(false)}>修改</button></p><button className="primary start" disabled={Boolean(attachment)} onClick={()=>enter('create')}>创建房间 · 自动生成4位码</button><form onSubmit={e=>{e.preventDefault();enter('join');}}><label className="online-label">4位房间码<input inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={code} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,''))}/></label><button disabled={Boolean(attachment)||code.length!==4} type="submit">加入房间 →</button> <button type="button" disabled={Boolean(attachment)||code.length!==4} onClick={()=>enter('watch')}>观战 · 可看全部手牌</button></form>
  {records.filter(c=>c.name.toLowerCase()===name.toLowerCase()).map(c=><button className="restore-room" disabled={Boolean(attachment)} key={c.roomId} onClick={()=>resume(c)}>恢复{c.kind==='spectator'?'观战':'房间'} {c.code}</button>)}
  {(()=>{try{const p=JSON.parse(sessionStorage.getItem(intakeKey)??'null') as Attachment|null;return p&&p.name.toLowerCase()===name.toLowerCase()&&!attachment?<button onClick={()=>setAttachment(p)}>恢复未确认的入房请求</button>:null;}catch{return null;}})()}
  {attachment&&<><p>正在连接或等待入房确认…</p>{/已满|对局进行中/.test(error)&&<button onClick={()=>{leaveScreen();enter('watch');}}>改为观战 · 可看全部手牌</button>}<button onClick={()=>{setAttachment({...attachment});}}>重试原入房请求</button><button onClick={leaveScreen}>返回入口（保留待确认请求）</button></>}
  <button className="link" disabled={Boolean(attachment)} onClick={()=>setLocal(true)}>打开本地测试桌 / 复现工具</button></>}{errorPanel}<footer>web-v0.1.7 · 16角色 · 76种191张 · 三选一 · 四人好友房 · 各自为战 / 双人同盟<br/>同名恢复依赖本浏览器凭据；断线和关闭页面均继续计时。</footer></section></main>;
 const watching=room.role==='spectator';
 const host=!watching&&room.host===room.memberId,pre=room.status==='lobby'||room.status==='finished',disabled=busy||!connected||revoked;
 return <div className="table-app online-app"><header className="topbar"><div className="wordmark">应猴传说</div><span className="local-badge">房间 {room.code}</span><span className="online-identity" title={name}>{name} · {room.role==='spectator'?'观众':`S${room.seat+1}`}</span><span className="top-spacer"/><RoomChat transport={socket.current} room={room} connected={connected&&!revoked}/><button className="spectator-count" onClick={()=>setShowSpectators(true)}>观众 {room.spectators?.length??0}</button><span className={`connection-status ${connected?'connected':''}`} role="status">{revoked?'连接失效':connected?'已连接':'重连中'}</span><button onClick={leaveScreen}>返回入口</button></header>
  <div className="online-notices">{errorPanel}{uncertain&&<button disabled={!connected||sending.current||revoked} onClick={flush}>重试原操作</button>}{revoked&&<button onClick={leaveScreen}>返回入口</button>}</div>
  {room.game&&<MatchEffects room={room} dealMatchId={dealMatchId} enabled={animations}/>}
  {room.status==='drafting'&&room.draft&&<DraftBoard draft={room.draft} seat={watching?null:room.seat} members={room.members} serverTime={room.serverTime} busy={disabled} send={draft}/>}
  {room.role==='spectator'?room.game?<SpectatorBoard snapshot={room} animations={animations} onToggleAnimations={()=>setAnimations(!animations)}/>:room.status==='drafting'?null:<section className="room-lobby"><h2>观战席 · {room.code}</h2><p>等待玩家开局。你可以查看全部玩家手牌并参与聊天。</p><button disabled={disabled} onClick={()=>send({op:'watch-leave',requestId:crypto.randomUUID()})}>离开观战</button></section>:room.game&&!(pre&&showLobby)&&<OnlineBoard snapshot={room} send={game} busy={disabled} onRematch={()=>setShowLobby(true)} animations={animations} onToggleAnimations={()=>setAnimations(!animations)}/>}
  {room.role==='spectator'&&room.game&&<button className="watch-leave" disabled={disabled} onClick={()=>send({op:'watch-leave',requestId:crypto.randomUUID()})}>离开观战</button>}
  {showSpectators&&<Dialog title="观战席" onClose={()=>setShowSpectators(false)}><p>观战者可查看全部玩家手牌；不占玩家座位，可参与聊天。</p>{room.spectators?.length?room.spectators.map(viewer=><p key={viewer.id}>{viewer.name} · {viewer.online?'在线':'离线暂留'}</p>):<p>暂无观众</p>}</Dialog>}
  {room.role!=='spectator'&&pre&&(!room.game||showLobby)&&<section className="room-lobby"><h2>{room.status==='finished'?'再来一局':'好友房'} <strong className="room-code">{room.code}</strong></h2><p>四人在线并全部准备后，由房主开始。观战者可查看全部手牌。</p><div className="lobby-members">{room.members.map((m,i)=><article className="player" key={i}><span className={`seat seat-${i}`}>S{i+1}</span><h3>{m?.name??'等待加入'}</h3><p>{m?`${m.online?'在线':'离线 · 暂留座位'} · ${m.ready?'已准备':'未准备'}${m.id===room.host?' · 房主':''}`:'空座位'}</p></article>)}</div><div className="lobby-actions"><label>游戏模式 <select value={room.mode} disabled={!host||disabled} onChange={e=>lobby('mode',{mode:e.target.value})}><option value="ffa">各自为战</option><option value="team">双人同盟 · 随机2对2</option></select></label><button className="primary" disabled={disabled} onClick={()=>lobby('ready',{ready:!room.members[room.seat]?.ready})}>{room.members[room.seat]?.ready?'取消准备':'准备'}</button>{host&&<button className="primary" disabled={disabled||room.members.some(m=>!m?.online||!m.ready)} onClick={()=>lobby('start')}>开始对局</button>}{room.game&&<button onClick={()=>setShowLobby(false)}>查看上局结算</button>}<button disabled={disabled} onClick={()=>lobby('leave')}>离开房间</button></div><small>成员或模式变化会清空准备。开局前断线保留座位2分钟；断线期间继续计时。</small></section>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
