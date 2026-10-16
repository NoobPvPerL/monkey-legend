import {existsSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {startLocalServer} from './local-server.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);let port=5180,open=true,rebuild=false,explicitPort=false;
try{
 if(Number(process.versions.node.split('.')[0])!==24)throw Error('源码启动需要Node.js 24；Release游戏包已内置运行时。');
 for(let i=0;i<args.length;i++){
  if(args[i]==='--no-open')open=false;
  else if(args[i]==='--rebuild')rebuild=true;
  else if(args[i]==='--port'&&/^\d+$/.test(args[i+1]??'')){port=Number(args[++i]);explicitPort=true;}
  else throw Error(`未知启动参数：${args[i]}`);
 }
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('端口必须为0—65535的整数');
 if(rebuild||!existsSync(join(root,'dist','index.html'))){
  if(!existsSync(join(root,'package-lock.json')))throw Error('游戏文件不完整，请重新解压Release压缩包。');
  console.log('首次从源码启动：安装锁定依赖并构建游戏。');
  const run=command=>{
   const r=process.platform==='win32'?spawnSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c',command],{cwd:root,stdio:'inherit'}):spawnSync('sh',['-c',command],{cwd:root,stdio:'inherit'});
   if(r.error||r.status!==0)throw Error(`${command}失败，请检查上方日志`);
  };
  if(!existsSync(join(root,'node_modules'))||rebuild)run('npm ci');
  run('npm run build');
 }
 const {server,url}=await startLocalServer({root:join(root,'dist'),port,attempts:explicitPort?1:20});
 console.log(`应猴传说 P1 本地测试桌\n游戏地址：${url}\n关闭此窗口或按Ctrl+C停止游戏。\n本机四座轮换；尚未提供好友联机。`);
 server.on('error',error=>{console.error(error.message);process.exitCode=1;server.close();});
 if(open){
  const child=process.platform==='win32'?spawn(process.env.ComSpec??'cmd.exe',['/d','/s','/c',`start "" "${url}"`],{windowsHide:true,stdio:'ignore'}):process.platform==='darwin'?spawn('open',[url],{stdio:'ignore'}):spawn('xdg-open',[url],{stdio:'ignore'});
  child.on('error',()=>console.log(`请手动打开 ${url}`));
 }
 const stop=()=>server.close(()=>process.exit(0));process.once('SIGINT',stop);process.once('SIGTERM',stop);
}catch(error){console.error(`启动失败：${error.message}`);process.exitCode=1;}
