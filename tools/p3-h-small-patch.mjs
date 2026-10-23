import {replace} from './p3-patch.mjs';
/** Private successor only. Keep all predecessor migrations frozen. */
export function hSmallPatch(name,body){
 if(name==='occupied')body=replace(body,"and (p->>'seat')::int<>except_actor", "and ml_private.p3h_blocks(s,except_actor,(p->>'seat')::int) and (p->>'seat')::int<>except_actor");
 if(name==='validate')body=replace(body,"and p->'cell'=s->'players'->b->'cell' then", "and ml_private.p3h_blocks(s,a,b) and p->'cell'=s->'players'->b->'cell' then");
 for(const fn of ['stage3_empty_entry','stage4_board_empty','playtest_relocation_cell'])if(name===fn)body=body.replaceAll("p->>'cell'=cell", "ml_private.p3h_blocks(s,a,(p->>'seat')::int) and p->>'cell'=cell").replaceAll("p->'cell'=cell->'id'", "ml_private.p3h_blocks(s,a,(p->>'seat')::int) and p->'cell'=cell->'id'");
 if(name==='p3h_birth_cells')body=replace(body,"p->>'cell'=c->>'id'", "ml_private.p3h_blocks(s,a,(p->>'seat')::int) and p->>'cell'=c->>'id'");
 if(name==='stage3_revival_cells')body=replace(body,"q->>'cell'=c->>'id'", "ml_private.p3h_blocks(s,a,(q->>'seat')::int) and q->>'cell'=c->>'id'");
 if(name==='location_destinations')body=replace(body,"other->>'cell'=c->>'id'", "ml_private.p3h_blocks(s,a,(other->>'seat')::int) and other->>'cell'=c->>'id'");
 if(name==='classic_landings'){body=body.replaceAll("ml_private.occupied(s,cell->>'id',-1)","ml_private.occupied(s,cell->>'id',case when ml_private.p3h_small(s,a) then a else -1 end)");body=replace(body,"if ml_private.p3g_haki(s,a) and not ml_private.stage4_board_entry","if (ml_private.p3g_haki(s,a) or ml_private.p3h_small(s,a)) and not ml_private.stage4_board_entry");}
 if(name==='legal_steps')body=replace(body,"q->'cell'=c->'id'", "ml_private.p3h_blocks(s,a,(q->>'seat')::int) and q->'cell'=c->'id'");
 if(name==='stage3_collision')body=replace(body,"p->>'cell'=cell", "ml_private.p3h_blocks(s,a,(p->>'seat')::int) and p->>'cell'=cell");
 if(name==='classic_walk'){
  body=replace(body,"if ml_private.p3g_haki(s,(s->>'active')::int) then","if ml_private.p3g_haki(s,(s->>'active')::int) or ml_private.p3h_small(s,(s->>'active')::int) then");
  body=replace(body,"v->>'cell'=cell and ml_private.stage4_on_board", "ml_private.p3h_blocks(s,a,(v->>'seat')::int) and v->>'cell'=cell and ml_private.stage4_on_board");
  body=replace(body,"s:=s-'_gHakiTasks';m:=s->'movement';", "s:=s-'_gHakiTasks';s:=ml_private.p3h_small_crossed(s,a,origin,cell,true);haki_tasks:=haki_tasks||(s->'_hSmallTasks');s:=s-'_hSmallTasks';m:=s->'movement';");
 }
 if(name==='stage3_relocate'){body=replace(body,"if ml_private.classic_owes_water(s,a,origin)", "if not h_placement then s:=ml_private.p3h_small_crossed(s,a,origin,cell,false,e_root);tasks:=tasks||(s->'_hSmallTasks');s:=s-'_hSmallTasks';end if;if ml_private.classic_owes_water(s,a,origin)");}
 if(name==='p3d_ball_allowed')body=replace(body,'$$select ', '$$select not ml_private.p3h_small(s,t) and ('); // close the original expression below
 if(name==='p3d_ball_allowed')body=body.replace(/\$\$;$/,()=>')$$;');
 if(name==='stage3_card_allowed')body=replace(body,"if ", "if ml_private.p3h_small(s,target) and split_part(card,'#',1)='basic-009' then return false;end if;if ");
 if(name==='playtest_role_choice')body=replace(body,"'h-birth'", "'h-small','h-birth'");
 if(name==='p3h_choice_label')body=replace(body,"when 'h-birth'", "when 'h-small' then '小：跨过角色判定' when 'h-birth'");
 if(name==='stage3_handle_task')body=replace(body,'s:=ml_private.p3h_leap_task(s,t,at);',"s:=ml_private.p3h_small_task(s,t,at);if s->>'_hHandled'<>'true' then s:=s-'_hHandled';s:=ml_private.p3h_leap_task(s,t,at);end if;");
 if(name==='choose_before_stage4')body=replace(body,'s:=ml_private.p3h_leap_choose(s,cmd,at,timeout);',"s:=ml_private.p3h_small_choose(s,cmd,at,timeout);if s->>'_hHandled'<>'true' then s:=s-'_hHandled';s:=ml_private.p3h_leap_choose(s,cmd,at,timeout);end if;");
 return body;
}
