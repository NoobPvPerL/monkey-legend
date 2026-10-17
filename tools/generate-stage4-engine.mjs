import {readFile,readdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {stage4TerrainHooks} from './stage4-terrain-hooks.mjs';
import {stage4BoardHooks} from './stage4-board-hooks.mjs';
const bundle=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const version='web-v0.1.7';
if(d.STAGE4_ENGINE_REMAINING.length)throw Error('Stage-four incomplete abilities');
const profile={manifest:d.ruleManifest(version),mapDefinition:d.mapForVersion(version),environment:d.environmentForVersion(version),sourceCatalog:d.sourceCatalogForVersion(version),runtimeData:d.runtimeForVersion(version),locationPolicy:d.classicLocationPolicy(),characterTraits:Object.fromEntries(Object.keys(d.sourceCatalogForVersion(version).characters).map(id=>[id,d.characterTraitsForVersion(version,id)]))};
const functions=new Map();
for(const file of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<=16).sort())
 for(const m of (await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n').matchAll(/create or replace function (ml_private\.\w+)\([\s\S]*?\$\$;/gi))functions.set(m[1],m[0]);
const old=name=>{const body=functions.get('ml_private.'+name);if(!body)throw Error('Missing '+name);return body;};
const replace=(body,from,to)=>{if(!body.includes(from))throw Error('Stage-four hook drift: '+from);return body.replace(from,()=>to);};
function expand(body){
 body=body.replace(/\b((?:not\s+)?in\s*\([^)]*)'web-v0\.1\.6'(\s*\))/g,"$1'web-v0.1.6','web-v0.1.7'$2")
  .replace(/<>\s*'web-v0\.1\.6'/g," not in ('web-v0.1.6','web-v0.1.7')")
  .replace(/(?<![<>=!])=\s*'web-v0\.1\.6'/g," in ('web-v0.1.6','web-v0.1.7')");
 if(/\(s jsonb/.test(body))body=body.replaceAll('ml_private.stage3_content()',"(case when s->>'version'='web-v0.1.7' then ml_private.stage3_content()||jsonb_build_object('cards',ml_private.game_data(s,'cards')) else ml_private.stage3_content() end)");
 return body;
}
let out=`-- DEVELOPMENT stage-four engine. Formal room version and health remain16.\ninsert into ml_private.catalog(key,value) values('ruleset:${version}','${JSON.stringify(profile).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
out+=`insert into ml_private.catalog(key,value) values('stage4:capabilities-v1','${JSON.stringify(d.STAGE4_ENGINE_IMPLEMENTED)}'::jsonb) on conflict(key) do nothing;\n`;
out+=(await readFile('database/engine/stage4-board.sql','utf8')).replaceAll('\r\n','\n');
out+=(await readFile('database/engine/stage4-terrain.sql','utf8')).replaceAll('\r\n','\n');
const aliases=new Set(['stage3_play','stage3_skill','stage3_handle_task','stage3_turn_start','stage3_damage','stage3_close_card','choose','public_view']);
for(const [name,raw] of functions){
 let body=expand(raw),short=name.slice('ml_private.'.length);
 if(short==='occupied')body=replace(body,"(p->>'hp')::int>0", "(p->>'hp')::int>0 and (s->>'version'<>'web-v0.1.7' or ml_private.stage4_on_board(s,(p->>'seat')::int))");
 if(short==='stage3_can_enter'){body=replace(body,"as $$ select","as $$ select case when s->>'version'='web-v0.1.7' then ml_private.stage4_board_entry(s,a,cell) else (");body=body.replace(/ \$\$;$/,()=>") end $$;");}
 if(short==='stage3_card_allowed')body=replace(body,"if p is null or", "if (s->>'version'='web-v0.1.7' and s#>>array['stage4','offMap',target::text]='true') or p is null or");
 if(short==='stage3_role_targets')body=replace(body,"(p->>'hp')::int>0", "(p->>'hp')::int>0 and (s->>'version'<>'web-v0.1.7' or ml_private.stage4_on_board(s,(p->>'seat')::int))");
 if(short==='stage3_monkey_targets')body=replace(body,"(q->>'hp')::int>0", "(q->>'hp')::int>0 and (s->>'version'<>'web-v0.1.7' or ml_private.stage4_on_board(s,(q->>'seat')::int))");
 if(short==='stage3_empty_entry')body=replace(body,"(p->>'hp')::int>0", "(p->>'hp')::int>0 and (s->>'version'<>'web-v0.1.7' or ml_private.stage4_on_board(s,(p->>'seat')::int))");
 if(short==='stage3_elbow_targets')body=replace(body,"where s#>>", "where (s->>'version'<>'web-v0.1.7' or not ml_private.stage4_single_protected(s,a,(t#>>'{}')::int)) and s#>>");
 if(short==='heal')body=replace(body,"if hp>0 then", "if hp>0 and (s->>'version'<>'web-v0.1.7' or ml_private.stage4_on_board(s,a)) then");
 if(short==='classic_owes_water'){
  body=replace(body,"ml_private.classic_water(s,s->'players'->a->>'cell')", "(case when s->>'version'='web-v0.1.7' then ml_private.stage4_board_water(s,s->'players'->a->>'cell',a) else ml_private.classic_water(s,s->'players'->a->>'cell') end)");
  body=replace(body,"ml_private.classic_water(s,origin)", "(case when s->>'version'='web-v0.1.7' then ml_private.stage4_board_water(s,origin,a) else ml_private.classic_water(s,origin) end)");
  body=replace(body,"(s->'players'->a->>'hp')::int>0", "(s->'players'->a->>'hp')::int>0 and (s->>'version'<>'web-v0.1.7' or ml_private.stage4_on_board(s,a))");
 }
 if(short==='classic_step_cost')body=replace(body,"ml_private.classic_water(s,cell)", "(case when s->>'version'='web-v0.1.7' then ml_private.stage4_board_water(s,cell,a) else ml_private.classic_water(s,cell) end)");
 if(short==='classic_landings'){
  body=replace(body,"origin->>'terrain'<>'land'", "(case when s->>'version'='web-v0.1.7' then ml_private.stage4_board_water(s,origin->>'id',a) else origin->>'terrain'<>'land' end)");
  body=replace(body,"cell->>'terrain' is distinct from 'water'", "(case when s->>'version'='web-v0.1.7' then cell is null or not ml_private.stage4_board_water(s,cell->>'id',a) else cell->>'terrain' is distinct from 'water' end)");
  body=replace(body,"while cell->>'terrain'='water'", "while (case when s->>'version'='web-v0.1.7' then cell is not null and ml_private.stage4_board_water(s,cell->>'id',a) else cell->>'terrain'='water' end)");
  body=replace(body,"nearc->>'terrain'='land'", "(case when s->>'version'='web-v0.1.7' then not ml_private.stage4_board_water(s,nearc->>'id',a) else nearc->>'terrain'='land' end)");
  body=body.replaceAll("ml_private.classic_enter(s,cell->>'id')", "(case when s->>'version'='web-v0.1.7' then ml_private.stage4_board_entry(s,a,cell->>'id') else ml_private.classic_enter(s,cell->>'id') end)")
   .replaceAll("ml_private.classic_enter(s,nearc->>'id')", "(case when s->>'version'='web-v0.1.7' then ml_private.stage4_board_entry(s,a,nearc->>'id') else ml_private.classic_enter(s,nearc->>'id') end)");
 }
 if(short==='classic_environment')body=replace(body,"(p->>'hp')::int<=0", "((p->>'hp')::int<=0 or s->>'version'='web-v0.1.7' and not ml_private.stage4_on_board(s,a))");
 if(short==='cave_ending')body=replace(body,"(p->>'hp')::int<=0", "((p->>'hp')::int<=0 or s->>'version'='web-v0.1.7' and not ml_private.stage4_on_board(s,a))");
 if(short==='stage3_relocate')body=replace(body,"if jsonb_array_length(snapshots)>0 then", "if s->>'version'='web-v0.1.7' then tasks:=tasks||ml_private.stage4_arrival_tasks(s,a,origin,cell);if voluntary and coalesce(s->>'_gearReactiveSkip','false')<>'true' then tasks:=tasks||ml_private.stage4_landing_tasks(s,a);end if;end if;\n if jsonb_array_length(snapshots)>0 then");
 if(short==='validate')body=replace(body,"ml_private.stage3_alive(s,a) and ml_private.stage3_alive(s,b)", "ml_private.stage3_alive(s,a) and ml_private.stage3_alive(s,b) and (s->>'version'<>'web-v0.1.7' or ml_private.stage4_on_board(s,a) and ml_private.stage4_on_board(s,b))");
 if(short==='create_game')body=replace(body,"s:=ml_private.emit(s,'setup'","if rulev='web-v0.1.7' then s:=s||jsonb_build_object('stage4',ml_private.stage4_initial(s->'players'));end if;\n s:=ml_private.emit(s,'setup'");
 if(short==='finish_before_stage3'){body=replace(body,"for ids in select * from ml_private.arr(groups) loop","if s->>'version'='web-v0.1.7' then select coalesce(jsonb_agg(g),'[]') into groups from ml_private.arr(groups) g where g<>'null'::jsonb and g<>'[]'::jsonb;end if;\n for ids in select * from ml_private.arr(groups) loop");}
 if(short==='stage3_card_cost')body=replace(body,"n is not null and n>=0","n is not null and (n>=0 or s->>'version'='web-v0.1.7' and n>=-1)");
 if(short==='stage3_play')body=replace(body,"effect:=quoted->'effect';","if s->>'version'='web-v0.1.7' and s->>'_stage4Free'='true' then quoted:=jsonb_build_object('cost',0,'effect',jsonb_build_object('origin','card','actor',a,'faction',p->'faction','roleModifiers',coalesce(s#>array['stage4','buffSources',a||':exerciseFree','roleModifiers'],'[]')));end if;effect:=quoted->'effect';");
 if(short==='dispatch'){body=replace(body,"cmd->>'kind' in ('jj','bread','revival-quote')","(cmd->>'kind' in ('jj','bread','revival-quote') or previous->>'version'='web-v0.1.7' and cmd->>'kind' in ('quote-cost','watch','flight','gift','terrain'))");
  body=replace(body,"else p:=s->'players'->a;perform ml_private.need(a=","elsif previous->>'version'='web-v0.1.7' and typ='skill' and cmd->>'kind'='quote-cost' and s#>>'{choice,kind}'='card-counter' and s#>'{choice,actor}'=cmd->'actor' then s:=ml_private.stage4_quote(s,a,cmd->>'card');\n  else p:=s->'players'->a;perform ml_private.need(a=");
 }
 if(short==='pump'){
  body=replace(body,"if (s->>'round')::int>1 then s:=ml_private.draw", "if (s->>'round')::int>1 and (s->>'version'<>'web-v0.1.7' or s#>>array['stage4','drawBlocked',a::text]<>'true') then s:=ml_private.draw");
  body=replace(body,"if p->>'character'='character-027' then s:=ml_private.select_choice(s,'draw-start'", "if p->>'character'='character-027' and (s->>'version'<>'web-v0.1.7' or s#>>array['stage4','drawBlocked',a::text]<>'true') then s:=ml_private.select_choice(s,'draw-start'");
 }
 body=stage4BoardHooks(body,short,replace);body=stage4TerrainHooks(body,short,replace);
 if(aliases.has(short))out+=body.replace('function '+name+'(','function '+name+'_before_stage4(')+'\n';
 // Only changed functions are needed; most of the frozen engine stays installed.
 if(body!==raw&&!aliases.has(short))out+=body+'\n';
}
out+=(await readFile('database/engine/stage4-engine.sql','utf8')).replaceAll('\r\n','\n');
out+=(await readFile('database/engine/stage4-counter.sql','utf8')).replaceAll('\r\n','\n');
out+=(await readFile('database/engine/stage4-actions.sql','utf8')).replaceAll('\r\n','\n');
out+=(await readFile('database/engine/stage4-combat.sql','utf8')).replaceAll('\r\n','\n');
out+=(await readFile('database/engine/stage4-equipment.sql','utf8')).replaceAll('\r\n','\n');
out+=(await readFile('database/engine/stage4-movement.sql','utf8')).replaceAll('\r\n','\n');
out+=(await readFile('database/engine/stage4-map-engine.sql','utf8')).replaceAll('\r\n','\n');
out+=(await readFile('database/engine/stage4-interrupt.sql','utf8')).replaceAll('\r\n','\n');
out+=(await readFile('database/engine/stage4-view.sql','utf8')).replaceAll('\r\n','\n');
out+='\nrevoke all on all functions in schema ml_private from public;\nDO $$ declare r text;begin foreach r in array array[\'anon\',\'authenticated\'] loop execute format(\'revoke all on all functions in schema ml_private from %I\',r);end loop;end $$;\n';
const path='database/engine/stage4-generated.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==out)throw Error('Stage-four engine SQL differs');}else await writeFile(path,out);
console.log('Development v0.1.7 /191 entities; formal room default unchanged.');
