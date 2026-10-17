import {readFile,readdir,writeFile} from 'node:fs/promises';
// Immutable 010 baseline. Later stages use new migrations, never regenerate old payloads from live profiles.
const baseline=JSON.parse(await readFile('packages/game-data/src/baselines/stage1-catalogs.json','utf8'));
let sql=`-- Generated versioned catalogs and adapters. Regenerate with tools/generate-versioned-data.mjs.
-- Foundation data only for web-v0.1.4; no change to the default new-match version.
DO $$ BEGIN
 IF coalesce((public.ml_health()->>'engineRevision')::int,0)<9 THEN
  RAISE EXCEPTION 'Apply 009_unlimited_attacks.sql before 010_versioned_catalog.sql';
 END IF;
END $$;
`;
for(const [version,value] of Object.entries(baseline)){
 sql+=`insert into ml_private.catalog(key,value) values ('ruleset:${version}','${JSON.stringify(value).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
}

sql+=`
create or replace function ml_private.version_catalog(v text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare result jsonb; begin
 select value into result from ml_private.catalog where key='ruleset:'||v;
 perform ml_private.need(result is not null,'未知规则版本'); return result;
end $$;
create or replace function ml_private.runtime_data(v text,k text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare profile jsonb:=ml_private.version_catalog(v); result jsonb; begin
 perform ml_private.need(profile#>>'{manifest,status}'='playable','经典图仅完成数据基础，后续规则未启用');
 result:=profile->'runtimeData'->k; perform ml_private.need(result is not null,'未知版本数据键'); return result;
end $$;
create or replace function ml_private.game_data(s jsonb,k text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.runtime_data(s->>'version',k) $$;
create or replace function ml_private.rule_card(s jsonb,card text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.game_data(s,'cards')->split_part(card,'#',1) $$;
create or replace function ml_private.distance_for_version(v text,a text,b text) returns integer language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare m jsonb:=ml_private.version_catalog(v)#>'{mapDefinition,map}'; begin
 perform ml_private.need(m ? a and m ? b,'位置无效');
 return abs((m->a->>'row')::int-(m->b->>'row')::int)+abs((m->a->>'col')::int-(m->b->>'col')::int);
end $$;
`;
// Only the pre-010 definitions are inputs. Historical migrations remain byte-identical.
const functions=new Map();
for(const file of (await readdir('database/migrations')).filter(f=>/^00\d_.*\.sql$/.test(f)).sort()){
 const text=(await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n');
 for(const match of text.matchAll(/create or replace function (ml_private\.\w+)\((.*?)\) returns [\s\S]*?\$\$[\s\S]*?\$\$;/g))functions.set(match[1],match[0]);
}
for(const name of ['safe','neighbor','candidates']){
 let body=functions.get('ml_private.'+name);if(!body)throw Error('Missing '+name);
 body=body.replace('ml_private.'+name+'(',`ml_private.${name}_for_version(v text,`)
  .replaceAll('ml_private.data(', 'ml_private.runtime_data(v,')
  .replaceAll('ml_private.safe(', 'ml_private.safe_for_version(v,')
  .replaceAll('ml_private.distance(', 'ml_private.distance_for_version(v,');
 if(name==='neighbor')body=body.replaceAll("ml_private.runtime_data(v,'cells')","ml_private.version_catalog(v)#>'{mapDefinition,cells}'");
 sql+=body+'\n';
}
for(const name of ['name','resolve_attack','start_round','next_turn','pump','choose','validate','teleport_cells','escape','legal_steps','targets','create_game','dispatch']){
 let body=functions.get('ml_private.'+name);if(!body)throw Error('Missing '+name);
 body=body.replaceAll('ml_private.data(', 'ml_private.game_data(s,')
  .replaceAll('ml_private.card(', 'ml_private.rule_card(s,')
  .replaceAll('ml_private.distance(', "ml_private.distance_for_version(s->>'version',")
  .replaceAll('ml_private.neighbor(', "ml_private.neighbor_for_version(s->>'version',")
  .replaceAll('ml_private.safe(', "ml_private.safe_for_version(s->>'version',")
  .replaceAll('ml_private.candidates(', "ml_private.candidates_for_version(s->>'version',");
 if(name==='create_game'){
  body=body.replace('declare s jsonb;',"declare rulev text:=coalesce(setup->>'ruleVersion',case when coalesce((setup->>'secure')::boolean,false) then 'web-v0.1.3' else 'web-v0.1.1' end); s jsonb;")
   .replace("perform ml_private.need(jsonb_typeof(setup)=", "perform ml_private.runtime_data(rulev,'characterIds');\n perform ml_private.need(jsonb_typeof(setup)=")
   .replace("s:=jsonb_build_object('random',randomj)","s:=jsonb_build_object('version',rulev,'random',randomj)");
 }
 sql+=body+'\n';
}
sql+=`
-- Stage-1 spawn helpers: called only by the owner/test engine until classic gameplay is enabled.
create or replace function ml_private.spawn_candidates(v text,id text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare profile jsonb:=ml_private.version_catalog(v); region text; begin
 region:=profile#>>array['sourceCatalog','characters',id,'spawnRegion'];
 perform ml_private.need(region is not null,'角色未在此版本目录');
 return (select coalesce(jsonb_agg(c->'id'),'[]') from ml_private.arr(profile#>'{mapDefinition,cells}') c where c->>'region'=region);
end $$;
create or replace function ml_private.allocate_spawns(v text,ids jsonb,s jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare profile jsonb:=ml_private.version_catalog(v); id text; region text; groups integer; candidates jsonb; used jsonb:='[]'; cells jsonb:='[]'; cell jsonb; begin
 perform ml_private.need(profile#>>'{manifest,status}'='foundation','旧版使用固定坐标出生');
 perform ml_private.need(jsonb_typeof(ids)='array' and jsonb_array_length(ids)=4 and (select count(distinct x) from ml_private.arr(ids) x)=4,'必须有四个不同角色');
 for id in select x#>>'{}' from ml_private.arr(ids) x loop
  perform ml_private.need(not (profile#>'{manifest,spawnConflicts}' ? id),'lemon出生地区与补充转述冲突，待确认');
  candidates:=ml_private.spawn_candidates(v,id); region:=profile#>>array['sourceCatalog','characters',id,'spawnRegion'];
  select count(*) into groups from ml_private.arr(ids) x where profile#>>array['sourceCatalog','characters',x#>>'{}','spawnRegion']=region;
  perform ml_private.need(jsonb_array_length(candidates)>0 and groups<=jsonb_array_length(candidates),'出生地区空格不足');
 end loop;
 for id in select x#>>'{}' from ml_private.arr(ids) x loop
  select jsonb_agg(x) into candidates from ml_private.arr(ml_private.spawn_candidates(v,id)) x where not used @> jsonb_build_array(x);
  s:=ml_private.int(s,jsonb_array_length(candidates)); cell:=candidates->(s->>'_int')::int;
  used:=used||jsonb_build_array(cell); cells:=cells||jsonb_build_array(cell); s:=s-'_int';
 end loop;
 return s||jsonb_build_object('_spawns',cells);
end $$;
create or replace function public.ml_health() returns jsonb language sql security definer
set search_path=pg_catalog as $$ select jsonb_build_object('ok',true,'schemaVersion',2,'engineRevision',10,'feedbackRulesReady',true,'versionedDataReady',
 to_regprocedure('ml_private.game_data(jsonb,text)') is not null and
 (select count(*)=4 from ml_private.catalog where key in ('ruleset:web-v0.1.1','ruleset:web-v0.1.2','ruleset:web-v0.1.3','ruleset:web-v0.1.4')),
 'ruleVersion','web-v0.1.3','legacyRuleVersion','web-v0.1.1','legacyRuleVersions',jsonb_build_array('web-v0.1.1','web-v0.1.2'),
 'foundationRuleVersion','web-v0.1.4','classicPlayable',false,'engine','postgresql',
 'features',jsonb_build_array('deferred-movement','spectators','chat','feedback-rules','classic-layout-data','unlimited-attacks','versioned-data','classic-foundation')) $$;
revoke all on all functions in schema ml_private from public;
DO $$ declare role_name text; begin
 foreach role_name in array array['anon','authenticated'] loop
  execute format('revoke all on all functions in schema ml_private from %I',role_name);
 end loop;
end $$;
`;
const path='database/migrations/010_versioned_catalog.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==sql)throw Error('Versioned SQL differs from reviewed source profiles/adapters');}
else await writeFile(path,sql);
console.log('Versioned SQL: three playable legacy profiles, one classic foundation; no old migration or running room rewritten.');
