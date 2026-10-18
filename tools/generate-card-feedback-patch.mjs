import {readFile,readdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const version='web-v0.1.10',functions=new Map();
for(const file of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<=20).sort())
 for(const m of (await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n').matchAll(/create or replace function ((?:ml_private|public)\.\w+)\([\s\S]*?\$\$;/gi))functions.set(m[1],m[0]);
const replace=(s,a,b)=>{if(!s.includes(a))throw Error('021 anchor drift: '+a);return s.replace(a,()=>b);};
const profile={manifest:d.ruleManifest(version),mapDefinition:d.mapForVersion(version),environment:d.environmentForVersion(version),sourceCatalog:d.sourceCatalogForVersion(version),runtimeData:d.runtimeForVersion(version),locationPolicy:d.classicLocationPolicy(version),characterTraits:Object.fromEntries(Object.keys(d.sourceCatalogForVersion(version).characters).map(id=>[id,d.characterTraitsForVersion(version,id)]))};
let out=`-- Approved card feedback: versioned location bans and attack-only JJ exposure. Frozen000–020 remain unchanged.\nDO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<20 THEN RAISE EXCEPTION 'Apply complete020 before021';END IF;END $$;\ninsert into ml_private.catalog(key,value) values('ruleset:${version}','${JSON.stringify(profile).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
for(const [name,raw] of functions){
 if(name==='public.ml_health')continue;
 let body=raw.replace(/\b((?:not\s+)?in\s*\([^)]*)'web-v0\.1\.9'(\s*\))/g,"$1'web-v0.1.9','web-v0.1.10'$2")
 .replace(/<>\s*'web-v0\.1\.9'/g," not in ('web-v0.1.9','web-v0.1.10')").replace(/(?<![<>=!])=\s*'web-v0\.1\.9'/g," in ('web-v0.1.9','web-v0.1.10')");
 const short=name.split('.')[1];
 if(short==='location_card_allowed')body=`create or replace function ml_private.location_card_allowed(v text,cell text,card text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select case when v='web-v0.1.10' then not (coalesce(ml_private.version_catalog(v)#>array['locationPolicy','prohibitedCards',ml_private.region_at(v,cell)],'[]'::jsonb) ? split_part(card,'#',1)) else not (v in ('web-v0.1.4','web-v0.1.5','web-v0.1.6','web-v0.1.7','web-v0.1.8','web-v0.1.9') and ml_private.region_at(v,cell) in ('教学楼','秀松苑') and split_part(card,'#',1) in ('basic-009','basic-010')) end $$;`;
 if(short==='stage3_monkey_targets')body=replace(body,"if not boost and ml_private.runtime_data('web-v0.1.5','map')#>>array[p->>'cell','region'] in ('教学楼','秀松苑') then",`if not boost and (case when s->>'version'='web-v0.1.10' then not ml_private.location_card_allowed(s->>'version',p->>'cell','basic-010') and not (coalesce((s#>>array['stage4','terrainIgnore',a::text])::boolean,false) and ml_private.stage3_equipped(s,a,'basic-069')) else ml_private.runtime_data('web-v0.1.5','map')#>>array[p->>'cell','region'] in ('教学楼','秀松苑') end) then`);
 if(short==='stage3_jj_targets'){
  body=replace(body,"s#>>array['players',a::text,'character']='character-023'","(s#>>array['players',a::text,'character']='character-023' or s->>'version'='web-v0.1.10' and coalesce((s#>>array['stage4','tea',a::text])::boolean,false))");
  body=replace(body,' select (p->>\'seat\')::int into jj',` if s->>'version'='web-v0.1.10' and d->>'type'<>'attack' and d->>'id'<>'basic-002' then return jsonb_build_object('targets',targets,'effect',effect);end if;\n select (p->>'seat')::int into jj`);
  body=replace(body,"d->>'type'='attack' and coalesce(d->>'group','false')<>'true'", "(d->>'type'='attack' or s->>'version'='web-v0.1.10' and d->>'id'='basic-002') and coalesce(d->>'group','false')<>'true'");
 }
 if(short==='stage4_map_task')body=replace(body,"jsonb_build_object('serial',c->'serial')));end if;end if;\n  else raise exception '未知阶段四地图任务'", "jsonb_build_object('serial',c->'serial')));elsif s->>'version'='web-v0.1.10' then s:=ml_private.emit(s,'effect','卫汶找你：没有合法传送落点，位置不变');end if;end if;\n  else raise exception '未知阶段四地图任务'");
 if(short==='stage4_map_choose'){
  body=replace(body,"s:=ml_private.emit(s,'dice','卫汶找你：d6 = '||roll,to_jsonb(roll));",`s:=ml_private.emit(s,'dice','卫汶找你：d6 = '||roll,to_jsonb(roll));if s->>'version'='web-v0.1.10' then s:=ml_private.emit(s,'effect',case when timeout or (cmd->>'guess')::int<>roll then '卫汶找你：S'||(a+1)||case when timeout then '猜点超时' else '猜错' end||'，由S'||((pending->>'actor')::int+1)||'选择传送落点' else '卫汶找你：S'||(a+1)||'猜中，位置不变' end);end if;`);
  body=replace(body,"s:=s-'_relocationTasks';end if;return s;\n elsif kind='board-return'",`s:=s-'_relocationTasks';elsif s->>'version'='web-v0.1.10' then s:=ml_private.emit(s,'effect','卫汶找你：S'||(a+1)||case when timeout then '选择超时' else '放弃传送' end||'，位置不变');end if;return s;\n elsif kind='board-return'`);
 }
 if(short==='stage4_create_draft')body=body.replaceAll("'web-v0.1.9'","'web-v0.1.10'");
 if(body!==raw)out+=body+'\n';
}
let health=functions.get('public.ml_health').replaceAll("key='ruleset:web-v0.1.9'","key='ruleset:web-v0.1.10'").replace("'engineRevision',20","'engineRevision',21").replaceAll("'ruleVersion','web-v0.1.9'","'ruleVersion','web-v0.1.10'").replaceAll("'classicRuleVersion','web-v0.1.9'","'classicRuleVersion','web-v0.1.10'").replace('count(*)=9 from ml_private.catalog','count(*)=10 from ml_private.catalog').replace("'ruleset:web-v0.1.9'))","'ruleset:web-v0.1.9','ruleset:web-v0.1.10'))");
health=replace(health,"and value#>>'{environment,caveDamage}'='1'",`and value#>>'{environment,caveDamage}'='1'
 and value#>'{locationPolicy,prohibitedCards,教学楼}'='["basic-009"]'::jsonb
 and value#>'{locationPolicy,prohibitedCards,秀松苑}'='["basic-010"]'::jsonb`);
out+=health+`\nrevoke all on all functions in schema ml_private from public;\nDO $$ declare r text;begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;\n`;
out=out.replaceAll('\r\n','\n').replace(/[\t ]+$/gm,'');
const path='database/migrations/021_p2_card_feedback.sql';
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==out)throw Error('021 generated patch differs');}else await writeFile(path,out);
console.log('021: v10 card feedback, revision21; frozen000–020 untouched.');
