import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {Server} from 'socket.io';
import {attachSchema,commandSchema,chatSchema} from '../../../packages/online/src/protocol';
import {APPLICATION_VERSION,CURRENT_RULE_VERSION,REQUIRED_ENGINE_REVISION,databaseReady} from '../../../packages/online/src/version';
import type {DatabaseRequirement} from '../../../packages/online/src/version';
import type {Credential,RoomReply,Rpc,RoomSnapshot,ChatReply,ChatPacket} from '../../../packages/online/src/protocol';

interface Options {rpc:Rpc;origin:string;staticDir?:string;pollMs?:number;maintenanceMs?:number;allowLoopback?:boolean;databaseRequirement?:DatabaseRequirement}
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp'};
export function createGateway(options:Options) {
 const root=resolve(options.staticDir??'dist');let stopping=false;
 const http=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  try {
   const path=new URL(req.url??'/', 'http://localhost').pathname;
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
   if(path==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:!stopping,version:APPLICATION_VERSION,ruleVersion:CURRENT_RULE_VERSION,requiredEngineRevision:REQUIRED_ENGINE_REVISION}));return;}
   if(path==='/ready') {const ok=databaseReady(await options.rpc('ml_health',{}),options.databaseRequirement);res.writeHead(ok?200:503,{'Content-Type':'application/json'}).end(JSON.stringify({ok}));return;}
   const decoded=decodeURIComponent(path);const file=resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
   if(!file.startsWith(root+sep)||!types[extname(file)]||(await stat(file)).isDirectory()){res.writeHead(404).end();return;}
   const body=await readFile(file);res.setHeader('Content-Type',types[extname(file)]);res.writeHead(200);res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(req.url==='/ready'?503:404).end();}
 });
 const permitted=(origin:string|undefined)=>!origin||origin===options.origin||(options.allowLoopback===true&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin));
 const io=new Server(http,{maxHttpBufferSize:16384,transports:['polling','websocket'],allowRequest:(req,done)=>done(null,!stopping&&permitted(req.headers.origin)),cors:{origin:(origin,done)=>done(null,permitted(origin))}});
 const tasks=new Set<Promise<unknown>>();
 const track=<T>(p:Promise<T>)=>{tasks.add(p);void p.finally(()=>tasks.delete(p)).catch(()=>{});return p;};
 io.on('connection',socket=>{
  let bound:(Credential&{epoch:number;kind:'player'|'spectator'})|null=null,latest:RoomSnapshot|null=null,busy=false,closed=false;
  let chatAfter:number|undefined;
  const identity=()=>bound?{name:bound.name,token:bound.token,roomId:bound.roomId,epoch:bound.epoch}:null;
  const roomRpc=()=>bound?.kind==='spectator'?'ml_watch' as const:'ml_room' as const;
  let queue=Promise.resolve();let queued=0,attaching=false;
  const serial=(job:()=>Promise<void>)=>{queued++;const run=queue.then(job).finally(()=>{queued--;});queue=run.catch(()=>{});return track(run);};
  const fence=(message:string)=>{if(closed)return;closed=true;bound=null;socket.emit('revoked',{error:message});socket.disconnect(true);};
  const publish=(reply:RoomReply)=>{
   if(reply.snapshot){latest=reply.snapshot;socket.emit('snapshot',latest);}
   if(!reply.ok&&/接管|凭据|座位|已关闭|不存在/.test(reply.error??''))fence(reply.error!);
  };
  socket.on('attach',(input:unknown,ack:unknown)=>{
   if(typeof ack!=='function')return;const respond=ack as (r:RoomReply)=>void;
   const parsed=attachSchema.safeParse(input);
   if(!parsed.success||bound||attaching||closed){respond({ok:false,error:'入房请求无效或已经连接'});return;}
   attaching=true;
   void serial(async()=>{
    try {
     const watching=parsed.data.op==='watch'||parsed.data.op==='watch-resume';
     const method=watching?'ml_watch':'ml_room';
     const input={...parsed.data,op:parsed.data.op==='watch'?'join':parsed.data.op==='watch-resume'?'resume':parsed.data.op};
     let reply=await options.rpc(method,{p_request:input}) as RoomReply;
     // An intake retry can follow a lost acknowledgement. Fence the former
     // connection before binding this socket, just as an explicit resume does.
     if(reply.ok&&reply.snapshot&&!['resume','watch-resume'].includes(parsed.data.op))reply=await options.rpc(method,{p_request:{op:'resume',name:parsed.data.name,token:parsed.data.token,roomId:reply.snapshot.roomId}}) as RoomReply;
     if(reply.ok&&reply.snapshot){bound={name:parsed.data.name,token:parsed.data.token,roomId:reply.snapshot.roomId,epoch:reply.snapshot.epoch,kind:watching?'spectator':'player'};chatAfter=undefined;publish(reply);}
     respond(reply);
    }catch{respond({ok:false,error:'连接结果尚未确认，请重试原入房请求'});}
    finally{attaching=false;}
   });
  });
  socket.on('command',(input:unknown,ack:unknown)=>{
   if(typeof ack!=='function')return;const respond=ack as (r:RoomReply)=>void;const parsed=commandSchema.safeParse(input);
   if(!parsed.success||!bound||closed||queued>=8){respond({ok:false,error:'操作格式无效、尚未入房或请求过多'});return;}
   void serial(async()=>{
    if(!bound||closed){respond({ok:false,error:'连接已失效'});return;}
    try {
     if(bound.kind==='spectator'&&parsed.data.op!=='watch-leave'||bound.kind==='player'&&parsed.data.op==='watch-leave'){respond({ok:false,error:'观众不能操作玩家座位'});return;}
     const payload=parsed.data.op==='watch-leave'?{op:'leave',requestId:parsed.data.requestId}:parsed.data;
     const reply=await options.rpc(roomRpc(),{p_request:{...identity(),...payload}}) as RoomReply;
     if(reply.left&&reply.ok){bound=null;latest=null;}
     else publish(reply);
     respond(reply);
    }catch{respond({ok:false,error:'操作结果尚未确认，请重试原请求'});}
   });
  });
  socket.on('chat',(input:unknown,ack:unknown)=>{
   if(typeof ack!=='function')return;const respond=ack as (r:ChatReply)=>void,parsed=chatSchema.safeParse(input);
   if(!parsed.success||!bound||closed||queued>=8){respond({ok:false,error:'聊天请求无效、尚未入房或请求过多'});return;}
   void serial(async()=>{if(!bound||closed){respond({ok:false,error:'连接已失效'});return;}try{
    const reply=await options.rpc('ml_chat',{p_request:{...identity(),kind:bound.kind,...parsed.data}}) as ChatReply;
    if(!reply.ok&&/接管|凭据|已关闭|不存在/.test(reply.error??''))fence(reply.error!);respond(reply);
   }catch{respond({ok:false,error:'消息结果尚未确认，请重试原请求'});}});
  });
  const timer=setInterval(()=>{
   if(!bound||busy||closed||queued)return;busy=true;
   void serial(async()=>{try{if(bound&&!closed){
    publish(await options.rpc(roomRpc(),{p_request:{...identity(),op:'view'}}) as RoomReply);
    if(bound&&!closed){const history=chatAfter===undefined;const chat=await options.rpc('ml_chat',{p_request:{...identity(),kind:bound.kind,op:'list',...(chatAfter===undefined?{}:{after:chatAfter})}}) as ChatReply;
     if(chat.ok&&Array.isArray(chat.messages)){chatAfter=chat.lastSeq??chatAfter??0;socket.emit('chat-messages',{history,messages:chat.messages,lastSeq:chatAfter} satisfies ChatPacket);}
     else if(!chat.ok&&/接管|凭据|已关闭|不存在/.test(chat.error??''))fence(chat.error!);
    }
   }}catch{socket.emit('availability',{ok:false});}finally{busy=false;}});
  },options.pollMs??2000);timer.unref();
  socket.on('disconnect',()=>{
   clearInterval(timer);const identity=bound;closed=true;
   void serial(async()=>{const current=bound??identity;bound=null;if(current)try{await options.rpc(current.kind==='spectator'?'ml_watch':'ml_room',{p_request:{name:current.name,token:current.token,roomId:current.roomId,epoch:current.epoch,op:'offline'}});}catch{/* DB lastSeen bounds lobby reservations if the process stops here. */}});
  });
 });
 let sweeping=false;
 const maintenance=setInterval(()=>{if(sweeping)return;sweeping=true;void track(options.rpc('ml_maintenance',{p_limit:20}).catch(()=>{}).finally(()=>{sweeping=false;}));},options.maintenanceMs??30000);maintenance.unref();
 return {http,io,close:async()=>{stopping=true;clearInterval(maintenance);await new Promise<void>(done=>io.close(()=>done()));await Promise.allSettled([...tasks]);}};
}
