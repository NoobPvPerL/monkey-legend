import {replace} from './p3-patch.mjs';
// Staging damage/movement gates. G's complete dispatch/start/walk wiring remains separate.
export function patchGMovement(name,body){
 if(name==='stage3_handle_task')body=body.replace(/\bbegin\b/i,"begin s:=ml_private.p3g_cube_task(s,t,at);if s->>'_gCubeHandled'='true' then return s-'_gCubeHandled';end if;s:=s-'_gCubeHandled';s:=ml_private.p3g_haki_task(s,t,at);if s->>'_gHakiHandled'='true' then return s-'_gHakiHandled';end if;s:=s-'_gHakiHandled';");
 if(name==='p3f_can_move')body=replace(body,'select not ml_private.p3f_enabled(s)', 'select ml_private.p3g_cube_face(s,a)<>2 and (not ml_private.p3f_enabled(s)').replace("ml_private.stage3_equipped(s,a,'basic-069')","ml_private.stage3_equipped(s,a,'basic-069'))");
 if(name==='stage4_prepare_hit')body=replace(body,"end if;return s||jsonb_build_object('_hit',h);",'end if;return ml_private.p3g_cube_boost(s,h);');
 if(name==='p3f_damage_frame')body=replace(body,'if loss>0 then','if loss>0 then s:=ml_private.p3g_cube_injury(s,h,loss);');
 return body;
}
