import {useEffect,useRef,useState} from 'react';
import type {Socket} from 'socket.io-client';
import type {ChatCommand,ChatMessage,ChatPacket,ChatReply,RoomSnapshot} from '../../../packages/online/src/protocol';
import {chatSchema} from '../../../packages/online/src/protocol';
import Dialog from './Dialog';

interface PendingMessage {command:Extract<ChatCommand,{op:'send'}>;createdAt:number}
export default function RoomChat({transport,room,connected}:{transport:Socket|null;room:RoomSnapshot;connected:boolean}) {
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[messages,setMessages]=useState<ChatMessage[]>([]),[bullets,setBullets]=useState<ChatMessage[]>([]);
 const [error,setError]=useState(''),[pending,setPending]=useState<PendingMessage|null>(null),[uncertain,setUncertain]=useState(false),[danmaku,setDanmaku]=useState(true);
 const seen=useRef(new Set<number>()),generation=useRef(0),sending=useRef(false),pendingRef=useRef<PendingMessage|null>(null),enabled=useRef(true),list=useRef<HTMLDivElement>(null),follow=useRef(true);
 const storageKey=`monkey-legend-p2-chat:${room.roomId}:${room.memberId}`;
 enabled.current=danmaku;
 const receive=(incoming:ChatMessage[],history:boolean)=>{
  const fresh=incoming.filter(m=>!seen.current.has(m.seq));for(const m of incoming)seen.current.add(m.seq);
  setMessages(old=>[...new Map([...old,...incoming].map(m=>[m.seq,m])).values()].sort((a,b)=>a.seq-b.seq).slice(-200));
  if(!history&&enabled.current&&fresh.length)setBullets(old=>[...old,...fresh].slice(-3));
 };
 const flush=(value=pendingRef.current)=>{
  if(!value||!transport?.connected||!connected||sending.current)return;
  if(Date.now()-value.createdAt>86400000){sessionStorage.removeItem(storageKey);pendingRef.current=null;setPending(null);setUncertain(false);setError('消息已超过恢复期限，请检查聊天记录后再发送。');return;}
  const current=generation.current;sending.current=true;setUncertain(false);
  transport.timeout(15000).emit('chat',value.command,(failure:Error|null,reply:ChatReply)=>{
   if(current!==generation.current)return;sending.current=false;
   if(failure||!reply||/尚未确认/.test(reply.error??'')){setUncertain(true);setError('消息结果尚未确认，可以重试原消息；游戏操作不受影响。');return;}
   pendingRef.current=null;setPending(null);setUncertain(false);sessionStorage.removeItem(storageKey);
   if(reply.ok){setError('');setDraft('');if(reply.message)receive([reply.message],false);}else setError(reply.error??'消息未发送');
  });
 };
 useEffect(()=>{
  const current=++generation.current;sending.current=false;seen.current=new Set();setMessages([]);setBullets([]);
  if(!transport||!connected)return;
  const packet=(value:ChatPacket)=>receive(value.messages,value.history);transport.on('chat-messages',packet);
  transport.timeout(15000).emit('chat',{op:'list'},(failure:Error|null,reply:ChatReply)=>{
   if(current!==generation.current)return;if(!failure&&reply?.ok&&reply.messages)receive(reply.messages,true);
  });
  try{const raw=sessionStorage.getItem(storageKey);const value=raw?JSON.parse(raw) as PendingMessage:null;if(value&&(!chatSchema.safeParse(value.command).success||value.command.op!=='send'||!Number.isFinite(value.createdAt)))throw Error('Invalid saved message');pendingRef.current=value;setPending(value);if(value){setDraft(value.command.text);flush(value);}}
  catch{pendingRef.current=null;setPending(null);setError('无法读取待确认消息，请检查聊天记录后再发送。');}
  return()=>{generation.current++;transport.off('chat-messages',packet);};
 },[transport,connected,room.roomId,room.memberId,room.epoch]);
 useEffect(()=>{if(!bullets.length)return;const timer=setTimeout(()=>setBullets([]),6000);return()=>clearTimeout(timer);},[bullets]);
 useEffect(()=>{if(open&&list.current&&follow.current)list.current.scrollTop=list.current.scrollHeight;},[open,messages]);
 const submit=()=>{
  const text=draft.trim();if(pendingRef.current||!connected)return;
  if(!text||Array.from(text).length>200||/[\x00-\x1f\x7f]/.test(text)){setError('请输入1至200字，不含控制字符。');return;}
  const value:PendingMessage={command:{op:'send',requestId:crypto.randomUUID(),text},createdAt:Date.now()};
  try{sessionStorage.setItem(storageKey,JSON.stringify(value));pendingRef.current=value;setPending(value);setError('');flush(value);}catch{setError('无法保存待确认消息，请允许本站存储。');}
 };
 return <>
  <button className="chat-launcher" onClick={()=>{follow.current=true;setOpen(true);}}>聊天</button>
  {danmaku&&<div className="danmaku-layer" aria-hidden="true">{bullets.map((message,index)=><div className="chat-bullet" style={{top:`${index*36}px`}} key={message.seq} onAnimationEnd={()=>setBullets(old=>old.filter(m=>m.seq!==message.seq))}>{message.name}{message.kind==='spectator'?'（观众）':`（S${message.seat!+1}）`}：{message.text}</div>)}</div>}
  {open&&<Dialog title="房间聊天" className="chat-dialog" onClose={()=>setOpen(false)}><div className="chat-controls"><span>每2秒可发一条 · 最多200字</span><button aria-pressed={danmaku} onClick={()=>{setDanmaku(!danmaku);if(danmaku)setBullets([]);}}>{danmaku?'关闭弹幕':'开启弹幕'}</button></div>
   <div className="chat-history" ref={list} role="log" aria-label="房间聊天记录" onScroll={()=>{if(list.current)follow.current=list.current.scrollHeight-list.current.scrollTop-list.current.clientHeight<40;}}>{messages.length?messages.map(message=><article key={message.seq} className={message.authorId===room.memberId?'own-message':''}><strong>{message.name}<small>{message.kind==='spectator'?'观众':`S${message.seat!+1}`}</small></strong><p>{message.text}</p></article>):<p className="subtle">暂无消息。玩家与观众均可在这里聊天。</p>}</div>
   {error&&<p className="chat-error" role="alert">{error}</p>}{uncertain&&<button disabled={!connected||sending.current} onClick={()=>flush()}>重试原消息</button>}
   <form className="chat-form" onSubmit={event=>{event.preventDefault();submit();}}><label>消息<input aria-label="聊天消息" value={draft} disabled={Boolean(pending)} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&event.nativeEvent.isComposing)event.preventDefault();}} placeholder="输入文字后发送" autoComplete="off"/></label><button className="primary" type="submit" disabled={!connected||Boolean(pending)||!draft.trim()}>{pending?'待确认':'发送'}</button></form>
  </Dialog>}
 </>;
}
