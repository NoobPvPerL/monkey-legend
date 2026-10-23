import {replace} from './p3-patch.mjs';
// Staging hooks only. Final029 must also connect the G choice/dispatch drivers.
export function patchGFood(name,body){
 if(name==='stage3_handle_task')body=body.replace(/\bbegin\b/i,"begin s:=ml_private.p3g_food_task(s,t,at);if s->>'_gFoodHandled'='true' then return s-'_gFoodHandled';end if;s:=s-'_gFoodHandled';");
 if(name==='stage4_counter_task'){
  const old="if c->>'definition'='basic-038' then s:=ml_private.p3c_mark_food(s,jsonb_build_array(c->'actor'));s:=ml_private.heal(s,(c->>'actor')::int,1,true);end if;";
  body=replace(body,old,"if c->>'definition'='basic-038' then if ml_private.p3g_enabled(s) then s:=ml_private.stage3_prepend(s,ml_private.p3g_food_portions(c,jsonb_build_array(c->'actor')));else s:=ml_private.p3c_mark_food(s,jsonb_build_array(c->'actor'));s:=ml_private.heal(s,(c->>'actor')::int,1,true);end if;end if;");
 }
 return body;
}
