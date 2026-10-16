import {mkdtemp,writeFile,mkdir,rm,realpath} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {request} from 'node:http';
import {afterEach,expect,it} from 'vitest';
// @ts-expect-error Standalone .mjs is also shipped without a TypeScript toolchain.
import {startLocalServer} from '../tools/local-server.mjs';

const cleanup:(()=>Promise<unknown>)[]=[];
const testRoot=resolve(fileURLToPath(new URL('../.release-cache/server-tests/',import.meta.url)));
afterEach(async()=>{for(const fn of cleanup.reverse())await fn();cleanup.length=0;});
async function fixture(){await mkdir(testRoot,{recursive:true});const root=await mkdtemp(join(testRoot,'monkey local 中文 '));cleanup.push(async()=>{const target=await realpath(root);if(!target.startsWith(testRoot+sep))throw Error('Refusing cleanup outside test directory');await rm(target,{recursive:true,force:true});});await writeFile(join(root,'index.html'),'<h1>应猴传说</h1>');await mkdir(join(root,'assets'));await writeFile(join(root,'assets','app.js'),'console.log("game")');return root;}
async function serve(root:string,port=0,attempts=1){const result=await startLocalServer({root,port,attempts});cleanup.push(()=>new Promise<void>((ok,bad)=>result.server.close((e:Error)=>e?bad(e):ok())));return result;}
function raw(url:string,path:string){return new Promise<number>((ok,bad)=>{const r=request(new URL(url),{path},res=>{res.resume();ok(res.statusCode!);});r.on('error',bad);r.end();});}
it('本地服务器处理中文路径、HTML/JS类型、HEAD，绑定仅为127.0.0.1',async()=>{const {server,url}=await serve(await fixture());expect(server.address().address).toBe('127.0.0.1');let r=await fetch(url);expect(r.headers.get('content-type')).toContain('text/html');expect(await r.text()).toContain('应猴传说');r=await fetch(url+'assets/app.js');expect(r.headers.get('content-type')).toContain('text/javascript');expect(await r.text()).toContain('game');r=await fetch(url,{method:'HEAD'});expect(r.status).toBe(200);expect(await r.text()).toBe('');});
it('拒绝越界路径、坏编码、写入方法与不存在资源',async()=>{const {url}=await serve(await fixture());expect(await raw(url,'/%2e%2e%2fsecret.txt')).toBe(403);expect(await raw(url,'/%5c..%5csecret')).toBe(400);expect(await raw(url,'/%GG')).toBe(400);expect((await fetch(url,{method:'POST'})).status).toBe(405);expect((await fetch(url+'missing.png')).status).toBe(404);});
it('占用端口时自动改用后续端口，不干扰已有服务',async()=>{const root=await fixture(),first=await serve(root);const port=first.server.address().port;const second=await serve(root,port,20);expect(second.url).not.toBe(first.url);expect((await fetch(first.url)).status).toBe(200);});
it('显式端口冲突和不完整游戏目录给出失败',async()=>{const root=await fixture(),first=await serve(root);await expect(startLocalServer({root,port:first.server.address().port,attempts:1})).rejects.toThrow();await expect(startLocalServer({root,port:-1})).rejects.toThrow('端口');await expect(startLocalServer({root:join(root,'missing'),port:0})).rejects.toThrow();});
