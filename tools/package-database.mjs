import {mkdir,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const upgrade=process.argv.includes('--upgrade');
const suffix=process.argv.slice(2).find(arg=>arg!=='--upgrade')??'';if(suffix&&!/^[a-z0-9-]+$/.test(suffix))throw Error('Invalid package suffix');
await mkdir('releases',{recursive:true});
const folder=resolve('releases',`monkey-legend-${version}-database${suffix?'-'+suffix:''}`);
await mkdir(folder,{recursive:false});await mkdir(join(folder,'migrations'));
const manifest={version,ruleVersion:'web-v0.1.2',schemaVersion:2,upgradeFrom:upgrade?1:null,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0,purpose:upgrade?'Incremental owner upgrade from schema 1; isolated validation only':'Fresh isolated install; not cloud acceptance',files:{}};
let bundle='-- monkey-legend '+version+'; owner-only installation. Review README first.\nBEGIN;\n';
if(upgrade)bundle+="DO $$ BEGIN IF coalesce(public.ml_health()->>'schemaVersion','') NOT IN ('1','2') THEN RAISE EXCEPTION 'Expected installed schema 1 or 2'; END IF; END $$;\n";
for(const file of (await readdir('database/migrations')).filter(f=>f.endsWith('.sql')&&(!upgrade||/^(005|006|007)_/.test(f))).sort()){
 const body=await readFile('database/migrations/'+file,'utf8');bundle+='\n-- '+file+'\n'+body+'\n';await copyFile('database/migrations/'+file,join(folder,'migrations',file));
 manifest.files['migrations/'+file]=createHash('sha256').update(body).digest('hex');
}
const body=bundle.slice(bundle.indexOf('BEGIN;\n')+7);
// One prepared statement, one transaction: preserves all original statement
// boundaries inside EXECUTE, including function bodies and dollar quotes.
const delimiter='$ml_install_'+createHash('sha256').update(body).digest('hex').slice(0,16)+'$';
const outer='$ml_outer_'+createHash('sha256').update(body).digest('hex').slice(0,16)+'$';
if(body.includes(delimiter)||body.includes(outer))throw Error('SQL delimiter collision');
const oneStatement=`DO ${outer} BEGIN EXECUTE ${delimiter}${body}${delimiter}; END ${outer};\n`;
await writeFile(join(folder,'install-one-statement.sql'),oneStatement);manifest.files['install-one-statement.sql']=createHash('sha256').update(oneStatement).digest('hex');
bundle+='\nCOMMIT;\n';await writeFile(join(folder,'install.sql'),bundle);manifest.files['install.sql']=createHash('sha256').update(bundle).digest('hex');
for(const file of ['verify.sql','README.md']){await copyFile('database/'+file,join(folder,file));manifest.files[file]=createHash('sha256').update(await readFile('database/'+file)).digest('hex');}
await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(folder);
