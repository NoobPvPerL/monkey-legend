import {expect,it} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,realpath,rm} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
const run=promisify(execFile);
it('P2-P01 separate Node processes reopen durable PostgreSQL state, preserve identity/random and catch up deadlines',async()=>{
 const root=resolve('.release-cache/p2-persistence');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'process-'));
 try{
  const child=async(stage:string)=>JSON.parse((await run(process.execPath,['tests/p2/persistence-child.mjs',stage,dir],{cwd:process.cwd(),windowsHide:true,timeout:30000,maxBuffer:1000000})).stdout);
  const first=await child('init'),next=await child('resume');expect(next.snapshot.roomId).toBe(first.snapshot.roomId);expect(next.snapshot.memberId).toBe(first.snapshot.memberId);expect(next.snapshot.matchId).toBe(first.snapshot.matchId);expect(next.snapshot.epoch).toBe(2);expect(next.snapshot.serverTime-first.snapshot.serverTime).toBe(5000);expect(next.digest).toBe(first.digest);
  const late=await child('late');expect(late.snapshot.roomId).toBe(first.snapshot.roomId);expect(late.snapshot.members.map((p:any)=>p.id)).toEqual(first.snapshot.members.map((p:any)=>p.id));expect(late.snapshot.game.result).not.toBeNull();expect(late.snapshot.game.events.some((e:any)=>e.type==='timeout')).toBe(true);
 }finally{const target=await realpath(dir),base=await realpath(root);if(!target.startsWith(base+sep))throw Error('Refusing cleanup outside persistence test root');await rm(target,{recursive:true,force:true});}
},60000);
