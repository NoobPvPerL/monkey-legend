import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const input=await readFile('artifacts/p3-batch-f/cdef-browser-flows.json','utf8'),report=JSON.parse(input);
assert.equal(report.errors.length,0);assert.equal(report.flows.length,32);
const db=new PGlite(),results=[],out={scope:'Replay the exact commands/timestamps recorded by local browser UI through isolated frozen000-029 SQL dispatch; complete state comparison after every command. Not production RPC or live-device evidence.',browserFlowSha256:createHash('sha256').update(input).digest('hex'),results};
let commands=0;
try{
 await db.waitReady;await db.exec('create role anon;create role authenticated;');
 for(const file of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<=29).sort())await db.exec(await readFile('database/migrations/'+file,'utf8'));
 for(const flow of report.flows){let s=flow.initial;
  for(const step of flow.steps){assert(step.ok);const actual=(await db.query('select ml_private.dispatch($1::jsonb,$2::jsonb,$3::double precision) v',[JSON.stringify(s),JSON.stringify(step.command),step.at])).rows[0].v;assert.equal(actual.ok,true,actual.error);assert.deepEqual(actual.state,step.expected,flow.scenario+'/'+flow.viewport+'/'+step.command.id);s=actual.state;commands++;}
  assert.deepEqual(s,flow.final);results.push({scenario:flow.scenario,viewport:flow.viewport,version:flow.initial.version,commands:flow.steps.length,allStatesCompared:true});
 }
 out.passed=true;out.flows=results.length;out.commands=commands;console.log(JSON.stringify({passed:true,flows:results.length,commands}));
}catch(e){out.passed=false;out.error=e.stack;console.error(e);process.exitCode=1;}
finally{await db.close();await writeFile('artifacts/p3-batch-f/cdef-browser-sql-replay.json',JSON.stringify(out,null,2)+'\n');}
