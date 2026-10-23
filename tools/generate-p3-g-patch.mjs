import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {replace} from './p3-patch.mjs';
import {gDevelopmentSQL} from './p3-g-runtime-patch.mjs';
// Deterministically compose from frozen000–028, never installed definitions.
// Running this generator writes a local migration only; it never connects to a DB.
const bundle=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const version='web-v0.1.18',path='database/migrations/029_p3_batch_g.sql';
const previous=await readFile('database/migrations/028_p3_batch_f.sql','utf8');
const oldProfile=JSON.parse(previous.match(/values\('ruleset:web-v0\.1\.17','([\s\S]*?)'::jsonb\)/)[1].replaceAll("''","'"));
const added=['character-009','character-012','character-021','character-022','character-028','character-033','character-042','character-049'];
const profile={manifest:d.ruleManifest(version),mapDefinition:d.mapForVersion(version),environment:d.environmentForVersion(version),sourceCatalog:d.sourceCatalogForVersion(version),runtimeData:d.runtimeForVersion(version),locationPolicy:d.classicLocationPolicy(version),characterTraits:Object.fromEntries(d.runtimeForVersion(version).characterIds.map(id=>[id,d.characterTraitsForVersion(version,id)])),p3:{...oldProfile.p3,characters:[...oldProfile.p3.characters,...added],batchG:true}};
let health=previous.match(/create or replace function public\.ml_health\(\)[\s\S]*?\$\$;/)[0];
health=health.replaceAll('ruleset:web-v0.1.17','ruleset:web-v0.1.18').replaceAll("'web-v0.1.17'","'web-v0.1.18'").replace("'engineRevision',28","'engineRevision',29").replace("'characterDefinitions',35","'characterDefinitions',43").replace("characterIds}')=35","characterIds}')=43");
health=health.replaceAll(JSON.stringify(oldProfile.p3.characters),JSON.stringify(profile.p3.characters));
health=replace(health,'count(*)=17 from ml_private.catalog','count(*)=18 from ml_private.catalog');
health=replace(health,"'ruleset:web-v0.1.18'))","'ruleset:web-v0.1.17','ruleset:web-v0.1.18'))");
health=replace(health,"value#>>'{manifest,status}'='playable'","value#>>'{manifest,status}'='playable' and value#>>'{p3,batchG}'='true'");
const required=['p3g_initial(jsonb,double precision)','p3g_initial_core(jsonb,double precision)','p3g_dispatch(jsonb,jsonb,double precision)','p3g_dispatch_core(jsonb,jsonb,double precision)','p3g_int(jsonb,integer)','p3g_dual_task(jsonb,jsonb,double precision)','p3g_equipment_valid(jsonb)','p3g_public_state(jsonb,integer)'];
health=replace(health,"as ready)",required.map(signature=>`and to_regprocedure('ml_private.${signature}') is not null`).join('\n ')+' as ready)');
health=replace(health,"'engine','postgresql'","'batchGReady',ready,'engine','postgresql'");
let out=`-- Approved G candidate. Frozen000–028 and every saved game/draft retain their version.\nDO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<28 THEN RAISE EXCEPTION 'Apply complete28 before29';END IF;END $$;\n`;
out+=await gDevelopmentSQL(profile,{activate:true});
out+=health+`\nrevoke all on all functions in schema ml_private from public;\nDO $$ declare r text;begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;\n`;
out=out.replaceAll('\r\n','\n').replace(/[\t ]+$/gm,'');
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==out)throw Error(path+' differs from generator');}else await writeFile(path,out);
console.log('029: G v18 candidate,43 characters; frozen predecessors retained. No database contacted.');
