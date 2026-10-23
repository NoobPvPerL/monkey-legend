import {readFile,readdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
export const replace=(s,a,b)=>{if(!s.includes(a))throw Error('P3 anchor drift: '+a);return s.replace(a,()=>b);};
export async function generateP3({previous,version,revision,path,helpers,characters,patch}){
 const bundle=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,format:'esm',platform:'node'});
 const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
 const functions=new Map();
 for(const file of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<revision).sort())
  for(const m of (await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n').matchAll(/create or replace function ((?:ml_private|public)\.\w+)\([\s\S]*?\$\$;/gi))functions.set(m[1],m[0]);
 const profile={manifest:d.ruleManifest(version),mapDefinition:d.mapForVersion(version),environment:d.environmentForVersion(version),sourceCatalog:d.sourceCatalogForVersion(version),runtimeData:d.runtimeForVersion(version),locationPolicy:d.classicLocationPolicy(version),characterTraits:Object.fromEntries(Object.keys(d.sourceCatalogForVersion(version).characters).map(id=>[id,d.characterTraitsForVersion(version,id)])),p3:{yinghaoImmune:true,...(revision>=24?{potatoTeleport:true}:{}),...(characters>=18?{characters:['character-013','character-025',...(characters>=20?['character-046','character-047',...(characters>=23?['character-020','character-029','character-053']:[])]:[])]}: {})}};
 if(characters>=27)profile.p3.characters.push('character-014','character-016','character-024','character-038');
 if(characters>=35)profile.p3.characters.push('character-007','character-017','character-018','character-019','character-032','character-036','character-051','character-052');
 let out=`-- Approved P3 incremental rules. Frozen000–021 and saved games/drafts are never rewritten.\nDO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<${revision-1} THEN RAISE EXCEPTION 'Apply complete${revision-1} before${revision}';END IF;END $$;\ninsert into ml_private.catalog(key,value) values('ruleset:${version}','${JSON.stringify(profile).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
 out+=await readFile(helpers,'utf8');
 const escaped=previous.replaceAll('.','\\.');
 for(const [name,raw] of functions){
  if(name==='public.ml_health')continue;
  let body=raw.replace(new RegExp("\\b((?:not\\s+)?in\\s*\\([^)]*)'"+escaped+"'(\\s*\\))",'g'),`$1'${previous}','${version}'$2`)
   .replace(new RegExp("<>\\s*'"+escaped+"'",'g'),` not in ('${previous}','${version}')`)
   .replace(new RegExp("(?<![<>=!])=\\s*'"+escaped+"'",'g'),` in ('${previous}','${version}')`);
  if(name==='ml_private.stage4_create_draft')body=body.replaceAll(`'${previous}'`,`'${version}'`);
  body=patch(name.split('.')[1],body);
  if(body!==raw)out+=body+'\n';
 }
 let health=functions.get('public.ml_health').replaceAll(`ruleset:${previous}`,`ruleset:${version}`).replaceAll(`'${previous}'`,`'${version}'`).replace(`'engineRevision',${revision-1}`,`'engineRevision',${revision}`)
  .replace(`count(*)=${revision-12} from ml_private.catalog`,`count(*)=${revision-11} from ml_private.catalog`)
  .replace(`'ruleset:${version}'))`,`'ruleset:${previous}','ruleset:${version}'))`)
  .replace("jsonb_array_length(value#>'{runtimeData,characterIds}')=16",`jsonb_array_length(value#>'{runtimeData,characterIds}')=${characters}`);
 if(characters>=18)health=health.replace("jsonb_array_length(value#>'{runtimeData,characterIds}')=18",`jsonb_array_length(value#>'{runtimeData,characterIds}')=18 and value#>'{p3,characters}'='["character-013","character-025"]'::jsonb`);
 health=replace(health,"value#>>'{manifest,status}'='playable'","value#>>'{manifest,status}'='playable' and value#>>'{p3,yinghaoImmune}'='true'");
 // Rebuild additions rather than carrying a previous batch's readiness count.
 health=health.replace(/,'yinghaoRulesReady',ready(?:,'p3CharactersReady',ready)?,'characterDefinitions',\d+/g,'');
 health=replace(health,"'engine','postgresql'",`'yinghaoRulesReady',ready${characters>=18?",'p3CharactersReady',ready":''},'characterDefinitions',${characters},'engine','postgresql'`);
 if(revision===24){health=health.replace("'engine','postgresql'","'potatoRulesReady',ready,'engine','postgresql'");health=health.replace("value#>>'{p3,yinghaoImmune}'='true'","value#>>'{p3,yinghaoImmune}'='true' and value#>>'{p3,potatoTeleport}'='true'");}
 if(revision===25){health=health.replaceAll("jsonb_array_length(value#>'{runtimeData,characterIds}')=18","jsonb_array_length(value#>'{runtimeData,characterIds}')=20").replaceAll("[\"character-013\",\"character-025\"]","[\"character-013\",\"character-025\",\"character-046\",\"character-047\"]");health=health.replace("'engine','postgresql'","'batchCReady',ready,'engine','postgresql'");}
 if(revision===26){health=health.replaceAll("jsonb_array_length(value#>'{runtimeData,characterIds}')=20","jsonb_array_length(value#>'{runtimeData,characterIds}')=23").replaceAll('[\"character-013\",\"character-025\",\"character-046\",\"character-047\"]','[\"character-013\",\"character-025\",\"character-046\",\"character-047\",\"character-020\",\"character-029\",\"character-053\"]');health=health.replace("'engine','postgresql'","'batchDReady',ready,'engine','postgresql'");}
 if(revision===27){health=health.replaceAll("jsonb_array_length(value#>'{runtimeData,characterIds}')=23","jsonb_array_length(value#>'{runtimeData,characterIds}')=27").replaceAll('character-053\"]','character-053\",\"character-014\",\"character-016\",\"character-024\",\"character-038\"]');health=health.replace("'engine','postgresql'","'batchEReady',ready,'engine','postgresql'");}
 if(revision===28){health=health.replaceAll("jsonb_array_length(value#>'{runtimeData,characterIds}')=27","jsonb_array_length(value#>'{runtimeData,characterIds}')=35").replaceAll('character-038\"]','character-038\",\"character-007\",\"character-017\",\"character-018\",\"character-019\",\"character-032\",\"character-036\",\"character-051\",\"character-052\"]');health=health.replace("'engine','postgresql'","'batchFReady',ready,'engine','postgresql'");}
 out+=health+`\nrevoke all on all functions in schema ml_private from public;\nDO $$ declare r text;begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;\n`;
 out=out.replaceAll('\r\n','\n').replace(/[\t ]+$/gm,'');
 if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==out)throw Error(path+' differs from generator');}else await writeFile(path,out);
 console.log(`${revision}: ${version}, ${characters} characters; frozen predecessors retained.`);
}
