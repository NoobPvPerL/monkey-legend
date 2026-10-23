import {readFile,readdir,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,relative} from 'node:path';
import assert from 'node:assert/strict';
import {databasePackagePlan} from './database-package-plan.mjs';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const hash=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const root=resolve('.'),base='artifacts/p3-batch-h/';
const report={auditedAt:new Date().toISOString(),head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),candidate:{app:'0.3.8-p3.9',rule:'web-v0.1.19',schema:2,revision:30,characters:52,cards:76,entities:191},rulesPendingReview:[],ownerReview:'2026-10-23: documented rules/screenshots reviewed; build and GitHub upload authorized',remoteRead:null,checks:{},sourceHashes:{},workbuddyBuilt:false,githubUploaded:false,productionWritten:false,phaseAccepted:false};
assert.equal((await json('package.json')).version,report.candidate.app);
const remote=await json(base+'remote-ref-preflight.json');
assert.equal(remote.ref,'refs/heads/main');
report.remoteRead={method:remote.scope,checkedAt:remote.checkedAt,sha:remote.sha,localHeadMatches:remote.sha===report.head,cliAttempts:remote.gitCliAttempts};
const online=await readFile('packages/online/src/version.ts','utf8');
assert(online.includes(report.candidate.rule)&&online.includes(report.candidate.app));
const frozen=(await json(base+'predecessor-snapshot.json')).files;
for(const f of frozen)assert.equal(await hash(f.path),f.sha256,'frozen: '+f.path);
report.checks.frozenPredecessorsAndSourceSnapshots=frozen.length;
const originalScopes=['assets','docs/cards','docs/assets-manifest.json','packages/game-data/src/source-catalog.json','packages/game-data/src/baselines'];
assert.equal(git('diff','--name-only','HEAD','--',...originalScopes),'');
report.checks.originalTrackedFilesUnchanged=git('ls-files','-z','--',...originalScopes).split('\0').filter(Boolean).length;
const manifest=await json('docs/assets-manifest.json'),originals=[...(manifest.images??manifest.assets),...manifest.sourceDocuments];
for(const f of originals)assert.equal(await hash(f.path),f.sha256,'original: '+f.path);
report.checks.originalImagesAndDocuments=originals.length;
const screens=new Map();
async function screenshots(path){const j=await json(path);let count=0;for(const s of j.screenshots){assert.equal(await hash(s.path),s.sha256,'screenshot: '+s.path);screens.set(s.path,s.sha256);count++;}return count;}
for(const p of ['browser-review','011-browser-review','030-browser-review','034-browser-review','035-browser-review','041-browser-review','050-browser-review-final','050-browser-actions'])await screenshots(base+p+'.json');
report.checks.priorHScreenshots=screens.size;assert.equal(screens.size,81);
report.checks.cdefScreenshots=await screenshots('artifacts/p3-batch-f/cdef-browser-review.json');assert.equal(report.checks.cdefScreenshots,84);
report.checks.normalEntryScreenshots=await screenshots(base+'activation-browser-review.json');assert.equal(report.checks.normalEntryScreenshots,20);
report.checks.reviewedReleaseScreenshots=await screenshots(base+'release-browser-review.json');assert.equal(report.checks.reviewedReleaseScreenshots,20);
report.screenshotHashes=Object.fromEntries(screens);
for(const path of ['activation-browser-sql-replay','release-browser-sql-replay','full-regression-release-final','shared-conversion-final','install-plan-tests-final','delivery-tools-tests-final']){
 const j=await json(base+path+'.json');assert(j.passed===true||j.success===true,path);
 report.checks[path]=j.numTotalTests?{tests:j.numTotalTests,passed:j.numPassedTests,failed:j.numFailedTests,files:j.testResults.length}:{operations:j.operations,initialDrafts:j.initialDrafts,passed:j.passed};
}
const migrations=await Promise.all((await readdir('database/migrations')).filter(file=>file.endsWith('.sql')).map(async file=>({file,body:await readFile('database/migrations/'+file,'utf8')})));
const fresh=databasePackagePlan(report.candidate.app,migrations),upgrade=databasePackagePlan(report.candidate.app,migrations,true),matrix=await json(base+'install-plan-matrix.json');
assert.equal(matrix.cases.length,17);let plans=0;
for(const c of matrix.cases)if(c.sha256){const text=(c.base==='empty'?fresh:upgrade).files[c.file];assert.equal(createHash('sha256').update(text).digest('hex'),c.sha256,'installer snapshot: '+c.file);plans++;}
assert.equal(plans,15);report.checks.installPlanCasesBoundToCurrentSQL=plans;
const pyUnits=await readFile(base+'delivery-python-unit.txt','utf8');assert(/Ran 7 tests/.test(pyUnits)&&/\nOK\s*$/.test(pyUnits));
const assembly=await json(base+'delivery-assembly-preflight.json');assert.equal(assembly.buildExecuted,false);assert.deepEqual(assembly.existingOutputs,[]);
report.checks.deliveryPythonUnitTests=7;report.checks.assemblyDryRun={buildExecuted:false,existingOutputs:[]};
assert.equal(git('diff','--name-only','HEAD','--','tools/package-card-feedback-delivery.py','tools/verify-card-feedback-package.mjs','tools/verify-cloud-database.mjs'),'');
report.checks.historicalP2DeliveryToolsUnchanged=true;
report.evidenceBoundary='Owner-reviewed release full regression is separate from Python tests and historical pre-approval reports. This audit precedes real package creation; independent package verification follows.';
report.currentVersionReleaseOutputs=(await readdir('releases').catch(e=>{if(e.code==='ENOENT')return [];throw e;})).filter(p=>p.includes(report.candidate.app));
assert.equal(report.currentVersionReleaseOutputs.length,0,'Pre-build audit refuses existing candidate delivery outputs; use independent package verification after the approved build');
report.fullGames={};
for(const prefix of ['private','activated']){
 const paths=(await readdir(base)).filter(p=>p.startsWith(prefix+'-full-game-')&&p.endsWith('.json'));assert.equal(paths.length,26);let commands=0;
 for(const p of paths){const j=await json(base+p);assert.equal(j.entities,191);assert(j.allCommandsCompared&&j.winners.length);commands+=j.commands;}
 report.fullGames[prefix]={games:paths.length,commands,entities:191};
}
const docs=['README.md','database/README.md',...(await readdir('docs')).filter(p=>(p.startsWith('p3-')||/^web-rules-v0\.1\.1[1-9]\.md$/.test(p))&&p.endsWith('.md')).map(p=>'docs/'+p)];
let links=0;
for(const path of docs){const text=await readFile(path,'utf8');for(const m of text.matchAll(/\[[^\]\n]*\]\((<[^>]+>|[^)\s]+)\)/g)){
 let p=m[1].replace(/^<|>$/g,'');if(/^(?:https?:|mailto:|codex:|app:|#)/.test(p))continue;
 p=decodeURIComponent(p.split('#')[0]);if(!p)continue;await access(resolve(dirname(path),p));links++;
}}
report.checks.documentationLinks=links;
async function walk(dir){const files=[];for(const d of await readdir(dir,{withFileTypes:true})){if(['node_modules','.git'].includes(d.name))continue;const p=dir+'/'+d.name;if(d.isDirectory())files.push(...await walk(p));else if(d.isFile())files.push(p);}return files;}
const inputs=['package.json','package-lock.json','README.md',...await walk('packages'),...await walk('apps'),...await walk('database'),...await walk('docs'),...await walk('tests'),...await walk('tools')];
for(const p of inputs.sort())report.sourceHashes[relative(root,resolve(p)).replaceAll('\\','/')]=await hash(p);
report.checks.sourceInputsHashed=inputs.length;
report.checks.typecheckAndDataCatalog='Passed separately; see candidate validation. This audit does not build a delivery package.';
report.requiredWorkRemaining=['approved WorkBuddy build and independent extraction/startup/migration validation','GitHub source and package upload with remote verification'];
report.outsideDeliveryAuthorization=['production cloud execution','owner phase acceptance'];
await writeFile(base+'activation-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,sourceHashes:inputs.length,screenshotHashes:screens.size},null,2));
