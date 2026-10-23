import {replace} from './p3-patch.mjs';
export function hRenPatch(name,body){
 if(name==='stage3_skill')body=body.replace(/\bbegin\b/i,"begin if cmd->>'kind'='ren' then return ml_private.p3h_ren_skill(s,cmd);end if;");
 if(name==='stage3_actions')body=body.replace(/;\s*end \$\$;$/,()=>" || case when ml_private.p3h_enabled(s) then jsonb_build_object('ren',ml_private.p3h_ren_action(s,a)) else '{}'::jsonb end;end $$;");
 if(name==='p3g_dispatch_core')body=replace(body,"'circle','cooperate'","'circle','cooperate','ren'");
 if(name==='playtest_role_choice')body=replace(body,"'h-cooperate'","'h-ren-retreat','h-ren-back','h-ren-expel','h-ren-gear','h-cooperate'");
 if(name==='stage3_handle_task')body=replace(body,'s:=ml_private.p3h_cooperate_task(s,t);',"s:=ml_private.p3h_ren_task(s,t,at);if s->>'_hHandled'<>'true' then s:=ml_private.p3h_cooperate_task(s,t);end if;");
 if(name==='choose_before_stage4')body=replace(body,'s:=ml_private.p3h_cooperate_choose(s,cmd,timeout);',"s:=ml_private.p3h_ren_choose(s,cmd,at,timeout);if s->>'_hHandled'<>'true' then s:=ml_private.p3h_cooperate_choose(s,cmd,timeout);end if;");
 if(name==='p3f_complete_damage')body=replace(body,"triggers||ml_private.p3d_injury(s,injured)","triggers||ml_private.p3d_injury(s,injured)||ml_private.p3h_ren_injuries(s,injured)");
 if(name==='stage3_turn_start')body=body.replace(/\bbegin\b/i,'begin s:=ml_private.p3h_ren_start(s,a);');
 if(name==='pump'){
  body=replace(body,'ml_private.stage3_gain_ap(s,a,3)','ml_private.stage3_gain_ap(s,a,ml_private.p3h_ren_round_ap(s,a,3))');
  body=replace(body,"' 轮开始获得3AP → '","' 轮开始获得'||ml_private.p3h_ren_round_ap(s,a,3)||'AP → '");
 }
 if(name==='public_view')body=replace(body,"'cooperation',ml_private.p3h_cooperate_public(s)","'ren',ml_private.p3h_ren_public(s),'cooperation',ml_private.p3h_cooperate_public(s)");
 return body;
}
