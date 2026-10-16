import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
export async function startLocalServer({root,port=5180,attempts=20}) {
 if(!Number.isInteger(port)||port<0||port>65535||!Number.isInteger(attempts)||attempts<1)throw Error('端口设置无效');
 const base=await realpath(root);
 if(!(await stat(resolve(base,'index.html'))).isFile())throw Error('缺少游戏入口index.html');
 const inside=path=>path.startsWith(base+sep);
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');res.writeHead(405).end();return;}
  try{
   const path=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   if(path.includes('\0')||path.includes('\\')||path.includes(':')){res.writeHead(400).end();return;}
   const file=resolve(base,'.'+(path==='/'?'/index.html':path));
   if(!inside(file)){res.writeHead(403).end();return;}
   const physical=await realpath(file);
   if(!inside(physical)){res.writeHead(403).end();return;}
   const info=await stat(physical);
   if(!info.isFile()){res.writeHead(404).end();return;}
   const bytes=await readFile(physical);
   res.writeHead(200,{'Content-Type':types[extname(physical).toLowerCase()]??'application/octet-stream','Content-Length':bytes.length});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){res.writeHead(error.code==='ENOENT'||error.code==='ENOTDIR'?404:error instanceof URIError?400:500).end();}
 });
 for(let offset=0;offset<attempts&&port+offset<=65535;offset++){
  try{
   await new Promise((ok,bad)=>{
    const failed=error=>{server.removeListener('listening',ready);bad(error);};
    const ready=()=>{server.removeListener('error',failed);ok();};
    server.once('error',failed);server.once('listening',ready);server.listen(port===0?0:port+offset,'127.0.0.1');
   });
   const address=server.address();return {server,url:`http://127.0.0.1:${address.port}/`};
  }catch(error){if(error.code!=='EADDRINUSE'||offset===attempts-1)throw error;}
 }
 throw Error('没有可用的本地端口');
}
