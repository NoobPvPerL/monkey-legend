import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const configPath=process.argv[2],suffix=process.argv[3]??'';
if(!configPath||(suffix&&!/^[a-z0-9-]+$/.test(suffix)))throw Error('Usage: node tools/package-online.mjs <publicConfig.json> [suffix]');
if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Commit source and evidence before packaging');
const raw=JSON.parse(await readFile(configPath,'utf8')),c=raw.publicConfig??raw;
const publicConfig=Object.fromEntries(['applicationId','resourceId','endpoint','oauthRelayBaseUrl','publishableKey'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]]));
if(new URL(c.endpoint).protocol!=='https:'||!c.publishableKey)throw Error('Expected public WorkBuddy config');
const version=JSON.parse(await readFile('package.json','utf8')).version,folder=resolve('releases',`monkey-legend-${version}-online-source${suffix?'-'+suffix:''}`);
await mkdir(folder,{recursive:false});
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const manifest={version,ruleVersion:'web-v0.1.2',schemaVersion:2,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:false,applicationId:c.applicationId,endpoint:c.endpoint,purpose:'P2 full source; WorkBuddy deployment and remote acceptance pending',files:{}};
for(const file of files){if(file.split('/').some(x=>x==='.git'||x==='node_modules')||file.includes('workbuddy-public.json'))throw Error('Unexpected tracked deployment input');const target=join(folder,file);await mkdir(dirname(target),{recursive:true});await copyFile(file,target);manifest.files[file]=createHash('sha256').update(await readFile(file)).digest('hex');}
await mkdir(join(folder,'config'),{recursive:true});
const configText=JSON.stringify(publicConfig,null,2)+'\n';await writeFile(join(folder,'config/workbuddy-public.json'),configText);manifest.files['config/workbuddy-public.json']=createHash('sha256').update(configText).digest('hex');
await writeFile(join(folder,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(folder);console.log(`${files.length+1} source/config files; source ${manifest.sourceCommit}`);
