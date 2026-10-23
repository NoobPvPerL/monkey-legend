import {replace} from './p3-patch.mjs';
export function hCirclePatch(name,body){
 if(name==='stage3_turn_start')body=body.replace(/\bbegin\b/i,'begin s:=ml_private.p3h_circle_start(s,a);');
 if(name==='stage3_skill')body=body.replace(/\bbegin\b/i,"begin if cmd->>'kind'='circle' then return ml_private.p3h_circle(s,(cmd->>'actor')::int);end if;");
 if(name==='stage3_actions')body=body.replace(/;\s*end \$\$;$/,()=>" || case when ml_private.p3h_enabled(s) then jsonb_build_object('circle',ml_private.p3h_circle_action(s,a)) else '{}'::jsonb end;end $$;");
 if(name==='p3g_dispatch_core')body=replace(body,"'dog','freeze'","'dog','freeze','circle'");
 if(name==='stage3_handle_task')body=replace(body,'s:=ml_private.p3h_task(s,t,at);',"s:=ml_private.p3h_circle_task(s,t,at);if s->>'_hHandled'<>'true' then s:=ml_private.p3h_task(s,t,at);end if;");
 if(name==='choose_before_stage4')body=replace(body,'s:=ml_private.p3h_choose(s,cmd,at,timeout);',"s:=ml_private.p3h_circle_choose(s,cmd,at,timeout);if s->>'_hHandled'<>'true' then s:=ml_private.p3h_choose(s,cmd,at,timeout);end if;");
 if(name==='public_view')body=replace(body,"'freezeReadyAt',s#>'{stage3,h,freezeReadyAt}'","'freezeReadyAt',s#>'{stage3,h,freezeReadyAt}','circles',s#>'{stage3,h,circles}','circleUsed',s#>'{stage3,h,circleUsed}'");
 if(name==='stage3_relocate'){
  body=replace(body,'e_gate jsonb;begin',"e_gate jsonb;h_requested text:=cell;h_placement boolean:=coalesce((s->>'_fPlacement')::boolean,false);begin");
  body=replace(body,' snapshots:=case when carry',` if coalesce(s->>'_eProbe','false')<>'true' then s:=ml_private.p3h_circle_gate(s,a,cell,jsonb_build_array(ml_private.stage3_task('e-relocate',jsonb_build_object('actor',a,'data',jsonb_build_object('cell',h_requested,'voluntary',voluntary,'carry',carry,'reactive',coalesce(s->>'_gearReactiveSkip','false')<>'true','source',e_source,'root',e_root)))),e_root,h_placement,case when h_requested<>cell then ml_private.p3h_circle_line(s,origin,cell) else null end);e_gate:=s->'_hCircleGate';s:=s-'_hCircleGate';if e_gate<>'null'::jsonb then return s||jsonb_build_object('_relocationTasks',e_gate);end if;end if;
 snapshots:=case when carry`);
 }
 if(name==='classic_walk')body=replace(body,'s:=ml_private.stage3_collision(s,cell);pushed:=',`select coalesce(jsonb_agg(v order by n),'[]') into tail from jsonb_array_elements(path) with ordinality q(v,n) where n>idx;
 s:=ml_private.p3h_circle_gate(s,a,cell,jsonb_build_array(jsonb_build_object('kind','walk','path',tail)),ml_private.p3e_root(s),false,ml_private.p3h_circle_line(s,s#>>array['players',a::text,'cell'],cell));e_gate:=s->'_hCircleGate';s:=s-'_hCircleGate';if e_gate<>'null'::jsonb then if jsonb_array_length(e_gate)>0 then return jsonb_set(ml_private.stage3_prepend(s,e_gate),'{phase}','"resolving"');else return ml_private.resume(ml_private.emit(s,'move','画圆阻止本条越界位移，保留剩余步数'),at);end if;end if;
 if s#>>array['players',a::text,'character']='character-045' and e_target is not null then f_path:=ml_private.stage3_collision_path(ml_private.stage3_board(s),a,e_target,ml_private.stage3_direction(s,s#>>array['players',a::text,'cell'],cell));s:=ml_private.p3h_circle_gate(s,e_target,f_path->>-1,jsonb_build_array(jsonb_build_object('kind','walk','path',tail)),ml_private.p3e_root(s),false,f_path);e_gate:=s->'_hCircleGate';s:=s-'_hCircleGate';if e_gate<>'null'::jsonb then if jsonb_array_length(e_gate)>0 then return jsonb_set(ml_private.stage3_prepend(s,e_gate),'{phase}','"resolving"');else return ml_private.resume(ml_private.emit(s,'move','画圆阻止本条越界位移，保留剩余步数'),at);end if;end if;end if;
 s:=ml_private.stage3_collision(s,cell);pushed:=`);
 if(name==='p3e_task'){
  const gate=(actor,cell)=>`s:=ml_private.p3h_circle_gate(s,${actor},${cell},jsonb_build_array(t),root);gate:=s->'_hCircleGate';s:=s-'_hCircleGate';if gate<>'null'::jsonb then return ml_private.stage3_prepend(s,gate);end if;`;
  body=replace(body,"s:=jsonb_set(s,array['stage4','offMap',target::text],'true');s:=jsonb_set(s,array['classic','exposure'",gate('target','null')+"s:=jsonb_set(s,array['stage4','offMap',target::text],'true');s:=jsonb_set(s,array['classic','exposure'");
  body=replace(body,"s:=s-'_fMoveAllowed';s:=jsonb_set(s,array['stage4','offMap',target::text],'true');s:=ml_private.p3e_relocate(s,a,first_cell", "s:=s-'_fMoveAllowed';"+gate('a','first_cell')+gate('target','second_cell')+"s:=jsonb_set(s,array['stage4','offMap',target::text],'true');s:=ml_private.p3e_relocate(s,a,first_cell");
  body=replace(body,"s:=s-'_fMoveAllowed';s:=ml_private.p3e_relocate(s,target,data->>'cell'", "s:=s-'_fMoveAllowed';"+gate('target',"data->>'cell'")+gate('a','origin')+"s:=ml_private.p3e_relocate(s,target,data->>'cell'");
 }
 return body;
}
