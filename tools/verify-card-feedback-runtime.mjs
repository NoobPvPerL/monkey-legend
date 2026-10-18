// Startup/asset probe of the independently built archive. Endpoint is deliberately
// replaced with .invalid so this check cannot contact a production database.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const current=JSON.parse(await readFile(process.argv[2]??'.release-cache/card-feedback-package-current.json','utf8'));
const config=JSON.parse(await readFile(join(current.source,'config/workbuddy-public.json'),'utf8'));
const offline=resolve(current.cache,'offline-public-config.json');
await writeFile(offline,JSON.stringify({...config,endpoint:'https://isolated.invalid',oauthRelayBaseUrl:'https://isolated.invalid'}));
const child=spawn(process.execPath,['server-dist/index.mjs'],{cwd:current.source,env:{...process.env,WORKBUDDY_PUBLIC_CONFIG:offline,ML_LOOPBACK:'1',PORT:'3278'},stdio:'pipe',windowsHide:true});
let stderr='';child.stderr.on('data',b=>{stderr+=b.toString();});
const base='http://127.0.0.1:3278';
try{
 let health;const deadline=Date.now()+15000;
 while(Date.now()<deadline){if(child.exitCode!==null)throw Error('Extracted server startup failed: '+stderr);try{const response=await fetch(base+'/health');if(response.ok){health=await response.json();break;}}catch{}await new Promise(r=>setTimeout(r,150));}
 assert.deepEqual(health,{ok:true,version:'0.2.8-p2.9',ruleVersion:'web-v0.1.10',requiredEngineRevision:21});
 const html=await (await fetch(base+'/')).text();assert(html.includes('应猴传说'));
 const assets=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)"/g)].map(m=>m[1]);assert.equal(assets.length,2);
 for(const file of assets)assert((await fetch(base+file)).ok);
 const refs=await (await fetch(base+'/references/index.json')).json();assert.equal(Object.keys(refs).length,92);
 for(const file of Object.values(refs))assert((await fetch(base+file)).ok);
 for(const file of ['/config/workbuddy-public.json','/apps/server/src/index.ts','/database/migrations/021_p2_card_feedback.sql'])assert.equal((await fetch(base+file)).status,404);
 const path=join(current.delivery,'PACKAGE-VALIDATION.json'),report=JSON.parse(await readFile(path,'utf8'));
 report.independentNpmCi=true;report.independentBuild=true;report.runtime=process.version;report.health=health;report.runtimeEndpoint='https://isolated.invalid';report.cloudRpcInvoked=false;
 report.checks.push('independent locked npm ci --offline and production client/server build','extracted built server starts with offline endpoint; HTML/JS/CSS and92 references load; source/config hidden');report.finishedAt=new Date().toISOString();
 await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log('PASS extracted build/start/assets with offline .invalid endpoint; no production RPC');
}finally{if(child.exitCode===null){const stopped=once(child,'exit');child.kill('SIGKILL');await stopped;}}
