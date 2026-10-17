// Local-only verification of the independently extracted ZIP pair. No cloud RPC.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const current=JSON.parse(await readFile('.release-cache/stage4-package-current.json','utf8'));
const source=resolve(current.source),sql=resolve(current.sql),report={version:'0.2.5-p2.6',at:new Date().toISOString(),sourceSnapshotSha256:current.snapshot,checks:[],passed:false,cloudDeployed:false};
const mark=name=>{report.checks.push(name);console.log('PASS '+name);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sm=JSON.parse(await readFile(join(source,'source-manifest.json'),'utf8')),dm=JSON.parse(await readFile(join(sql,'manifest.json'),'utf8'));
assert.equal(sm.sourceCommit,dm.sourceCommit);assert.equal(sm.sourceDirty,false);assert.equal(dm.sourceDirty,false);
assert.equal(sm.sourceSnapshotSha256,dm.sourceSnapshotSha256);assert.equal(sm.engineRevision,18);assert.equal(dm.engineRevision,18);
for(const [root,manifest] of [[source,sm],[sql,dm]])for(const [file,sha] of Object.entries(manifest.files)){assert(resolve(root,file).startsWith(root+ '/'.replace('/',process.platform==='win32'?'\\':'/')));assert.equal(hash(await readFile(join(root,file))),sha,file);}
assert.equal(hash(Object.entries(sm.files).sort(([a],[b])=>a.localeCompare(b,'en')).map(([path,sha])=>`${sha}  ${path}\n`).join('')),sm.sourceSnapshotSha256);
for(const [file,sha] of Object.entries(dm.files).filter(([f])=>f.startsWith('migrations/')))assert.equal(hash(await readFile(join(source,'database',file))),sha,file);
mark('extracted source/SQL manifests, every file hash, same snapshot and all migration bytes');
const config=JSON.parse(await readFile(join(source,'config/workbuddy-public.json'),'utf8'));
assert(Object.keys(config).every(k=>['applicationId','resourceId','endpoint','oauthRelayBaseUrl','publishableKey'].includes(k)));
assert(!Object.keys(sm.files).some(f=>/(^|\/)(\.git|node_modules)(\/|$)|^(releases|server-dist|dist)\/|(^|\/)\.env(?:\.|$)|\.(pem|key)$/.test(f)));
const refs=JSON.parse(await readFile(join(source,'dist/references/index.json'),'utf8'));assert.equal(Object.keys(refs).length,92);
for(const file of Object.values(refs))assert((await readFile(join(source,'dist',file))).length>0);
mark('public configuration whitelist, no runtime/private inputs, and92 built reference assets');
const migrations=(await readdir(join(source,'database/migrations'))).filter(f=>f.endsWith('.sql')).sort();
const install=await readFile(join(sql,'install-one-statement.sql'),'utf8');
for(const fresh of [true,false]){
 const db=new PGlite();await db.waitReady;
 try{
  await db.exec('create role anon;create role authenticated;');
  for(const file of migrations.filter(f=>fresh?Number(f.slice(0,3))<5:Number(f.slice(0,3))<=16))await db.exec(await readFile(join(source,'database/migrations',file),'utf8'));
  let before;
  if(!fresh){const r=(await db.query('select public.ml_room($1::jsonb) v',[JSON.stringify({op:'create',name:'包内保留身份',token:'7'.repeat(64),requestId:'package-create'})])).rows[0].v;assert(r.ok);before=(await db.query('select jsonb_agg(to_jsonb(r)) v from ml_private.rooms r')).rows[0].v;}
  const statement='DO $package_atomic$ BEGIN EXECUTE $package_sql$'+install+'$package_sql$;END $package_atomic$;';
  await db.query(statement);
  const health=(await db.query('select public.ml_health() v')).rows[0].v;
  assert.equal(health.engineRevision,18);assert.equal(health.ruleVersion,'web-v0.1.7');assert.equal(health.stage4Ready,true);assert.equal(health.cardDefinitions,76);assert.equal(health.cardInstances,191);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);assert.equal((await db.query('select public.ml_health() v')).rows[0].v.stage4Ready,true);await assert.rejects(db.query('select * from ml_private.rooms'));await assert.rejects(db.query('select ml_private.stage4_content()'));await db.exec('reset role');}
  await db.exec(await readFile(join(sql,'verify.sql'),'utf8'));
  await db.query(statement);
  if(before)assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(r)) v from ml_private.rooms r')).rows[0].v,before);
  mark((fresh?'fresh schema1→18':'existing complete16→18')+' single-statement install, readiness/ACL/verify/reapply'+(before?' and room identity preservation':''));
 }finally{await db.close();}
}
report.sourceCommit=sm.sourceCommit;report.passed=true;
await writeFile(join(current.delivery,'PACKAGE-VALIDATION.json'),JSON.stringify(report,null,2)+'\n');
