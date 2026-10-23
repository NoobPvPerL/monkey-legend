import {replace} from './p3-patch.mjs';
// Staging hooks for029, tested against the latest frozen definitions. No release activation here.
export function patchGObserver(name,body){
 if(name==='classic_refresh')body=replace(body,"return s||jsonb_build_object('safe',safe,'bomb',null,'forecast',null);","s:=s||jsonb_build_object('safe',safe,'bomb',null,'forecast',null);return ml_private.p3g_reserve_forecast(s);");
 if(name==='classic_environment')body=replace(body,'s:=ml_private.classic_pick(s,ml_private.patch_bomb_regions(s),2,true);',"if ml_private.p3g_enabled(s) and s#>>'{stage3,g,forecast,round}'=s->>'round' then s:=s||jsonb_build_object('_picked',s#>'{stage3,g,forecast,regions}');else s:=ml_private.classic_pick(s,ml_private.patch_bomb_regions(s),2,true);end if;");
 if(name==='public_view')body=replace(body,"return jsonb_set(v,'{actions,stage4}',", "if ml_private.p3g_enabled(s) then v:=jsonb_set(v,'{stage3,g}',ml_private.p3g_public_state(s,viewer));end if;return jsonb_set(v,'{actions,stage4}',");
 if(name==='watch_view')body=replace(body,"g:=v->'game';", "g:=v->'game';if ml_private.p3g_enabled(r.game) then g:=jsonb_set(g,'{stage3,g}',ml_private.p3g_public_state(r.game,-1));end if;");
 return body;
}
