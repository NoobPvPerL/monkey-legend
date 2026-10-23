import {mkdir,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {databasePackagePlan} from './database-package-plan.mjs';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const upgrade=process.argv.includes('--upgrade');
const suffix=process.argv.slice(2).find(arg=>arg!=='--upgrade')??'';if(suffix&&!/^[a-z0-9-]+$/.test(suffix))throw Error('Invalid package suffix');
const migrations=await Promise.all((await readdir('database/migrations')).filter(f=>f.endsWith('.sql')).map(async file=>({file,body:await readFile('database/migrations/'+file,'utf8')})));
const plan=databasePackagePlan(version,migrations,upgrade);
await mkdir('releases',{recursive:true});
const folder=resolve('releases',`monkey-legend-${version}-database${suffix?'-'+suffix:''}`);
await mkdir(folder,{recursive:false});await mkdir(join(folder,'migrations'));
const manifest={version,ruleVersion:'web-v0.1.19',schemaVersion:2,engineRevision:30,classicRuleVersion:'web-v0.1.19',classicPlayable:true,cardDefinitions:76,cardInstances:191,characterDefinitions:52,upgradeFrom:upgrade?1:null,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0,purpose:upgrade?'Incremental owner upgrade from schema 1; isolated validation only':'Fresh isolated install; not cloud acceptance',files:{}};
for(const {file,body} of plan.migrations){
 await copyFile('database/migrations/'+file,join(folder,'migrations',file));
 manifest.files['migrations/'+file]=createHash('sha256').update(body).digest('hex');
}
for(const [name,text] of Object.entries(plan.files)){
 await writeFile(join(folder,name),text);manifest.files[name]=createHash('sha256').update(text).digest('hex');
}
for(const file of ['verify.sql','README.md']){await copyFile('database/'+file,join(folder,file));manifest.files[file]=createHash('sha256').update(await readFile('database/'+file)).digest('hex');}
await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(folder);
