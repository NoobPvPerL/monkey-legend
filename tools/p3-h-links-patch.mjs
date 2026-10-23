import {replace} from './p3-patch.mjs';
export function hLinksPatch(name,body){
 if(name==='stage3_skill')body=body.replace(/\bbegin\b/i,"begin if cmd->>'kind'='cooperate' then return ml_private.p3h_cooperate_skill(s,cmd,at);end if;");
 if(name==='stage3_actions')body=body.replace(/;\s*end \$\$;$/,()=>" || case when ml_private.p3h_enabled(s) then jsonb_build_object('cooperate',ml_private.p3h_cooperate_action(s,a)) else '{}'::jsonb end;end $$;");
 if(name==='p3g_dispatch_core')body=replace(body,"'freeze','circle'","'freeze','circle','cooperate'");
 if(name==='playtest_role_choice')body=replace(body,"'h-circle-pay'","'h-cooperate','h-circle-pay'");
 if(name==='stage3_handle_task')body=replace(body,'s:=ml_private.p3h_circle_task(s,t,at);',"s:=ml_private.p3h_cooperate_task(s,t);if s->>'_hHandled'<>'true' then s:=ml_private.p3h_circle_task(s,t,at);end if;");
 if(name==='choose_before_stage4')body=replace(body,'s:=ml_private.p3h_circle_choose(s,cmd,at,timeout);',"s:=ml_private.p3h_cooperate_choose(s,cmd,timeout);if s->>'_hHandled'<>'true' then s:=ml_private.p3h_circle_choose(s,cmd,at,timeout);end if;");
 if(name==='heal')body=replace(body,"s:=ml_private.p3h_observe_hp(s);return ml_private.emit(s,'heal'","s:=ml_private.p3h_cooperate_heal(s,a,hp-old);s:=ml_private.p3h_observe_hp(s);return ml_private.emit(s,'heal'");
 if(name==='p3f_cast_heal')body=replace(body,"return ml_private.emit(s,'heal'","s:=ml_private.p3h_cooperate_heal(s,a,amount);return ml_private.emit(s,'heal'");
 if(name==='p3f_damage_frame'){
  body=replace(body,'idx integer:=','mirrors jsonb:=\'[]\';injury jsonb;idx integer:=');
  body=replace(body,"s:=ml_private.p3f_complete_damage(s,d->'injured'", "for injury in select v from ml_private.arr(d->'injured') v loop mirrors:=mirrors||ml_private.p3h_cooperate_health(s,(injury->>'target')::int,(injury->>'loss')::int,'damage');end loop;s:=ml_private.p3f_complete_damage(s,d->'injured'");
  body=replace(body,"stage3_prepend(s,s->'_triggers')", "stage3_prepend(s,mirrors||(s->'_triggers'))");
 }
 if(name==='p3f_complete_damage')body=replace(body,'s:=ml_private.p3h_observe_hp(s);','s:=ml_private.p3h_cooperate_cleanup(s,true);s:=ml_private.p3h_observe_hp(s);');
 if(name==='stage3_turn_start')body=body.replace(/\bbegin\b/i,'begin s:=ml_private.p3h_cooperate_start(s,a);');
 if(name==='stage3_turn_end')body=replace(body,"return ml_private.p3c_end(jsonb_set(s,'{stage3}',r),a);","return ml_private.p3h_cooperate_cleanup(ml_private.p3c_end(jsonb_set(s,'{stage3}',r),a));");
 if(name==='finish')body=body.replace(/\bbegin\b/i,'begin if ml_private.p3h_cooperate_pending(s) then return s;end if;');
 if(name==='public_view')body=replace(body,"'circleUsed',s#>'{stage3,h,circleUsed}'","'circleUsed',s#>'{stage3,h,circleUsed}','cooperation',ml_private.p3h_cooperate_public(s)");
 return body;
}
