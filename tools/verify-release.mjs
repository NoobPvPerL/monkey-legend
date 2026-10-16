import {readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,sep,isAbsolute} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root=resolve(process.argv[2]??'');
if(!process.argv[2]||process.platform!=='win32')throw Error('Usage on Windows: node tools/verify-release.mjs <independently extracted game directory> [report.json]');
const manifest=JSON.parse(await readFile(join(root,'release-manifest.json'),'utf8'));
const report={version:manifest.version,sourceCommit:manifest.sourceCommit,sourceDirty:manifest.sourceDirty,directory:root,checks:[],pass:false};
const mark=name=>{report.checks.push(name);console.log(`PASS: ${name}`);};
for(const [file,info] of Object.entries(manifest.files)){
 const target=resolve(root,file);assert(!isAbsolute(file)&&target.startsWith(root+sep),'Manifest path escaped package');
 const bytes=await readFile(target);assert.equal(bytes.length,info.bytes,`Size: ${file}`);assert.equal(createHash('sha256').update(bytes).digest('hex'),info.sha256,`Hash: ${file}`);
}
mark('Every packaged file matches manifest SHA-256');
async function walk(dir,prefix=''){const files=[];for(const item of await readdir(dir,{withFileTypes:true})){const p=prefix+item.name;if(item.isDirectory())files.push(...await walk(join(dir,item.name),p+'/'));else{assert(item.isFile(),'Package must not contain symbolic links');files.push(p);}}return files;}
const actual=await walk(root);assert.deepEqual(actual.sort(),[...Object.keys(manifest.files),'release-manifest.json'].sort());
assert(actual.every(f=>f==='启动游戏.cmd'||f==='release-manifest.json'||f.startsWith('dist/')||f.startsWith('runtime/')||f.startsWith('licenses/')||['tools/start-local.mjs','tools/local-server.mjs'].includes(f)));
assert(!actual.some(f=>/(^|\/)(docs|tests|node_modules|\.git)(\/|$)/.test(f)));
assert.equal((await stat(join(root,'runtime/node.exe'))).size>1_000_000,true);mark('Only game, launcher, runtime, licenses and version manifest are included');

const cmd=join(process.env.SystemRoot??'C:\\Windows','System32','cmd.exe');
const environment={SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,ComSpec:cmd,Path:join(process.env.SystemRoot??'C:\\Windows','System32')};
const child=spawn(cmd,['/d','/s','/c','call 启动游戏.cmd --no-open --port 0'],{cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='',settled=false,servedUrl;let timer;
try{
 const url=await new Promise((ok,bad)=>{
  timer=setTimeout(()=>bad(Error(`Launcher timed out: ${output}`)),20000);
  const read=buffer=>{output+=buffer.toString('utf8');const match=output.match(/http:\/\/127\.0\.0\.1:\d+\//);if(match&&!settled){settled=true;ok(match[0]);}};
  child.stdout.on('data',read);child.stderr.on('data',read);child.once('error',bad);child.once('exit',code=>{if(!settled)bad(Error(`Launcher exited ${code}: ${output}`));});
 });
 servedUrl=url;clearTimeout(timer);mark('Windows CMD launcher starts with system Node/npm removed from PATH');
 const response=await fetch(url);assert.equal(response.status,200);const html=await response.text();assert(html.includes('应猴传说'));assert(html.includes('id="root"'));mark('Extracted game entry serves real HTML');
 const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(m=>m[1]);assert(assets.some(p=>p.endsWith('.js')));assert(assets.some(p=>p.endsWith('.css')));
 for(const path of assets)assert.equal((await fetch(new URL(path,url))).status,200);mark('Built JavaScript and CSS load');
 const references=await(await fetch(new URL('/references/index.json',url))).json();assert.equal(Object.keys(references).length,16);
 for(const path of Object.values(references)){const image=await fetch(new URL(path,url));assert.equal(image.status,200);assert(image.headers.get('content-type').startsWith('image/'));assert((await image.arrayBuffer()).byteLength>0);}mark('All 16 in-game source reference images load');
 assert.equal((await fetch(new URL('/release-manifest.json',url))).status,404);assert.equal((await fetch(url,{method:'POST'})).status,405);mark('Server exposes only built game files with read-only HTTP methods');
}finally{
 clearTimeout(timer);
 // Only terminate the exact child process tree created above; no port-based or name-based killing.
 const ended=new Promise(ok=>child.once('exit',ok));
 if(child.exitCode===null)spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 await Promise.race([ended,new Promise(ok=>setTimeout(ok,3000))]);
 report.launcherOutput=output;
 if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(report,null,2)+'\n');
}
if(servedUrl){let stopped=false;try{await fetch(servedUrl,{signal:AbortSignal.timeout(1200)});}catch{stopped=true;}assert(stopped,'Launcher process tree did not stop');mark('Stopping the test launcher also stops its game server');}
report.pass=true;
if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(report,null,2)+'\n');
console.log('PASS: independently extracted release verification complete');
