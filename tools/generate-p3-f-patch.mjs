import {generateP3,replace} from './p3-patch.mjs';
const task=(action,fields='')=>`ml_private.stage3_task('${action}',jsonb_build_object(${fields}))`;
await generateP3({previous:'web-v0.1.16',version:'web-v0.1.17',revision:28,characters:35,path:'database/migrations/028_p3_batch_f.sql',helpers:'database/engine/p3-f.sql',patch(name,body){
 if(name==='validate')body=replace(body,'begin\n',"begin\n perform ml_private.need(ml_private.p3f_valid(s),'F批角色状态无效');\n");
 if(name==='create_game')body=replace(body,"s:=ml_private.emit(s,'setup'","if ml_private.p3f_enabled(s) then s:=ml_private.p3f_start(s,firstn);end if;s:=ml_private.emit(s,'setup'");
 if(name==='stage3_turn_start_before_stage4')body=replace(body,'return ml_private.p3e_start(','return ml_private.p3f_start(ml_private.p3e_start(').replace('),a),a),a);','),a),a),a),a);');
 if(name==='stage3_damage')body=replace(body,'$$ begin','$$ begin\n if ml_private.p3f_enabled(s) then return ml_private.p3f_damage(s,hits,environment,skip_pursuit);end if;');
 if(name==='stage3_damage_before_stage4'){
  let tail=body.slice(body.indexOf(' for a in 0..3 loop p:='));
  tail=replace(tail," if s->>'version' in (",` if exists(select 1 from ml_private.arr(s->'players') member where member->'eliminated'<>'null'::jsonb) then s:=jsonb_set(s,'{stage3,f,firstDeath}','true');s:=jsonb_set(s,'{stage3,f,wounds}','[0,0,0,0]');s:=jsonb_set(s,'{stage3,f,unlimitedCeil}','[null,null,null,null]');end if;\n if s->>'version' in (`);
  tail=replace(tail," for a in select ml_private.n(x)::int",` select coalesce(jsonb_agg(${task('f-home',"'actor',(v->>'target')::int,'data',jsonb_build_object('root','home'||(s->>'batch'))")} order by ord),'[]') into homes from jsonb_array_elements(injured) with ordinality q(v,ord) where s#>>array['players',v->>'target','character']='character-018' and ml_private.stage4_on_board(s,(v->>'target')::int);triggers:=homes||triggers;\n for a in select ml_private.n(x)::int`);
  return `create or replace function ml_private.p3f_complete_damage(s jsonb,injured jsonb,environment boolean,skip_pursuit boolean) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$ declare h jsonb;p jsonb;a integer;src integer;triggers jsonb:='[]';homes jsonb;begin\n${tail}\n${body}`;
 }
 if(name==='stage4_prepare_hit')body=replace(body," if c is not null and", " h:=ml_private.p3f_modifiers(s,h);if h is null then return s||jsonb_build_object('_hit',null);end if;\n if c is not null and");
 if(name==='stage3_healing')body=replace(body,'begin\n','begin\n if ml_private.p3f_enabled(s) then return ml_private.p3f_healing(s,a,amount,food);end if;\n');
 if(name==='heal')body=replace(body,"else least((p->>'maxHp')::int-hp,amount)","else case when ml_private.p3f_enabled(s) then amount else least((p->>'maxHp')::int-hp,amount) end");
 if(name==='location_food_heal')body=replace(body,"greatest(0,(p->>'maxHp')::int-(p->>'hp')::int)","case when v='web-v0.1.17' and p->>'character'='character-019' then 2147483647 else greatest(0,(p->>'maxHp')::int-(p->>'hp')::int) end");
 if(name==='stage4_location_food')body=replace(body,"else least(greatest(0,", "else case when ml_private.p3f_uncapped(s,a) then amount else least(greatest(0,").replace(',amount) end else',',amount) end end else');
 if(name==='stage3_begin_card')body=replace(body,"return jsonb_set(s,'{cardStack}',jsonb_build_object('serial',pending->'serial','stack',(flow->'stack')||jsonb_build_array(pending)));", "s:=jsonb_set(s,'{cardStack}',jsonb_build_object('serial',pending->'serial','stack',(flow->'stack')||jsonb_build_array(pending)));return ml_private.p3f_cast_heal(s,a,definition);");
 if(name==='stage3_mount_blocked')body=replace(body,'$$ select (',"$$ select not ml_private.p3f_can_move(s,a) or (");
 if(name==='stage3_revival_cells')body=replace(body,' select coalesce(jsonb_agg(c'," if ml_private.p3f_enabled(s) then if (p->>'maxHp')::int<=0 or (s#>>array['stage3','deathTurns',a::text])::int=-1 then return '[]';end if;region:=ml_private.version_catalog(s->>'version')#>>array['sourceCatalog','characters',p->>'character','spawnRegion'];end if;\n select coalesce(jsonb_agg(c");
 if(['validate','validate_before_stage3'].includes(name))body=body.replaceAll("(p->>'hp')::int between 0 and (p->>'maxHp')::int and p->'maxHp'=ml_private.game_data(s,'characters')->(p->>'character')->'hp'", "(p->>'hp')::int>=0 and case when ml_private.p3f_enabled(s) then (p->>'maxHp')::numeric=trunc((p->>'maxHp')::numeric) and (p->>'maxHp')::int>=0 and case when ml_private.p3f_uncapped(s,(p->>'seat')::int) then (p->>'maxHp')::int=2 else (p->>'hp')::int<=(p->>'maxHp')::int end else (p->>'hp')::int<=(p->>'maxHp')::int and p->'maxHp'=ml_private.game_data(s,'characters')->(p->>'character')->'hp' end");
 if(name==='stage3_skill')body=replace(body,' begin\n'," begin\n if cmd->>'kind' in ('execute','magma') then return ml_private.p3f_skill(s,cmd);end if;\n");
 if(name==='stage3_handle_task'){
  body=replace(body,'begin\n',"begin\n if ml_private.p3f_enabled(s) and t->>'action' like 'f-%' then return ml_private.p3f_task(s,t,at);end if;\n");
  body=replace(body,"s#>>array['players',target::text,'character']='character-037' then 3", "(s#>>array['players',target::text,'character']='character-037' or ml_private.p3f_enabled(s) and s#>>array['players',target::text,'character'] in ('character-051','character-052')) then 3");
  body=replace(body,"s:=ml_private.heal(s,target,(s#>>array['players',target::text,'maxHp'])::int-(s#>>array['players',target::text,'hp'])::int,true)","s:=ml_private.heal(s,target,case when ml_private.p3f_uncapped(s,target) then 2 else (s#>>array['players',target::text,'maxHp'])::int-(s#>>array['players',target::text,'hp'])::int end,true)");
 }
 if(name==='stage3_handle_task_before_stage4'){
  body=replace(body,"if action='continue' then", `if action='continue' then if ml_private.p3f_enabled(s) and pending->>'countered'='false' and pending->'responseTo'='null'::jsonb then s:=ml_private.p3f_card_targets(s);after_tasks:=s->'_fTargets';s:=s-'_fTargets';pending:=s#>'{cardStack,stack,-1}';if jsonb_array_length(after_tasks)>0 then return ml_private.stage3_prepend(s,after_tasks||jsonb_build_array(${task('f-card-resume',"'serial',pending->'serial'")}));end if;end if;`);
  const anchor="if pending->>'definition'='basic-006' and ml_private.stage3_alive(s,a) then";
  body=replace(body,anchor,`${anchor} if ml_private.p3f_enabled(s) then after_tasks:=after_tasks||jsonb_build_array(${task('f-vampire',"'actor',a,'data',jsonb_build_object('token',s#>'{stage3,f,hitSerial}','targets',targets)")});else`);
  body=replace(body,'s:=ml_private.heal(s,a,amount);end if;','s:=ml_private.heal(s,a,amount);end if;end if;');
 }
 if(name==='playtest_role_choice')body=replace(body,"ml_private.p3e_enabled(s) and kind", "ml_private.p3f_enabled(s) and kind like 'f-%' and kind<>'f-discard' or ml_private.p3e_enabled(s) and kind");
 if(name==='select_choice')body=body.replaceAll("(kind='discard' or ml_private.p3d_enabled(s) and kind='encourage-discard')", "(kind='discard' or ml_private.p3f_enabled(s) and kind='f-discard' or ml_private.p3d_enabled(s) and kind='encourage-discard')");
 if(name==='choose_before_stage4')body=replace(body,' case kind\n'," case kind\n when 'f-tenacity','f-discard','f-target','f-self-harm','f-bccb','f-sting' then s:=ml_private.p3f_choose(s,cmd,at,timeout);if s#>'{choice,id}'<>c->'id' then return s;end if;\n");
 if(name==='dispatch'){
  body=replace(body,"'clan','gas','escape'","'clan','gas','escape','execute','magma'");
  body=replace(body,"roll:=(s->>'_roll')::int;s:=s-'_roll';steps:=", "roll:=(s->>'_roll')::int;s:=s-'_roll';if ml_private.p3f_enabled(s) and p->>'character'='character-036' then s:=jsonb_set(s,array['stage3','f','dry','move'||(s->>'revision')||':'||a],to_jsonb(roll=6));end if;steps:=");
 }
 if(name==='pump')body=replace(body,' s:=ml_private.stage3_start_gain_allowed(s,a);',` if ml_private.p3f_enabled(s) and t#>>'{data,fDriftDone}' is distinct from 'true' and ml_private.stage4_on_board(s,a) and s#>>array['players',a::text,'character']='character-051' then s:=ml_private.stage3_prepend(s,jsonb_build_array(${task('f-drift',"'actor',a,'data',jsonb_build_object('root','turn'||(s#>>'{stage3,turn}'))")},jsonb_build_object('kind','turn-start','actor',a,'data',jsonb_build_object('resuming',true,'fDriftDone',true))));continue;end if;\n s:=ml_private.stage3_start_gain_allowed(s,a);`);
 if(name==='end_turn')body=replace(body,'||ml_private.p3e_end_tasks(s)||','||ml_private.p3e_end_tasks(s)||ml_private.p3f_end_tasks(s)||');
 if(name==='stage3_actions')body=replace(body,';\nend $$;',` || case when ml_private.p3f_enabled(s) then jsonb_build_object('execute',jsonb_build_object('available',free and ml_private.stage4_on_board(s,a) and p->>'character'='character-007' and s#>>array['stage3','f','executeUsed',a::text]='false' and jsonb_array_length(p->'hand')>0,'used',s#>array['stage3','f','executeUsed',a::text],'targets',ml_private.p3f_targets(s,a,true)),'magma',jsonb_build_object('available',free and ml_private.stage4_on_board(s,a) and p->>'character'='character-052' and (p->>'ap')::int>=2)) else '{}'::jsonb end;\nend $$;`);
 if(name==='public_view')body=replace(body,"v:=v||jsonb_build_object('stage4'", "if ml_private.p3f_enabled(s) then v:=jsonb_set(v,'{stage3,f}',jsonb_build_object('firstDeath',s#>'{stage3,f,firstDeath}','wounds',s#>'{stage3,f,wounds}','unlimitedCeil',s#>'{stage3,f,unlimitedCeil}','home',s#>'{stage3,f,home}','executeUsed',s#>'{stage3,f,executeUsed}'));v:=jsonb_set(v,'{players}',(select jsonb_agg(case when member->>'character'='character-019' then member||jsonb_build_object('uncappedHp',true) else member end order by ord) from jsonb_array_elements(v->'players') with ordinality q(member,ord)));end if;v:=v||jsonb_build_object('stage4'");
 if(name==='stage3_relocate'){
  body=body.replaceAll("return s||jsonb_build_object('_relocationTasks',tasks);end if;", "return (case when ml_private.p3f_enabled(s) then s-'_fPlacement'-'_eCause' else s end)||jsonb_build_object('_relocationTasks',tasks);end if;");
  body=replace(body,"s:=s-'_eCause';e_gate:=", "s:=ml_private.p3f_move_gate(s,a,cell,coalesce((s->>'_fPlacement')::boolean,false),e_root);if s->>'_fMoveAllowed'='false' then return (s-'_fMoveAllowed'-'_eCause'-'_fPlacement')||jsonb_build_object('_relocationTasks',tasks);end if;s:=s-'_fMoveAllowed'-'_fPlacement';s:=s-'_eCause';e_gate:=");
  body=replace(body,'tasks:=tasks||ml_private.stage4_arrival_tasks(s,a,origin,cell);',"if ml_private.p3f_enabled(s) then s:=ml_private.p3f_arrival(s,a,origin,cell);tasks:=tasks||ml_private.p3f_arrival_order(s,a,origin,cell,coalesce(s->>'_gearReactiveSkip','false')<>'true');s:=s-'_fArrival';else tasks:=tasks||ml_private.stage4_arrival_tasks(s,a,origin,cell);end if;");
 }
 if(name==='stage3_empty_entry')body=replace(body,'$$ select (','$$ select ml_private.p3f_preview_move(s,a,cell) and (');
 if(name==='stage4_board_empty')body=replace(body,'$$ select (',"$$ select (coalesce(s->>'_fPlacement','false')='true' or ml_private.p3f_preview_move(s,a,cell)) and (");
 if(name==='stage4_return')body=replace(body,'begin\n',"begin\n if ml_private.p3f_enabled(s) then s:=s||jsonb_build_object('_fPlacement',true);end if;\n").replace("return ml_private.select_choice(s,'board-return'","return ml_private.select_choice(s-'_fPlacement','board-return'").replace("return jsonb_set(s,'{queue}'","return jsonb_set(s-'_fPlacement','{queue}'");
 if(name==='stage4_map_choose'){
  body=replace(body,"elsif kind='board-return' then", "elsif kind='board-return' then if ml_private.p3f_enabled(s) then s:=s||jsonb_build_object('_fPlacement',true);end if;");
  body=body.replaceAll('return s;','return s-\'_fPlacement\';');
  // The flag is private to placement and removed by the relocation authority.
 }
 if(name==='legal_steps')body=replace(body,'if not ml_private.stage3_can_enter(s,a,c->>\'id\')', 'if not ml_private.p3f_preview_move(s,a,c->>\'id\') or not ml_private.stage3_can_enter(s,a,c->>\'id\')');
 if(name==='classic_walk'){
  body=replace(body,'water_due boolean;e_target','water_due boolean;f_path jsonb;f_exit text;e_target');
  body=replace(body,'s:=ml_private.stage3_collision(s,cell);',"if ml_private.p3f_enabled(s) and e_target is not null then f_path:=ml_private.stage3_collision_path(ml_private.stage3_board(s),a,e_target,ml_private.stage3_direction(s,s#>>array['players',a::text,'cell'],cell));select v#>>'{}' into f_exit from jsonb_array_elements(f_path) with ordinality q(v,n) where not ml_private.stage4_board_water(s,v#>>'{}',e_target) order by n limit 1;if f_exit is not null then s:=ml_private.p3f_move_gate(s,e_target,f_exit);s:=s-'_fMoveAllowed';end if;if not(ml_private.legal_steps(s) ? cell) then return ml_private.emit(s,'move','干枯阻止离水，保留剩余步数');end if;end if;s:=ml_private.stage3_collision(s,cell);");
  body=replace(body,'arrival:=ml_private.stage4_arrival_tasks(s,a,origin,cell);',"if ml_private.p3f_enabled(s) then s:=ml_private.p3f_arrival(s,a,origin,cell);arrival:=ml_private.p3f_arrival_order(s,a,origin,cell,true);s:=s-'_fArrival';else arrival:=ml_private.stage4_arrival_tasks(s,a,origin,cell);end if;");
  body=replace(body,'if jsonb_array_length(pushed)>0 or water_due or jsonb_array_length(arrival)>0 then','if jsonb_array_length(pushed)>0 or water_due or jsonb_array_length(arrival)>0 or ml_private.p3f_enabled(s) and e_target is not null then');
 }
 if(name==='stage3_collision'){
  body=replace(body,"c jsonb;begin","c jsonb;f_exit text;begin");
  body=replace(body,"perform ml_private.need(jsonb_array_length(path)>0", "if ml_private.p3f_enabled(s) and s->>'_eProbe'='true' then select v#>>'{}' into f_exit from jsonb_array_elements(path) with ordinality q(v,n) where not ml_private.stage4_board_water(s,v#>>'{}',target) order by n limit 1;if f_exit is not null then s:=ml_private.p3f_move_gate(s,target,f_exit);s:=s-'_fMoveAllowed';end if;end if;perform ml_private.need(jsonb_array_length(path)>0");
 }
 if(name==='p3e_task'){
  body=replace(body," s:=jsonb_set(s,array['stage4','offMap',target::text],'true');s:=ml_private.p3e_relocate(s,a,first_cell", " s:=ml_private.p3f_move_gate(s,a,first_cell,false,root);if s->>'_fMoveAllowed'='false' then return s-'_fMoveAllowed';end if;s:=ml_private.p3f_move_gate(s-'_fMoveAllowed',target,second_cell,false,root);if s->>'_fMoveAllowed'='false' then return s-'_fMoveAllowed';end if;s:=s-'_fMoveAllowed';s:=jsonb_set(s,array['stage4','offMap',target::text],'true');s:=ml_private.p3e_relocate(s,a,first_cell");
  body=replace(body,"origin:=s#>>array['players',target::text,'cell'];s:=ml_private.p3e_relocate(s,target,data->>'cell'", "origin:=s#>>array['players',target::text,'cell'];s:=ml_private.p3f_move_gate(s,target,data->>'cell',false,root);if s->>'_fMoveAllowed'='false' then return s-'_fMoveAllowed';end if;s:=ml_private.p3f_move_gate(s-'_fMoveAllowed',a,origin,false,root);if s->>'_fMoveAllowed'='false' then return s-'_fMoveAllowed';end if;s:=s-'_fMoveAllowed';s:=ml_private.p3e_relocate(s,target,data->>'cell'");
 }
 return body;
}});
