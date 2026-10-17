import {readFile,readdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundled=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
const v='web-v0.1.6';
const profile={manifest:d.ruleManifest(v),mapDefinition:d.mapForVersion(v),environment:d.environmentForVersion(v),sourceCatalog:d.sourceCatalogForVersion(v),runtimeData:d.runtimeForVersion(v),locationPolicy:d.classicLocationPolicy(),characterTraits:Object.fromEntries(Object.keys(d.sourceCatalogForVersion(v).characters).map(id=>[id,d.characterTraitsForVersion(v,id)]))};
const functions=new Map();
for(const file of (await readdir('database/migrations')).filter(f=>/^0(?:0\d|1[0-4])_/.test(f)).sort())for(const m of (await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n').matchAll(/create or replace function ((?:ml_private|public)\.\w+)\([\s\S]*?\$\$;/gi))functions.set(m[1],m[0]);
const original=name=>{const body=functions.get('ml_private.'+name);if(!body)throw Error('Missing '+name);return body;};
const replace=(body,from,to)=>{if(!body.includes(from))throw Error('Stage-three hook drift: '+from.slice(0,100));return body.replace(from,to);};
function expand(body){return body.replaceAll("<>'web-v0.1.5'"," not in ('web-v0.1.5','web-v0.1.6')").replaceAll("='web-v0.1.5'"," in ('web-v0.1.5','web-v0.1.6')").replaceAll("'web-v0.1.5')","'web-v0.1.5','web-v0.1.6')");}
let out=`-- DEVELOPMENT engine, intentionally not a numbered release migration.\n-- No room-start or health default is changed here.\ninsert into ml_private.catalog(key,value) values('ruleset:${v}','${JSON.stringify(profile).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
// Frozen old behavior is kept behind dispatch wrappers. All private helpers
// whose version gates include classic rules are extended to the staged ruleset.
const custom=new Set(['create_game','pump','damage','heal','finish','validate','dispatch','choose','legal_steps','classic_walk','settle_movement','next_turn','teleport_cells','targets','public_view']);
for(const [name,body] of functions){const short=name.replace('ml_private.','');if(name.startsWith('ml_private.')&&!custom.has(short)&&body.includes('web-v0.1.5'))out+=expand(body)+'\n';}
out+=replace(original('runtime_data'),"profile#>>'{manifest,status}'='playable'","(profile#>>'{manifest,status}'='playable' or (v='web-v0.1.6' and profile#>>'{manifest,status}'='development'))")+'\n';
for(const name of custom){out+=expand(original(name)).replace('function ml_private.'+name+'(', 'function ml_private.'+name+'_before_stage3(')+'\n';}
let create=expand(original('create_game'));
create=replace(create,"chars:=s->'_shuffle';","chars:=case when rulev='web-v0.1.6' then jsonb_build_array(s->'_shuffle'->0,s->'_shuffle'->1,s->'_shuffle'->2,s->'_shuffle'->3) else s->'_shuffle' end;");
create=replace(create,"perform ml_private.need((select jsonb_agg(x order by x) from ml_private.arr(chars) x)=(select jsonb_agg(x order by x) from ml_private.arr(ml_private.game_data(s,'characterIds')) x),'四角色必须完整且唯一');","perform ml_private.need(case when rulev='web-v0.1.6' then jsonb_array_length(chars)=4 and (select count(distinct x) from ml_private.arr(chars) x)=4 and ml_private.game_data(s,'characterIds') @> chars else (select jsonb_agg(x order by x) from ml_private.arr(chars) x)=(select jsonb_agg(x order by x) from ml_private.arr(ml_private.game_data(s,'characterIds')) x) end,'四角色必须完整且唯一');");
create=replace(create,"'faction',c->'faction'","'faction',case when rulev='web-v0.1.6' and setup->>'mode'='team' then to_jsonb(case when teams->>a='A' then '机械猴子' else '帝汶家族' end) else c->'faction' end");
create=replace(create,"s:=ml_private.emit(s,'setup'","if rulev='web-v0.1.6' then s:=s||jsonb_build_object('stage3',ml_private.stage3_initial(),'cardStack',jsonb_build_object('serial',0,'stack','[]'::jsonb));end if;\n s:=ml_private.emit(s,'setup'");
out+=create+'\n';
let heal=original('heal');
heal=replace(heal,"if hp>0 then hp:=hp+case when food then ml_private.location_food_heal(s->>'version',p,amount) else least((p->>'maxHp')::int-hp,amount) end; end if;","if hp>0 then amount:=case when food then ml_private.location_food_heal(s->>'version',p,amount) else least((p->>'maxHp')::int-hp,amount) end;hp:=hp+case when s->>'version'='web-v0.1.6' then ml_private.stage3_healing(s,a,amount,food) else amount end;end if;");out+=heal+'\n';
let next=expand(original('next_turn'));next=replace(next,'begin\n','begin\n if s->>\'version\'=\'web-v0.1.6\' then s:=ml_private.stage3_turn_end(s,(s->>\'active\')::int);end if;\n');out+=next+'\n';
let damage=expand(original('damage')).replace('function ml_private.damage(s jsonb,hits jsonb,environment boolean default false)','function ml_private.stage3_damage(s jsonb,hits jsonb,environment boolean default false,skip_pursuit boolean default false)');
damage=replace(damage,'s:=ml_private.emit(s,\'eliminate\'',"if s->>'version'='web-v0.1.6' then s:=ml_private.stage3_death(s,a);end if;s:=ml_private.emit(s,'eliminate'");
damage=replace(damage,"and not (p->'rewarded' @> jsonb_build_array(src)) then", "and not (p->'rewarded' @> jsonb_build_array(src)) and (s->>'version'<>'web-v0.1.6' or ml_private.character_effect_allowed(jsonb_build_object('origin','role-locked','actor',a,'roleModifiers','[]'::jsonb),src,s#>>array['players',src::text,'character'])) then");
damage=replace(damage,"end loop; return s||jsonb_build_object('_triggers',triggers);",`end loop;
 if s->>'version'='web-v0.1.6' and not skip_pursuit then
 for h in select * from ml_private.arr(injured) loop src:=(h->>'source')::int;a:=(h->>'target')::int;
 if src is null or src=a or (s#>>array['players',src::text,'hp'])::int<=0 or (s#>>array['players',a::text,'hp'])::int<=0 or s#>>array['players',src::text,'character']<>'character-005' or not ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',src,'roleModifiers','[]'::jsonb),a,s#>>array['players',a::text,'character']) then continue;end if;
 if jsonb_array_length(s#>'{cardStack,stack}')>0 then
 if coalesce(s#>'{cardStack,stack,0,pursuits}','[]') @> jsonb_build_array(a) then continue;end if;
 s:=jsonb_set(s,'{cardStack,stack,0,pursuits}',coalesce(s#>'{cardStack,stack,0,pursuits}','[]')||jsonb_build_array(a));end if;
 triggers:=triggers||jsonb_build_array(jsonb_build_object('kind','stage3','action','qb','actor',src,'target',a));end loop;end if;
 return s||jsonb_build_object('_triggers',triggers);`);out+=damage+'\n';
// Rest of the staged state machine is maintained as explicit SQL alongside the
// TypeScript engine, with differential tests as the compatibility contract.
out+=(await readFile('database/engine/stage3-engine.sql','utf8')).replaceAll('\r\n','\n');
out+=`\nrevoke all on all functions in schema ml_private from public;\nDO $$ declare r text;begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;\n`;
const path='database/engine/stage3-generated.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==out)throw Error('Stage-three engine SQL differs');}else await writeFile(path,out);
console.log('Staged v0.1.6 engine generated; default rooms remain v0.1.5.');
