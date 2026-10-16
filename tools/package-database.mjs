import {mkdir,readFile,readdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const version=JSON.parse(await readFile('package.json','utf8')).version;
const suffix=process.argv[2]??'';if(suffix&&!/^[a-z0-9-]+$/.test(suffix))throw Error('Invalid package suffix');
await mkdir('releases',{recursive:true});
const folder=resolve('releases',`monkey-legend-${version}-database${suffix?'-'+suffix:''}`);
await mkdir(folder,{recursive:false});await mkdir(join(folder,'migrations'));
const manifest={version,ruleVersion:'web-v0.1.1',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().length>0,purpose:'WorkBuddy isolated test database; not cloud acceptance',files:{}};
let bundle='-- monkey-legend '+version+'; owner-only installation. Review README first.\nBEGIN;\n';
for(const file of (await readdir('database/migrations')).filter(f=>f.endsWith('.sql')).sort()){
 const body=await readFile('database/migrations/'+file,'utf8');bundle+='\n-- '+file+'\n'+body+'\n';await copyFile('database/migrations/'+file,join(folder,'migrations',file));
 manifest.files['migrations/'+file]=createHash('sha256').update(body).digest('hex');
}
bundle+='\nCOMMIT;\n';await writeFile(join(folder,'install.sql'),bundle);manifest.files['install.sql']=createHash('sha256').update(bundle).digest('hex');
for(const file of ['verify.sql','README.md']){await copyFile('database/'+file,join(folder,file));manifest.files[file]=createHash('sha256').update(await readFile('database/'+file)).digest('hex');}
await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(folder);
