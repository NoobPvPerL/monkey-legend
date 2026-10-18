import {readFile,readdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const version='web-v0.1.8',functions=new Map();
for(const file of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<=18).sort())
 for(const m of (await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n').matchAll(/create or replace function ((?:ml_private|public)\.\w+)\([\s\S]*?\$\$;/gi))functions.set(m[1],m[0]);
const replace=(s,a,b)=>{if(!s.includes(a))throw Error('019 anchor drift: '+a);return s.replace(a,()=>b);};
const profile={manifest:d.ruleManifest(version),mapDefinition:d.mapForVersion(version),environment:d.environmentForVersion(version),sourceCatalog:d.sourceCatalogForVersion(version),runtimeData:d.runtimeForVersion(version),locationPolicy:d.classicLocationPolicy(),characterTraits:Object.fromEntries(Object.keys(d.sourceCatalogForVersion(version).characters).map(id=>[id,d.characterTraitsForVersion(version,id)]))};
let out=`-- Approved P2 human-play feedback. Frozen000–018 are inputs, never regenerated here.\nDO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<18 THEN RAISE EXCEPTION 'Apply complete018 before019';END IF;END $$;\ninsert into ml_private.catalog(key,value) values('ruleset:${version}','${JSON.stringify(profile).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
out+=await readFile('database/engine/playtest-helpers.sql','utf8');
for(const [name,raw] of functions){
 if(name==='public.ml_health')continue;
 let body=raw.replace(/\b((?:not\s+)?in\s*\([^)]*)'web-v0\.1\.7'(\s*\))/g,"$1'web-v0.1.7','web-v0.1.8'$2")
 .replace(/<>\s*'web-v0\.1\.7'/g," not in ('web-v0.1.7','web-v0.1.8')").replace(/(?<![<>=!])=\s*'web-v0\.1\.7'/g," in ('web-v0.1.7','web-v0.1.8')");
 const short=name.slice(name.indexOf('.')+1);
 if(short==='select_choice'){
  body=replace(body,"paused boolean:=kind not in ('draw-start','draw-end')","paused boolean:=ml_private.playtest_role_choice(s,kind) or kind not in ('draw-start','draw-end')");
  body=body.replaceAll("case when kind='discard'", "case when ml_private.playtest_role_choice(s,kind) then 30000 when kind='discard'");
 }
 if(short==='stage3_begin_card')body=replace(body,'at+10000',"at+case when s->>'version'='web-v0.1.8' then 30000 else 10000 end");
 if(short==='classic_step_cost')body=replace(body,'if ml_private.classic_landings(s,a)',"if s->>'version'='web-v0.1.8' and ml_private.classic_native(s,a) and ml_private.stage4_board_water(s,cell,a) then return null;end if;\n if ml_private.classic_landings(s,a)");
 if(short==='classic_landings'){
  body=replace(body,'loop r:=r+dr;',"loop if s->>'version'='web-v0.1.8' and ml_private.occupied(s,cell->>'id',a) then cell:=null;exit;end if;r:=r+dr;");
  body=replace(body,"elsif ml_private.occupied(s,cell->>'id',-1)","elsif s->>'version'<>'web-v0.1.8' and ml_private.occupied(s,cell->>'id',-1)");
 }
 if(short==='legal_steps')body=replace(body,"if target is not null and p->>'character'='character-040'", "if target is not null and (p->>'character'='character-040' or s->>'version'='web-v0.1.8' and p->>'character'<>'character-045')");
 if(short==='validate')body=replace(body,"perform ml_private.need((s->>'phase'='moving'", "perform ml_private.need(s->>'version'<>'web-v0.1.8' and (s->>'phase'='moving'");
 if(short==='stage4_board_empty')body=replace(body,'select ml_private.stage4_board_entry',"select (s->>'version'<>'web-v0.1.8' or ml_private.playtest_relocation_cell(s,a,s#>>array['players',a::text,'cell'],cell,ignored) is not null) and ml_private.stage4_board_entry");
 if(short==='stage3_empty_entry')body=replace(body,'select ',"select (s->>'version'<>'web-v0.1.8' or ml_private.playtest_relocation_cell(s,a,s#>>array['players',a::text,'cell'],cell,ignored) is not null) and ");
 if(short==='stage3_revival_cells')body=replace(body,"where c->>'region'=","where (s->>'version'<>'web-v0.1.8' or not ml_private.classic_native(s,a) or not ml_private.stage4_board_water(s,c->>'id',a) or jsonb_array_length(ml_private.playtest_nearest_shore(jsonb_set(jsonb_set(s,array['players',a::text,'hp'],'1'),array['players',a::text,'cell'],c->'id'),a))>0) and c->>'region'=");
 if(short==='stage3_locations')body=replace(body,"where ml_private.stage3_can_enter(s,a,c#>>'{}')","where ml_private.stage3_can_enter(s,a,c#>>'{}') and (s->>'version'<>'web-v0.1.8' or ml_private.playtest_relocation_cell(s,a,s#>>array['players',a::text,'cell'],c#>>'{}') is not null)");
 if(short==='stage3_card_allowed')body=replace(body,"if p->>'character'='character-006'", "if s->>'version'<>'web-v0.1.8' and p->>'character'='character-006'");
 if(short==='stage4_board_effect')body=replace(body,"s#>>array['players',a::text,'character']='character-006'", "s->>'version'<>'web-v0.1.8' and s#>>array['players',a::text,'character']='character-006'");
 if(short==='stage3_relocate')body=replace(body,'if origin=cell',"if s->>'version'='web-v0.1.8' then cell:=ml_private.playtest_relocation_cell(s,a,origin,cell);if cell is null then return s||jsonb_build_object('_relocationTasks',tasks);end if;end if;\n if origin=cell");
 if(short==='stage3_play_before_stage4'){
  body=replace(body,"if not converted and d->>'type'='equipment'", "targets:=ml_private.playtest_north_targets(s,targets,cmd->>'northGroup',d->>'type'<>'attack' and not elbow and d->>'id' not in ('basic-016','basic-037'));\n if not converted and d->>'type'='equipment'");
  body=replace(body,"targets:=exposed->'targets';", "targets:=ml_private.playtest_north_targets(s,exposed->'targets');");
 }
 if(short==='stage3_play'){
  body=replace(body,"(definition not in ('basic-013','basic-031','basic-026') or (v->>'seat')::int<>a)","(definition not in ('basic-013','basic-031','basic-026') and (s->>'version'<>'web-v0.1.8' or definition not in ('basic-012','basic-014')) or (v->>'seat')::int<>a)");
  body=replace(body,"if definition='basic-024' then", "targets:=ml_private.playtest_north_targets(s,targets,cmd->>'northGroup',not tea and definition not in ('basic-007','basic-018','basic-019','basic-022','basic-029','basic-030','basic-035','basic-036','basic-021','basic-024'));\n if definition='basic-024' then");
  body=replace(body,"p:=p||jsonb_build_object('ap',(p->>'ap')::int-(fee->>'spend')::int", "perform ml_private.playtest_north_targets(s,exposed->'targets');\n p:=p||jsonb_build_object('ap',(p->>'ap')::int-(fee->>'spend')::int");
 }
 if(short==='stage3_handle_task_before_stage4'){
  body=replace(body,"s:=ml_private.stage3_revive(s,target,old,(s#>>'{classic,farmClosed}')::boolean);","s:=ml_private.stage3_revive(s,target,old,(s#>>'{classic,farmClosed}')::boolean);if s->>'version'='web-v0.1.8' and ml_private.classic_native(s,target) and ml_private.stage4_board_water(s,old,target) then after_tasks:=after_tasks||jsonb_build_array(ml_private.stage3_task('board-shore',jsonb_build_object('actor',target,'data',jsonb_build_object('cells',ml_private.playtest_nearest_shore(s,target)))));end if;");
  body=replace(body,"old:=s#>>array['players',target::text,'cell'];s:=ml_private.stage3_relocate(s,a,old,true)","old:=s#>>array['players',target::text,'cell'];if s->>'version'='web-v0.1.8' then cells:=jsonb_build_array(ml_private.playtest_relocation_cell(s,a,origin,old,jsonb_build_array(target)),ml_private.playtest_relocation_cell(s,target,old,origin,jsonb_build_array(a)));if cells->0='null'::jsonb or cells->1='null'::jsonb or cells->0=cells->1 then continue;end if;old:=cells->>0;origin:=cells->>1;s:=jsonb_set(s,array['stage4','offMap',target::text],'true');end if;s:=ml_private.stage3_relocate(s,a,old,true)");
  body=replace(body,"s:=ml_private.stage3_relocate(s,target,origin,false)","if s->>'version'='web-v0.1.8' then s:=jsonb_set(s,array['stage4','offMap',target::text],'false');end if;s:=ml_private.stage3_relocate(s,target,origin,false)");
 }
 if(short==='stage4_map_task'){
  body=replace(body,"if action='board-desert'", "if action='board-shore' then select coalesce(jsonb_agg(v order by ord),'[]') into cells from jsonb_array_elements(t#>'{data,cells}') with ordinality q(v,ord) where ml_private.stage4_board_empty(s,a,v#>>'{}',jsonb_build_array(a));perform ml_private.need(jsonb_array_length(cells)>0,'上岸预留格失效');return ml_private.select_choice(s,'native-shore',a,at,jsonb_build_object('cells',cells))||jsonb_build_object('_boardHandled',true);end if;\n if action='board-desert'");
  const anchor="s:=jsonb_set(s,array['stage4','water',c#>>'{stage4,region}'],jsonb_build_object('owner',a,'effect',c->'effect'));";
  body=replace(body,anchor,"if s->>'version'='web-v0.1.8' then s:=ml_private.playtest_flood(s,c#>>'{stage4,region}',a,c->'effect');if s->>'_floodFailed'='true' then s:=s-'_floodFailed';return ml_private.stage3_prepend(s,jsonb_build_array(ml_private.stage3_task('cleanup',jsonb_build_object('serial',c->'serial'))))||jsonb_build_object('_boardHandled',true);end if;tasks:=tasks||(s->'_shoreTasks');s:=s-'_shoreTasks';else "+anchor+'end if;');
 }
 if(short==='stage4_map_choose')body=replace(body,"if kind='board-path'", "if kind='native-shore' then if timeout then cell:=choice#>>'{cells,0}';end if;perform ml_private.need(cell is not null and choice->'cells' ? cell and ml_private.stage4_board_empty(s,a,cell,jsonb_build_array(a)),'请选择合法岸边');s:=s||jsonb_build_object('_gearReactiveSkip',true);s:=ml_private.stage3_relocate(s,a,cell,false,false);s:=ml_private.stage3_prepend(s,s->'_relocationTasks');return s-'_relocationTasks'-'_gearReactiveSkip';end if;\n if kind='board-path'");
 if(short==='choose')body=body.replaceAll("'board-tax','board-return'","'board-tax','board-return','native-shore'");
 if(short==='stage4_create_draft')body=body.replaceAll("'web-v0.1.7'","'web-v0.1.8'");
 if(short==='stage3_complete_draft')body=replace(body,"then 'web-v0.1.7' else", "then r.draft->>'catalogVersion' else");
 if(short==='room_v1')body=body.replaceAll("'option','guess')","'option','guess','northGroup')");
 if(body!==raw)out+=body+'\n';
}
let health=functions.get('public.ml_health').replaceAll("'web-v0.1.7'","'web-v0.1.8'").replace("'engineRevision',18","'engineRevision',19").replace('count(*)=7 from ml_private.catalog','count(*)=8 from ml_private.catalog');
health=health.replace("'ruleset:web-v0.1.7'","'ruleset:web-v0.1.7','ruleset:web-v0.1.8'");
// The profile reference must point to v8; only the version-count IN list includes both.
health=health.replaceAll("key='ruleset:web-v0.1.7','ruleset:web-v0.1.8'","key='ruleset:web-v0.1.8'");
health=health.replace("'web-v0.1.5','web-v0.1.6')","'web-v0.1.5','web-v0.1.6','web-v0.1.7')");
health=health.replace("'ruleset:web-v0.1.6','ruleset:web-v0.1.7'))","'ruleset:web-v0.1.6','ruleset:web-v0.1.7','ruleset:web-v0.1.8'))");
out+=health+'\nrevoke all on all functions in schema ml_private from public;\nDO $$ declare r text;begin foreach r in array array[\'anon\',\'authenticated\'] loop execute format(\'revoke all on all functions in schema ml_private from %I\',r);end loop;end $$;\n';
out=out.replaceAll('\r\n','\n').replace(/[\t ]+$/gm,'');
const path='database/migrations/019_p2_playtest_feedback.sql';
if(process.argv.includes('--check')){if(await readFile(path,'utf8')!==out)throw Error('019 generated patch differs');}else await writeFile(path,out);
console.log('019: v8 rules, revision19; released000–018 untouched.');
