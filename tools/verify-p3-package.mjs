// Run this copied script INSIDE the independently extracted source, after npm ci/build.
// Only in-memory PostgreSQL and loopback HTTP are used. No production RPC.
import {readFile,readdir,writeFile,realpath} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
import {P3_DELIVERY_PROFILE as profile,hash,containedPath,assertP3Manifests,verifyManifest,p3UpgradeFile} from './p3-package-inputs.mjs';
const statePath=resolve(process.argv[2]??'');assert(process.argv[2],'Usage: node <extracted-source>/tools/verify-p3-package.mjs <state.json>');
const current=JSON.parse(await readFile(statePath,'utf8')),source=await realpath(current.source),sql=await realpath(current.sql),delivery=await realpath(current.delivery),cache=await realpath(current.cache);
assert.equal(await realpath(fileURLToPath(import.meta.url)),join(source,'tools','verify-p3-package.mjs'),'Run the package copy of this verifier');
assert(source.startsWith(cache+sep)&&sql.startsWith(cache+sep),'Extraction paths escaped isolated cache');
const sm=JSON.parse(await readFile(join(source,'source-manifest.json'),'utf8')),dm=JSON.parse(await readFile(join(sql,'manifest.json'),'utf8'));
const report={...profile,at:new Date().toISOString(),sourceCommit:sm.sourceCommit,sourceDirty:sm.sourceDirty,sourceSnapshotSha256:current.snapshot,archiveHashes:current.archiveHashes,checks:[],passed:false,cloudDeployed:false};
const mark=name=>{report.checks.push(name);console.log('PASS '+name);};
let child;
try{
 assertP3Manifests(sm,dm);assert.equal(current.snapshot,sm.sourceSnapshotSha256);assert.equal(current.sourceCommit,sm.sourceCommit);
 await verifyManifest(source,sm);await verifyManifest(sql,dm);
 assert.deepEqual(Object.keys(current.archiveHashes).sort(),[source.split(sep).at(-1)+'.zip',sql.split(sep).at(-1)+'.zip'].sort());
 for(const [name,sha] of Object.entries(current.archiveHashes))assert.equal(hash(await readFile(containedPath(delivery,name))),sha,name);
 for(const [file,sha] of Object.entries(dm.files).filter(([f])=>f.startsWith('migrations/')))assert.equal(hash(await readFile(containedPath(source,'database/'+file))),sha,file);
 for(let base=18;base<30;base++){const name=p3UpgradeFile(base);assert.equal(hash(await readFile(join(delivery,name))),dm.files[name]);}
 assert.equal(JSON.parse(await readFile(join(source,'package.json'),'utf8')).version,profile.version);
 mark('every manifest file, archive binding, source/SQL snapshot and migration byte');
 // Resolve dependencies from this extraction; a parent checkout is never a fallback.
 const require=createRequire(join(source,'package.json')),pkg=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
 for(const name of [...Object.keys(pkg.dependencies),'@electric-sql/pglite','esbuild'])assert((await realpath(require.resolve(name))).startsWith(join(source,'node_modules')+sep),'Dependency fell back outside extraction: '+name);
 assert(!Object.keys(sm.files).some(f=>/(^|\/)(\.git|node_modules|\.release-cache|\.codex|\.agents)(\/|$)|^(releases|server-dist|dist)\/|(^|\/)\.env(?:\.|$)|\.(pem|key)$/.test(f)));
 const config=JSON.parse(await readFile(join(source,'config/workbuddy-public.json'),'utf8'));
 assert(Object.keys(config).every(k=>['applicationId','resourceId','endpoint','oauthRelayBaseUrl','publishableKey'].includes(k)));
 const refs=JSON.parse(await readFile(join(source,'dist/references/index.json'),'utf8'));
 const bundled=await build({absWorkingDir:source,entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,format:'esm',platform:'node'}),data=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64')),runtime=data.runtimeForVersion(profile.ruleVersion);
 assert.deepEqual(Object.keys(refs).sort(),[...Object.keys(runtime.cards),...runtime.characterIds].sort());
 assert.equal(Object.keys(refs).length,Number(profile.cardDefinitions)+Number(profile.characterDefinitions));
 assert(!Object.hasOwn(refs,'character-008'));
 for(const [id,url] of Object.entries(refs)){assert(/^(basic|character)-\d{3}$/.test(id));assert.equal(url.split('/').slice(0,2).join('/'),'/references');const built=await readFile(containedPath(join(source,'dist'),url.slice(1)));assert(built.length>0);const original=await readFile(containedPath(source,'public'+url));assert.equal(hash(built),hash(original));}
 const originals=JSON.parse(await readFile(join(source,'docs/assets-manifest.json'),'utf8'));
 for(const f of [...(originals.images??originals.assets),...originals.sourceDocuments])assert.equal(hash(await readFile(containedPath(source,f.path))),f.sha256,'Packaged original: '+f.path);
 mark('self-contained package dependencies, public configuration and128 actual reference assets');
 const migrations=(await readdir(join(source,'database/migrations'))).filter(f=>/^\d{3}_.+\.sql$/.test(f)).sort();
 assert.equal(migrations.length,31);
 for(const base of [4,...Array.from({length:12},(_,i)=>18+i)]){
  const db=new PGlite();await db.waitReady;try{
   await db.exec('create role anon;create role authenticated;');
   for(const name of migrations.filter(f=>Number(f.slice(0,3))<=base))await db.exec(await readFile(join(source,'database/migrations',name),'utf8'));
   const created=(await db.query('select public.ml_room($1::jsonb) v',[JSON.stringify({op:'create',name:'包内身份保留',token:'7'.repeat(64),requestId:'package-create'})])).rows[0].v;assert(created.ok);
   const saved=async()=>({room:(await db.query('select id,code,status,mode,host,members,revision,match_id,game,empty_since,created_at,updated_at from ml_private.rooms order by id')).rows,intakes:(await db.query('select * from ml_private.intakes order by token_hash,request_id')).rows});
   const before=await saved(),catalogs=(await db.query('select key,value from ml_private.catalog order by key')).rows,oldHealth=(await db.query('select public.ml_health() v')).rows[0].v;
   const text=await readFile(join(sql,base===4?'install-one-statement.sql':p3UpgradeFile(base)),'utf8'),fault=text.replace(/END (\$ml_outer_[0-9a-f]+\$);\n$/,'PERFORM 1/0; END $1;\n');assert.notEqual(fault,text);
   await assert.rejects(db.query(fault),/division by zero/);assert.deepEqual((await db.query('select public.ml_health() v')).rows[0].v,oldHealth);assert.deepEqual(await saved(),before);
   await db.query(text);const health=(await db.query('select public.ml_health() v')).rows[0].v;
   assert.equal(health.engineRevision,profile.engineRevision);assert.equal(health.ruleVersion,profile.ruleVersion);assert.equal(health.characterDefinitions,profile.characterDefinitions);assert.equal(health.cardInstances,191);
   for(const [key,value] of Object.entries(health))if(key.endsWith('Ready'))assert.equal(value,true,key);assert.equal(health.batchHReady,true);
   assert((await db.query("select to_regprocedure('ml_private.p3h_birth_begin(jsonb,double precision)')::text v")).rows[0].v);
   for(const role of ['anon','authenticated']){await db.exec('set role '+role);try{assert.equal((await db.query('select public.ml_health() v')).rows[0].v.batchHReady,true);await assert.rejects(db.query('select * from ml_private.rooms'),e=>e.code==='42501');await assert.rejects(db.query("select ml_private.p3h_birth_begin('{}'::jsonb,1000::double precision)"),e=>e.code==='42501');}finally{await db.exec('reset role');}}
   for(const result of await db.exec(await readFile(join(sql,'verify.sql'),'utf8')))for(const row of result.rows)for(const [key,value] of Object.entries(row))if(key.endsWith('_ready'))assert.equal(value,true,key);
   await db.query(text);assert.deepEqual(await saved(),before);for(const c of catalogs)assert.deepEqual((await db.query('select value from ml_private.catalog where key=$1',[c.key])).rows[0].value,c.value);
   mark(`packaged ${base===4?'schema1':base}→30 SQL, rollback/repeat, ready/ACL and saved identity/catalogs`);
  }finally{await db.close();}
 }
 // These are artifacts made by a build in this extraction, not files copied from the host checkout.
 const html=await readFile(join(source,'dist/index.html'),'utf8'),assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)].map(m=>m[1]);assert(assets.some(p=>p.endsWith('.js'))&&assets.some(p=>p.endsWith('.css')));
 report.builtAssetHashes={};for(const asset of assets)report.builtAssetHashes[asset]=hash(await readFile(containedPath(join(source,'dist'),asset.slice(1))));
 const builtServer=join(source,'server-dist/index.mjs');report.builtAssetHashes['server-dist/index.mjs']=hash(await readFile(builtServer));
 const offlineConfig=join(cache,'offline-public.json');await writeFile(offlineConfig,JSON.stringify({...config,endpoint:'https://p3-package.invalid',oauthRelayBaseUrl:'https://p3-package.invalid'}));
 const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});
 child=spawn(process.execPath,[builtServer],{cwd:source,env:{...process.env,PORT:String(port),ML_LOOPBACK:'1',WORKBUDDY_PUBLIC_CONFIG:offlineConfig},windowsHide:true,stdio:'ignore'});
 let spawnError;child.once('error',e=>{spawnError=e;});
 const local='http://127.0.0.1:'+port;let online=false;
 for(let i=0;i<100;i++){if(spawnError)throw spawnError;if(child.exitCode!==null||child.signalCode!==null)throw Error('Extracted gateway exited before health');try{const r=await fetch(local+'/health',{signal:AbortSignal.timeout(1000)});if(r.ok){const h=await r.json();assert.equal(h.version,profile.version);assert.equal(h.ruleVersion,profile.ruleVersion);assert.equal(h.requiredEngineRevision,profile.engineRevision);online=true;break;}}catch(e){if(e.name==='AssertionError')throw e;}await new Promise(ok=>setTimeout(ok,100));}
 assert(online,'Extracted gateway did not start');
 assert.equal((await fetch(local+'/ready',{signal:AbortSignal.timeout(25000)})).status,503,'Invalid cloud must remain not-ready');
 assert.equal(await (await fetch(local+'/')).text(),html);
 for(const asset of assets)assert.equal(hash(Buffer.from(await (await fetch(local+asset)).arrayBuffer())),report.builtAssetHashes[asset]);
 for(const url of Object.values(refs))assert.equal(hash(Buffer.from(await (await fetch(local+url)).arrayBuffer())),hash(await readFile(containedPath(join(source,'dist'),url.slice(1)))));
 for(const path of ['/package.json','/config/workbuddy-public.json','/database/verify.sql','/tools/package-online.mjs'])assert.equal((await fetch(local+path)).status,404,path);
 mark('independently built gateway health, offline-ready503, HTML/JS/CSS/references and private-source404');
 report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;console.error(e.message);}
finally{
 if(child?.pid&&child.exitCode===null&&child.signalCode===null){const done=new Promise(ok=>child.once('exit',ok));child.kill('SIGTERM');await Promise.race([done,new Promise(ok=>setTimeout(ok,30000))]);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await Promise.race([done,new Promise(ok=>setTimeout(ok,3000))]);}if(child.exitCode===null&&child.signalCode===null){report.passed=false;report.failure='Own test gateway did not terminate';process.exitCode=1;}}
 await writeFile(join(delivery,'PACKAGE-VALIDATION.json'),JSON.stringify(report,null,2)+'\n');
}
