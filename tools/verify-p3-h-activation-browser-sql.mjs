import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const prefix=process.env.P3_H_REVIEW_PREFIX??'activation';assert(/^[a-z0-9-]+$/.test(prefix));
const input=await readFile(`artifacts/p3-batch-h/${prefix}-browser-flows.json`,'utf8'),browser=JSON.parse(input);
assert.deepEqual(browser.errors,[]);assert.equal(browser.flows.length,4);
const db=new PGlite(),report={scope:'Exact normal H browser draft picks, create_game and birth choice replayed through isolated000-030 SQL; full states after every operation. Not production RPC.',inputSha256:createHash('sha256').update(input).digest('hex'),flows:[],initialDrafts:0,operations:0,passed:false};
try{
 await db.waitReady;await db.exec('create role anon;create role authenticated;');
 for(const p of (await readdir('database/migrations')).filter(p=>/^\d{3}_/.test(p)&&Number(p.slice(0,3))<=30).sort())await db.exec(await readFile('database/migrations/'+p,'utf8'));
 for(const f of browser.flows){let draft=(await db.query('select ml_private.stage4_create_draft($1,$2::jsonb,$3::double precision) v',[f.mode,JSON.stringify({seed:f.seed,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false}),f.initial.time])).rows[0].v,game=null;assert.deepEqual(draft,f.initial);report.initialDrafts++;
  for(const step of f.history){
   if(step.kind==='create'){game=(await db.query('select ml_private.create_game($1::jsonb,$2::double precision) v',[JSON.stringify(step.setup),step.at])).rows[0].v;assert.deepEqual(game,step.expected);}
   else{const result=(await db.query(`select ml_private.${step.kind==='draft'?'dispatch_draft':'dispatch'}($1::jsonb,$2::jsonb,$3::double precision) v`,[JSON.stringify(step.kind==='draft'?draft:game),JSON.stringify(step.command),step.at])).rows[0].v;assert.equal(result.ok,true,result.error);assert.deepEqual(result.state,step.expected);if(step.kind==='draft')draft=result.state;else game=result.state;}
   report.operations++;
  }
  assert.deepEqual(game,f.game);report.flows.push({mode:f.mode,viewport:f.viewport,seed:f.seed,operations:f.history.length,allStatesCompared:true});
 }
 report.passed=true;console.log(JSON.stringify(report));
}catch(e){report.error=e.stack;console.error(e);process.exitCode=1;}finally{await db.close();await writeFile(`artifacts/p3-batch-h/${prefix}-browser-sql-replay.json`,JSON.stringify(report,null,2)+'\n');}
