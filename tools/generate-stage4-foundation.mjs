import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['packages/game-data/src/stage4.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const content={cards:d.STAGE4_CARDS,allCards:d.STAGE4_ALL_CARDS,policy:d.STAGE4_FOUNDATION_POLICY};
const json=JSON.stringify(content).replaceAll("'","''");
const helpers=(await readFile('database/engine/stage4-costs.sql','utf8')).replaceAll('\r\n','\n');
const body=`-- Stage 4A: approved 76/191 development data and private cost helpers.\n-- No ruleset, room default, public RPC or health revision is changed.\nDO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<16 THEN RAISE EXCEPTION 'Apply complete stage-three 016 first'; END IF; END $$;\ninsert into ml_private.catalog(key,value) values('stage4:foundation-v1','${json}'::jsonb) on conflict(key) do nothing;\nDO $$ BEGIN IF (select value from ml_private.catalog where key='stage4:foundation-v1')<>'${json}'::jsonb THEN RAISE EXCEPTION 'Stage-four foundation catalog mismatch';END IF;END $$;\n${helpers}\nrevoke all on all functions in schema ml_private from public;\nDO $$ declare r text;begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;\n`;
const path='database/migrations/017_stage4_foundation.sql';
if(process.argv.includes('--check')){
 if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==body)throw Error('Stage-four foundation SQL differs from reviewed data/helpers');
}else await writeFile(path,body);
console.log('017: approved 76/191 development catalog and private quote helpers; live engine remains 16.');
