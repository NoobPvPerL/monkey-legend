import {replace} from './p3-patch.mjs';
/** Shared effects read the same physical item; mutation always resolves its actual holder. */
export function hEquipmentPatch(name,body){
 if(name==='stage4_change_faction')body=replace(body,'language plpgsql immutable','language plpgsql stable').replace('end if;return s;','end if;return ml_private.p3h_gear_refresh(s);');
 const reads=['stage3_equipped','stage3_mount_blocked','stage4_board_entry','stage4_ignore_location','stage4_attack_effect','stage4_combat_gear','p3g_combat_gears','p3g_bread_equipment','p3g_terrain_setting','p3g_terrain_refresh','stage4_equipment_skill'];
 if(reads.includes(name)){
  body=body.replaceAll("s#>array['stage3','equipment',a::text]","ml_private.p3h_gear_cards(s,a)");
  for(const card of ["c#>>'{}'","v#>>'{}'",'card'])body=body.replaceAll(`(s#>array['stage3','equipmentSources',${card}])`,`ml_private.p3h_gear_source(s,a,${card})`);
 }
 if(name==='stage3_turn_end'){
  body=replace(body,"ml_private.arr(r#>array['equipment',b])","ml_private.arr(ml_private.p3h_gear_cards(s,a))");
  body=replace(body,"r->'equipmentSources'->(c#>>'{}')", "ml_private.p3h_gear_source(s,a,c#>>'{}')");
 }
 if(name==='stage3_turn_start')body=replace(body,"s:=jsonb_set(s,'{stage4,gearMarks}'", "s:=ml_private.p3h_gear_watch_start(s,a);s:=jsonb_set(s,'{stage4,gearMarks}'");
 if(name==='stage3_death'){
  body=replace(body,'loop s:=ml_private.exercise_discard',"loop s:=ml_private.p3h_gear_forget(s,c#>>'{}');s:=ml_private.exercise_discard");
  body=replace(body,"return jsonb_set(s,'{stage3}',r);", "if ml_private.p3h_enabled(s) then r:=jsonb_set(r,'{h}',s#>'{stage3,h}');end if;return ml_private.p3h_gear_refresh(jsonb_set(s,'{stage3}',r));");
 }
 if(name==='stage3_revive')body=replace(body,"return jsonb_set(s,array['stage3','deathTurns',a::text],'null');", "return ml_private.p3h_gear_refresh(jsonb_set(s,array['stage3','deathTurns',a::text],'null'));");
 if(name==='stage4_gear_detach'){
  body=replace(body,"if g->>'definition'='basic-069'", "s:=ml_private.p3h_gear_forget(s,card);if g->>'definition'='basic-069'");
  body=replace(body,'return ml_private.stage4_gear_movement(s,a);','return ml_private.p3h_gear_refresh(ml_private.stage4_gear_movement(s,a));');
 }
 if(name==='stage4_gear_install'){
  body=replace(body,"s:=jsonb_set(s,'{resolving}'", "s:=ml_private.p3h_gear_forget(s,card);s:=jsonb_set(s,'{resolving}'");
  body=replace(body,"return ml_private.emit(s,'equip'", "s:=ml_private.p3h_gear_refresh(s);s:=ml_private.p3h_gear_install_draw(s,a);return ml_private.emit(s,'equip'");
 }
 if(name==='stage4_equipment_task'){
  body=replace(body,"ml_private.arr(s#>array['stage3','equipment',a::text]) v loop", "ml_private.arr(ml_private.p3h_gear_cards(s,a)) v loop");
  body=replace(body,"effect:=(s#>array['stage3','equipmentSources',card])||jsonb_build_object('origin','equipment');", "effect:=ml_private.p3h_gear_source(s,a,card)||jsonb_build_object('origin','equipment');");
 }
 for(const fn of ['stage4_combat_task','stage4_combat_choose'])if(name===fn)body=body.replaceAll("s#>array['stage3','equipment',a::text] ?", "ml_private.p3h_gear_cards(s,a) ?");
 if(name==='stage4_prepare_hit'||name==='stage4_combat_choose'){
  const card=name==='stage4_prepare_hit'?'guard':'card';
  body=body.replaceAll(`array['stage3','equipment',a::text],(s#>array['stage3','equipment',a::text])-${card}`,`array['stage3','equipment',coalesce(ml_private.p3h_gear_owner(s,${card}),a)::text],(s#>array['stage3','equipment',coalesce(ml_private.p3h_gear_owner(s,${card}),a)::text])-${card}`);
  body=replace(body,'if remaining=0 then s:=jsonb_set',`if remaining=0 then s:=ml_private.p3h_gear_forget(s,${card});s:=jsonb_set`);
 }
 if(name==='p3g_bread_equipment')body=replace(body,"(s#>>array['stage3','starts',a::text])::int>=", "ml_private.p3h_gear_starts(s,a,v#>>'{}')>=");
 if(name==='p3g_bread')body=replace(body,"(s#>>array['stage3','starts',a::text])::int+2", "ml_private.p3h_gear_starts(s,a,card)+2");
 if(name==='stage3_skill_before_stage4')body=replace(body,"effect:=s#>array['stage3','equipmentSources',gear];", "effect:=ml_private.p3h_gear_source(s,a,gear);");
 if(name==='p3g_equipment_actions'){
  body=replace(body,"(s#>>array['stage3','starts',a::text])::int>=", "ml_private.p3h_gear_starts(s,a,v#>>'{}')>=");
  body=replace(body,"record:=s#>array['stage4','watches',card];", "record:=ml_private.p3h_gear_watch(s,a,card);");
 }
 if(name==='stage4_actions')body=replace(body,"record:=r#>array['watches',watch];", "record:=ml_private.p3h_gear_watch(s,a,watch);");
 if(name==='stage4_public_state')body=replace(body,'$$ select jsonb_build_object(', '$$ select ml_private.p3h_gear_public(s)||jsonb_build_object(');
 if(name==='stage4_equipment_skill'){
  body=replace(body,"watch:=s#>array['stage4','watches',card];", "watch:=ml_private.p3h_gear_watch(s,a,card);");
  for(const field of ['previous','usedTurn'])for(const op of ['#>>','#>'])body=body.replaceAll(`s${op}array['stage4','watches',v#>>'{}','${field}']`, `(ml_private.p3h_gear_watch(s,a,v#>>'{}')->${op==='#>>'?'>':''}'${field}')`);
 }
 if(name==='p3g_terrain_setting')body=replace(body,"return jsonb_set(s,array['stage4','terrainIgnore',a::text],to_jsonb(exists", "return ml_private.p3h_gear_refresh(jsonb_set(s,array['stage4','terrainIgnore',a::text],to_jsonb(exists").replace(/\)\)\);end \$\$;$/,()=>'))));end $$;');
 if(name==='playtest_role_choice')body=replace(body,"'h-small'", "'h-equip-draw','h-small'");
 if(name==='stage3_handle_task')body=replace(body,'s:=ml_private.p3h_small_task(s,t,at);',"s:=ml_private.p3h_gear_task(s,t,at);if s->>'_hHandled'<>'true' then s:=s-'_hHandled';s:=ml_private.p3h_small_task(s,t,at);end if;");
 if(name==='choose_before_stage4')body=replace(body,'s:=ml_private.p3h_small_choose(s,cmd,at,timeout);',"s:=ml_private.p3h_gear_choose(s,cmd,at,timeout);if s->>'_hHandled'<>'true' then s:=s-'_hHandled';s:=ml_private.p3h_small_choose(s,cmd,at,timeout);end if;");
 return body;
}
