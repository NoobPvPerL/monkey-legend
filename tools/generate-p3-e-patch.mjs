import {readFile} from 'node:fs/promises';
import {generateP3,replace} from './p3-patch.mjs';
const source=JSON.parse(await readFile('packages/game-data/src/p3-e-source.json','utf8')),transcript=(await readFile('docs/cards/角色牌.md','utf8')).replaceAll('\r\n','\n');
for(const [id,c] of Object.entries(source.characters)){const block=transcript.split('## '+id+' · ')[1]?.split('\n## ')[0];if(!block||block.split('\n')[0]!==c.name||block.match(/### 能力文本（牌面）\n([\s\S]*?)(?=\n### )/)?.[1].trim()!==c.text)throw Error('E source drift: '+id);}
const task=(action,fields)=>`ml_private.stage3_task('${action}',jsonb_build_object(${fields}))`;
await generateP3({previous:'web-v0.1.15',version:'web-v0.1.16',revision:27,characters:27,path:'database/migrations/027_p3_batch_e.sql',helpers:'database/engine/p3-e.sql',patch(name,body){
 if(name==='validate')body=replace(body,'begin\n',"begin\n perform ml_private.need(ml_private.p3e_valid(s),'E批角色状态无效');\n");
 if(name==='create_game')body=replace(body,"s:=ml_private.emit(s,'setup'","if ml_private.p3e_enabled(s) then s:=ml_private.p3e_start(s,firstn);end if;s:=ml_private.emit(s,'setup'");
 if(name==='stage3_turn_start_before_stage4')body=replace(body,'return ml_private.p3d_start(', 'return ml_private.p3e_start(ml_private.p3d_start(').replace('),a),a);', '),a),a),a);');
 if(name==='stage3_handle_task')body=replace(body,'begin\n',"begin\n if ml_private.p3e_enabled(s) and t->>'action' like 'e-%' then return ml_private.p3e_task(s,t,at);end if;\n");
 if(name==='playtest_role_choice')body=replace(body,"ml_private.p3d_enabled(s) and kind='encourage'", "ml_private.p3e_enabled(s) and kind in ('move-consent','egg-move','force-step') or ml_private.p3d_enabled(s) and kind='encourage'");
 if(name==='choose_before_stage4'){
  body=replace(body,' case kind\n'," case kind\n when 'move-consent','egg-move','force-step' then s:=ml_private.p3e_choose(s,cmd,at,timeout);\n");
  const start=body.indexOf("when 'elbow-push' then"),end=body.indexOf("when 'west-carry'",start);if(start<0||end<0)throw Error('E elbow choice anchor');
  const old=body.slice(start,end),anchor="s:=ml_private.stage3_relocate(s,target,cell,false);";
  body=replace(body,old,replace(old,anchor,`if ml_private.p3e_enabled(s) then s:=ml_private.stage3_prepend(s,jsonb_build_array(${task('e-elbow',"'actor',a,'target',target,'data',jsonb_build_object('cell',cell,'root',ml_private.p3e_root(s))")}));else ${anchor}`).replace('tasks);end if;','tasks);end if;end if;'));
 }
 if(name==='choose')body=body.replaceAll("'encourage','encourage-discard'","'move-consent','egg-move','force-step','encourage','encourage-discard'");
 if(name==='stage3_skill')body=replace(body,' begin\n'," begin\n if cmd->>'kind' in ('gas','escape') then return ml_private.p3e_skill(s,(cmd->>'actor')::int,cmd->>'kind',cmd->>'region');end if;\n");
 if(name==='dispatch'){
  body=replace(body,"'mayi','feather','clan'","'mayi','feather','clan','gas','escape'");
  body=replace(body,"if typ='skill' then perform ml_private.need(","if typ='skill' then perform ml_private.need((not(cmd ? 'region') or jsonb_typeof(cmd->'region')='string') and ");
  body=replace(body,"if typ='tick' then while", "if ml_private.p3e_enabled(s) and s->'choice'='null'::jsonb and typ not in ('choose','tick') then s:=jsonb_set(s,'{stage3,e,current}',to_jsonb('revision'||(s->>'revision')));end if;\n if typ='tick' then while");
 }
 if(name==='stage3_relocate'){
  body=replace(body,"tasks jsonb:='[]';begin", "tasks jsonb:='[]';e_source integer;e_root text;e_gate jsonb;begin");
  body=replace(body,'snapshots:=case when carry',`if ml_private.p3e_enabled(s) then e_source:=case when s ? '_eCause' then (s#>>'{_eCause,source}')::int when voluntary then a else coalesce((s#>>'{choice,actor}')::int,(s#>>'{cardStack,stack,-1,actor}')::int,(s->>'active')::int) end;e_root:=coalesce(s#>>'{_eCause,root}',ml_private.p3e_root(s));s:=s-'_eCause';e_gate:=ml_private.p3e_gate(s,a,e_source,jsonb_build_array(${task('e-relocate',"'actor',a,'data',jsonb_build_object('cell',cell,'voluntary',voluntary,'carry',carry,'reactive',coalesce(s->>'_gearReactiveSkip','false')<>'true','source',e_source,'root',e_root)")}),e_root);if e_gate is not null then return s||jsonb_build_object('_relocationTasks',e_gate);end if;s:=jsonb_set(s,'{stage3,e,current}',to_jsonb(e_root));end if;\n snapshots:=case when carry`);
  body=replace(body,"return s||jsonb_build_object('_relocationTasks',tasks);\nend", "if ml_private.p3e_enabled(s) then s:=ml_private.p3e_moved(s,origin,cell,e_root);tasks:=tasks||(s->'_eggTasks');s:=s-'_eggTasks';end if;return s||jsonb_build_object('_relocationTasks',tasks);\nend");
 }
 if(name==='settle_movement')body=replace(body,'begin\n','begin\n s:=ml_private.p3e_end_move(s);\n');
 if(name==='end_turn')body=replace(body,"'queue',(s->'queue')||jsonb_build_array", "'queue',(s->'queue')||ml_private.p3e_end_tasks(s)||jsonb_build_array");
 if(name==='legal_steps')body=replace(body,"then valid:=cost is not null", "then valid:=not(ml_private.p3e_enabled(s) and s#>>array['players',target::text,'character']='character-016' and coalesce(s#>>array['stage3','e','permissions',ml_private.p3e_root(s)||':'||a||':'||target],'true')='false') and cost is not null");
 if(name==='stage3_collision')body=replace(body,"s:=ml_private.stage3_relocate(s,target,c#>>'{}',false,false);", "if ml_private.p3e_enabled(s) then s:=ml_private.p3e_relocate(s,target,c#>>'{}',false,false,true,case when s->>'_eProbe'='true' then target else a end,ml_private.p3e_root(s));else s:=ml_private.stage3_relocate(s,target,c#>>'{}',false,false);end if;");
 if(name==='classic_walk'){
  body=replace(body,'water_due boolean;begin','water_due boolean;e_target integer;e_gate jsonb;begin');
  body=replace(body,'ml_private.stage3_collision(check_s,cell)',"ml_private.stage3_collision(case when ml_private.p3e_enabled(check_s) then check_s||jsonb_build_object('_eProbe',true) else check_s end,cell)-'_eProbe'");
  body=replace(body,'s:=ml_private.stage3_collision(s,cell);',`if ml_private.p3e_enabled(s) then select (v->>'seat')::int into e_target from ml_private.arr(s->'players') v where (v->>'seat')::int<>a and v->>'cell'=cell and ml_private.stage4_on_board(s,(v->>'seat')::int);if e_target is not null then select coalesce(jsonb_agg(v order by n),'[]') into tail from jsonb_array_elements(path) with ordinality q(v,n) where n>idx;e_gate:=ml_private.p3e_gate(s,e_target,a,jsonb_build_array(jsonb_build_object('kind','walk','path',tail)),ml_private.p3e_root(s));if e_gate is not null then return jsonb_set(ml_private.stage3_prepend(s,e_gate),'{phase}','"resolving"');end if;end if;end if;s:=ml_private.stage3_collision(s,cell);`);
  body=replace(body,"s:=jsonb_set(s,array['stage3','voluntaryMoved',a::text],'true');", "if ml_private.p3e_enabled(s) then s:=ml_private.p3e_moved(s,origin,cell,'move'||(m->>'gearRoot'));s:=s-'_eggTasks';end if;s:=jsonb_set(s,array['stage3','voluntaryMoved',a::text],'true');");
 }
 if(name==='stage4_resume_walk')body=replace(body,'ml_private.stage3_collision(probe,cell)',"ml_private.stage3_collision(case when ml_private.p3e_enabled(probe) then probe||jsonb_build_object('_eProbe',true) else probe end,cell)-'_eProbe'");
 if(name==='stage3_handle_task_before_stage4'){
  const anchor="then origin:=s#>>array['players',target::text,'cell'];s:=ml_private.stage3_relocate(s,target,ml_private.stage3_direction_cell(origin,t#>>'{data,direction}'),false);";
  body=replace(body,anchor,`then if ml_private.p3e_enabled(s) then return ml_private.stage3_prepend(s,jsonb_build_array(${task('e-elbow',"'actor',a,'target',target,'data',jsonb_build_object('cell',ml_private.stage3_direction_cell(s#>>array['players',target::text,'cell'],t#>>'{data,direction}'),'root',ml_private.p3e_root(s))")}));end if;origin:=s#>>array['players',target::text,'cell'];s:=ml_private.stage3_relocate(s,target,ml_private.stage3_direction_cell(origin,t#>>'{data,direction}'),false);`);
  body=replace(body,"then continue;end if;origin:=s#>>array['players',a::text,'cell'];old:=",`then continue;end if;if ml_private.p3e_enabled(s) then after_tasks:=after_tasks||jsonb_build_array(${task('e-swap',"'actor',a,'target',target,'data',jsonb_build_object('root',ml_private.p3e_root(s))")});continue;end if;origin:=s#>>array['players',a::text,'cell'];old:=`);
 }
 if(name==='stage4_map_task'){
  body=replace(body,'max_distance integer;', 'max_distance integer;e_gate jsonb;');
  body=replace(body,'if jsonb_array_length(paths)>1 then',"if ml_private.p3e_enabled(s) and exists(select 1 from ml_private.arr(paths) path where jsonb_array_length(path)>0) then e_gate:=ml_private.p3e_gate(s,a,(c->>'actor')::int,jsonb_build_array(t),ml_private.p3e_root(s));if e_gate is not null then return ml_private.stage3_prepend(s,e_gate)||jsonb_build_object('_boardHandled',true);end if;end if;if jsonb_array_length(paths)>1 then");
  body=replace(body,"s:=jsonb_set(s,array['stage4','offMap',target::text],'true');s:=jsonb_set(s,array['classic','exposure',target::text]",`if ml_private.p3e_enabled(s) then tasks:=tasks||jsonb_build_array(${task('e-off-map',"'actor',a,'target',target,'data',jsonb_build_object('root',ml_private.p3e_root(s))")});continue;end if;s:=jsonb_set(s,array['stage4','offMap',target::text],'true');s:=jsonb_set(s,array['classic','exposure',target::text]`);
 }
 if(name==='stage4_map_choose')body=replace(body,"s:=ml_private.stage3_relocate(s,a,cell,false);", "if ml_private.p3e_enabled(s) then s:=ml_private.p3e_relocate(s,a,cell,false,true,true,a,ml_private.p3e_root(s));else s:=ml_private.stage3_relocate(s,a,cell,false);end if;");
 if(name==='stage4_movement_task')body=replace(body,"jsonb_build_object('cells',cells));end if;return s||jsonb_build_object('_movementHandled',true);", "jsonb_build_object('cells',cells)||case when ml_private.p3e_enabled(s) then jsonb_build_object('data',jsonb_build_object('root',t#>>'{data,root}')) else '{}'::jsonb end);end if;return s||jsonb_build_object('_movementHandled',true);");
 if(name==='stage4_movement_choose')body=replace(body,"s:=ml_private.stage4_quiet_relocate(s,a,cell,true);", "if ml_private.p3e_enabled(s) then s:=s||jsonb_build_object('_eCause',jsonb_build_object('source',a,'root',c#>>'{data,root}'));end if;s:=ml_private.stage4_quiet_relocate(s,a,cell,true);s:=s-'_eCause';");
 if(name==='stage3_actions')body=replace(body,';\nend $$;'," || case when ml_private.p3e_enabled(s) then jsonb_build_object('gas',jsonb_build_object('available',free and ml_private.stage4_on_board(s,a) and p->>'character'='character-014' and (p->>'ap')::int>=1),'escape',jsonb_build_object('available',free and ml_private.stage4_on_board(s,a) and p->>'character'='character-038' and (p->>'ap')::int>=2 and s#>>array['stage3','e','escapeUsed',a::text]='false','used',s#>array['stage3','e','escapeUsed',a::text],'regions',(select jsonb_agg(region order by first_ord) from (select c->>'region' region,min(ord) first_ord from jsonb_array_elements(ml_private.game_data(s,'cells')) with ordinality q(c,ord) group by c->>'region') q))) else '{}'::jsonb end;\nend $$;");
 if(name==='public_view')body=replace(body,'if ml_private.p3d_enabled(s) then',"if ml_private.p3e_enabled(s) then v:=jsonb_set(v,'{stage3,e}',jsonb_build_object('escapeUsed',s#>'{stage3,e,escapeUsed}'));end if;if ml_private.p3d_enabled(s) then");
 return body;
}});
