import {readFile,readdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const version='web-v0.1.9',functions=new Map();
for(const file of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<=19).sort())
 for(const m of (await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n').matchAll(/create or replace function ((?:ml_private|public)\.\w+)\([\s\S]*?\$\$;/gi))functions.set(m[1],m[0]);
const replace=(s,a,b)=>{if(!s.includes(a))throw Error('020 anchor drift: '+a);return s.replace(a,()=>b);};
const profile={manifest:d.ruleManifest(version),mapDefinition:d.mapForVersion(version),environment:d.environmentForVersion(version),sourceCatalog:d.sourceCatalogForVersion(version),runtimeData:d.runtimeForVersion(version),locationPolicy:d.classicLocationPolicy(),characterTraits:Object.fromEntries(Object.keys(d.sourceCatalogForVersion(version).characters).map(id=>[id,d.characterTraitsForVersion(version,id)]))};
let out=`-- Approved exercise changes. Frozen000–019 are inputs, never overwritten.\nDO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<19 THEN RAISE EXCEPTION 'Apply complete019 before020';END IF;END $$;\ninsert into ml_private.catalog(key,value) values('ruleset:${version}','${JSON.stringify(profile).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
out+=await readFile('database/engine/exercise-helpers.sql','utf8');
for(const [name,raw] of functions){
 if(name==='public.ml_health')continue;
 let body=raw.replace(/\b((?:not\s+)?in\s*\([^)]*)'web-v0\.1\.8'(\s*\))/g,"$1'web-v0.1.8','web-v0.1.9'$2")
 .replace(/<>\s*'web-v0\.1\.8'/g," not in ('web-v0.1.8','web-v0.1.9')").replace(/(?<![<>=!])=\s*'web-v0\.1\.8'/g," in ('web-v0.1.8','web-v0.1.9')");
 const short=name.split('.')[1];
 // Centralize every physical insertion, including legacy delegates used by v9.
 body=body.replace(/jsonb_set\(s,'\{discard\}',\(s->'discard'\)\|\|jsonb_build_array\(([^)]*)\)\)/g,'ml_private.exercise_discard(s,jsonb_build_array($1))');
 body=body.replaceAll("s:=s||jsonb_build_object('discard',(s->'discard')||(p->'hand'));","s:=ml_private.exercise_discard(s,p->'hand');");
 body=body.replaceAll("s:=s||jsonb_build_object('discard',(s->'discard')||cards);","s:=ml_private.exercise_discard(s,cards);");
 body=body.replaceAll("s:=s||jsonb_build_object('discard',(s->'discard')||(s->'resolving'),'resolving','[]'::jsonb,'attack',null);","s:=ml_private.exercise_discard(s,s->'resolving')||jsonb_build_object('resolving','[]'::jsonb,'attack',null);");
 body=body.replaceAll("s:=s||jsonb_build_object('discard',(s->'discard')||(s->'resolving'),'resolving','[]'::jsonb);","s:=ml_private.exercise_discard(s,s->'resolving')||jsonb_build_object('resolving','[]'::jsonb);");
 if(short==='draw')body=replace(body,"p:=p||jsonb_build_object('hand'","s:=ml_private.exercise_remember(s,a,s#>>'{deck,0}');p:=p||jsonb_build_object('hand'");
 if(short==='stage3_responses'){
  body=replace(body,"where ((split_part", "where ml_private.exercise_response(s,pending->>'definition',card#>>'{}') or ((split_part");
 }
 if(short==='choose_before_stage4')body=replace(body,"pending:=s#>'{cardStack,stack,-1}';quoted:=ml_private.stage3_card_cost(s,a,card);", "pending:=s#>'{cardStack,stack,-1}';perform ml_private.need(ml_private.stage3_responses(s,a,pending) ? card,'响应牌已失效');quoted:=case when ml_private.exercise_response(s,pending->>'definition',card) then jsonb_build_object('cost',0,'effect',jsonb_build_object('origin','card','actor',a,'faction',s#>array['players',a::text,'faction'],'roleModifiers','[]'::jsonb)) else ml_private.stage3_card_cost(s,a,card) end;");
 if(short==='stage3_actions')body=replace(body,"cost:=case when d->>'randomCost'","cost:=case when s#>>'{choice,kind}'='response' and (s#>>'{choice,actor}')::int=a and s#>'{choice,cards}' ? card and ml_private.exercise_response(s,s#>>'{cardStack,stack,-1,definition}',card) then '0'::jsonb when d->>'randomCost'");
 if(short==='stage4_actions')body=replace(body,"'printedCost',d->'printedCost'", "'printedCost',case when s->>'version'='web-v0.1.9' and ml_private.exercise_rank(card)>0 then to_jsonb(ml_private.rule_card(s,card)->>'cost') else d->'printedCost' end");
 if(short==='stage4_create_draft')body=body.replaceAll("'web-v0.1.8'","'web-v0.1.9'");
 if(body!==raw)out+=body+'\n';
}
let health=functions.get('public.ml_health').replaceAll("'web-v0.1.8'","'web-v0.1.9'").replace("'engineRevision',19","'engineRevision',20").replace('count(*)=8 from ml_private.catalog','count(*)=9 from ml_private.catalog');
health=health.replace("'ruleset:web-v0.1.7','ruleset:web-v0.1.9'))","'ruleset:web-v0.1.7','ruleset:web-v0.1.8','ruleset:web-v0.1.9'))");
health=health.replaceAll("key='ruleset:web-v0.1.8'","key='ruleset:web-v0.1.9'").replace("'ruleset:web-v0.1.8'))","'ruleset:web-v0.1.8','ruleset:web-v0.1.9'))");
out+=health+'\nrevoke all on all functions in schema ml_private from public;\nDO $$ declare r text;begin foreach r in array array[\'anon\',\'authenticated\'] loop execute format(\'revoke all on all functions in schema ml_private from %I\',r);end loop;end $$;\n';
out=out.replaceAll('\r\n','\n').replace(/[\t ]+$/gm,'');
const path='database/migrations/020_p2_exercise_rules.sql';
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==out)throw Error('020 generated patch differs');}else await writeFile(path,out);
console.log('020: v9 exercise, revision20; released000–019 untouched.');
