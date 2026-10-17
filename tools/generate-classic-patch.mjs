import {readFile,readdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const v=d.PATCH_RULE_VERSION;
const profile={manifest:d.ruleManifest(v),mapDefinition:d.mapForVersion(v),environment:d.environmentForVersion(v),sourceCatalog:d.sourceCatalogForVersion(v),runtimeData:d.runtimeForVersion(v),locationPolicy:d.classicLocationPolicy(),characterTraits:Object.fromEntries(Object.keys(d.sourceCatalogForVersion(v).characters).map(id=>[id,d.characterTraitsForVersion(v,id)]))};
const functions=new Map();
for(const file of (await readdir('database/migrations')).filter(f=>/^0(?:0\d|1[0-2])_/.test(f)).sort()){
 const src=(await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n');
 for(const m of src.matchAll(/create or replace function ((?:ml_private|public)\.\w+)\([\s\S]*?\$\$;/gi))functions.set(m[1],m[0]);
}
const original=name=>{const s=functions.get('ml_private.'+name);if(!s)throw Error('Missing function '+name);return s;};
function expand(s){
 s=s.replaceAll("='web-v0.1.4'", " in ('web-v0.1.4','web-v0.1.5')").replaceAll("<>'web-v0.1.4'", " not in ('web-v0.1.4','web-v0.1.5')");
 return s.replaceAll("'web-v0.1.4')", "'web-v0.1.4','web-v0.1.5')");
}
let sql=`-- Approved feedback patch: protected regions, cave resident, card response and authority RNG.\n-- Immutable 000-013 are not regenerated. Stage 3 characters remain separate.\nDO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<12 THEN RAISE EXCEPTION 'Apply complete 012 before 014'; END IF; END $$;\ninsert into ml_private.catalog(key,value) values('ruleset:${v}','${JSON.stringify(profile).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
for(const [name,body] of functions){
 if(!name.startsWith('ml_private.')||!body.includes('web-v0.1.4')||['ml_private.classic_refresh','ml_private.classic_environment','ml_private.classic_relocated'].includes(name))continue;
 let s=expand(body);
 if(name==='ml_private.create_game'){
  s=s.replaceAll("then 'web-v0.1.4' else", "then 'web-v0.1.5' else");
  s=s.replace("s:=s-'_spawns';", "s:=s-'_spawns';");
  s=s.replace("s:=ml_private.emit(s,'setup'", "if rulev='web-v0.1.5' then s:=jsonb_set(s,'{classic}',(s->'classic')||jsonb_build_object('bombRound',0,'caveEnds','[0,0,0,0]'::jsonb));end if;\n s:=ml_private.emit(s,'setup'");
 }
 if(name==='ml_private.pump'){
  s=s.replace("if (p->>'ap')::int<5 then", "if (p->>'ap')::int<5 and (s->>'version'<>'web-v0.1.5' or p->>'character'<>'character-031') then");
  s=s.replace("(ml_private.rule_card(s,c#>>'{}')->>'id'='basic-001' or", "((ml_private.rule_card(s,c#>>'{}')->>'id'='basic-001' and (s->>'version'<>'web-v0.1.5' or ml_private.rule_card(s,s#>>'{attack,card}')->>'id'<>'basic-009')) or");
  const marker="when 'end-draw' then s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','discard'))";
  if(!s.includes(marker))throw Error('end-draw hook drift');
  s=s.replace(marker,"when 'end-draw' then s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind',case when s->>'version'='web-v0.1.5' then 'cave-end' else 'discard' end))");
  s=s.replace("when 'discard' then",`when 'cave-end' then s:=ml_private.cave_ending(s,a);if jsonb_array_length(s->'_hits')>0 then s:=ml_private.damage(s,s->'_hits',true);s:=jsonb_set(s,'{queue}',(s->'_triggers')||jsonb_build_array(jsonb_build_object('kind','cave-after','actor',a))||(s->'queue'));s:=s-'_triggers';else s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','cave-after','actor',a))||(s->'queue'));end if;s:=s-'_hits';
   when 'cave-after' then s:=ml_private.finish(s,false,at);if s->>'phase'<>'over' then s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','discard','actor',a))||(s->'queue'));end if;
   when 'discard' then`);
 }
 if(name==='ml_private.validate')s=s.replace("perform ml_private.need((s#>>'{clock,remaining}')", "if s->>'version'='web-v0.1.5' then perform ml_private.need(jsonb_array_length(s#>'{classic,caveEnds}')=4 and not exists(select 1 from ml_private.arr(s#>'{classic,caveEnds}') n where jsonb_typeof(n)<>'number' or (n#>>'{}')::numeric<>trunc((n#>>'{}')::numeric) or (n#>>'{}')::int not between 0 and 2),'山洞计数无效');end if;\n perform ml_private.need((s#>>'{clock,remaining}')");
 sql+=s+'\n';
}
// end_turn has no literal version before this patch; use an explicit version branch.
sql+=expand(original('end_turn')).replace("case when timeout then 'discard' else 'end-draw' end", "case when timeout then case when s->>'version'='web-v0.1.5' then 'cave-end' else 'discard' end else 'end-draw' end")+'\n';
// Start seat is drawn independently at the trusted room boundary. No client field accepted.
sql+=original('room_v1').replace("'seed',0,'seats'", "'seed',0,'first',ml_private.entropy(4),'seats'")+'\n';
for(const name of ['classic_refresh','classic_environment'])sql+=original(name).replace('ml_private.'+name+'(', 'ml_private.'+name+'_before_patch(')+'\n';
sql+=(await readFile('database/engine/classic-patch.sql','utf8')).replaceAll('\r\n','\n');
sql+=`create or replace function public.ml_health() returns jsonb language sql security definer set search_path=pg_catalog as $$
 with readiness as (select coalesce((select value#>>'{manifest,status}'='playable' and jsonb_array_length(value#>'{runtimeData,allCards}')=64 and jsonb_array_length(value#>'{runtimeData,characterIds}')=4 and value#>>'{characterTraits,character-004,faction}'='帝汶家族' and value#>>'{characterTraits,character-004,spawnRegion}'='操场' and value#>>'{environment,kind}'='classic-regions-v2' and value#>>'{environment,poisonRegionCount}'='11' and value#>'{environment,protectedRegions}'='["教学楼","操场","办公室"]'::jsonb and value#>>'{environment,caveEveryPersonalEnds}'='3' and value#>>'{environment,caveApLoss}'='2' and value#>>'{environment,caveDamage}'='1' from ml_private.catalog where key='ruleset:web-v0.1.5'),false) and to_regprocedure('ml_private.cave_ending(jsonb,integer)') is not null and to_regprocedure('ml_private.patch_poison_regions(text)') is not null and to_regprocedure('ml_private.patch_bomb_regions(jsonb)') is not null and to_regprocedure('ml_private.classic_walk(jsonb,jsonb,double precision)') is not null as ready)
 select jsonb_build_object('ok',true,'schemaVersion',2,'engineRevision',14,'ruleVersion','web-v0.1.5','legacyRuleVersions',jsonb_build_array('web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4'),'feedbackRulesReady',true,'versionedDataReady',(select count(*)=5 from ml_private.catalog where key like 'ruleset:web-v0.1.%'),'locationDataReady',ready,'locationRulesReady',ready,'waterRulesReady',ready,'environmentRulesReady',ready,'classicPlayable',ready,'classicPatchReady',ready,'classicRuleVersion','web-v0.1.5','engine','postgresql') from readiness $$;
revoke all on all functions in schema ml_private from public;
DO $$ declare r text; begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;
`;
const path='database/migrations/014_classic_feedback_patch.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==sql)throw Error('Classic patch SQL differs');}else await writeFile(path,sql);
console.log('014: approved v0.1.5 classic feedback patch; legacy profiles preserved.');
