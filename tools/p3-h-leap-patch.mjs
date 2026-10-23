import {replace} from './p3-patch.mjs';
export function hLeapPatch(name,body){
 if(name==='allocate_spawns'){
  body=replace(body,"candidates:=ml_private.spawn_candidates(v,id);", "if v='web-v0.1.19' and id='character-035' then continue;end if;candidates:=ml_private.spawn_candidates(v,id);");
  body=replace(body,"select jsonb_agg(x) into candidates", "if v='web-v0.1.19' and id='character-035' then cells:=cells||jsonb_build_array(''::text);continue;end if;select jsonb_agg(x) into candidates");
 }
 if(name==='p3h_create_development')body=replace(body,"for a in 0..3 loop s:=ml_private.draw(s,a,4)", "s:=ml_private.p3h_birth_begin(s,at);if s#>>'{choice,kind}'='h-birth' then perform ml_private.validate(s);return s;end if;for a in 0..3 loop s:=ml_private.draw(s,a,4)");
 if(name==='validate')body=replace(body,"ml_private.game_data(s,'map') ? (p->>'cell')", "(ml_private.game_data(s,'map') ? (p->>'cell') or ml_private.p3h_pending_birth(s,(p->>'seat')::int) and s#>>'{choice,kind}'='h-birth' and s#>'{choice,actor}'=p->'seat' and not exists(select 1 from ml_private.arr(s#>'{stage3,starts}') x where x<>'0'::jsonb) and not exists(select 1 from ml_private.arr(s->'players') x where jsonb_array_length(x->'hand')<>0))");
 if(name==='choose_before_stage4')body=body.replace(/\bbegin\b/i,"begin if ml_private.p3h_enabled(s) and kind='h-birth' then return ml_private.p3h_birth_choose(s,cmd,at,timeout);end if;");
 if(name==='choose_before_stage4')body=replace(body,'s:=ml_private.p3h_ren_choose(s,cmd,at,timeout);',"s:=ml_private.p3h_leap_choose(s,cmd,at,timeout);if s->>'_hHandled'<>'true' then s:=s-'_hHandled';s:=ml_private.p3h_ren_choose(s,cmd,at,timeout);end if;");
 if(name==='stage3_handle_task')body=replace(body,'s:=ml_private.p3h_ren_task(s,t,at);',"s:=ml_private.p3h_leap_task(s,t,at);if s->>'_hHandled'<>'true' then s:=s-'_hHandled';s:=ml_private.p3h_ren_task(s,t,at);end if;");
 if(name==='playtest_role_choice')body=replace(body,"'h-ren-retreat'", "'h-birth','h-respect','h-ren-retreat'");
 if(name==='stage4_location_move_cost')body=replace(body,'case when ml_private.stage4_ignore_location', 'case when ml_private.p3h_pending_birth(s,a) then 1 when ml_private.stage4_ignore_location');
 if(name==='stage3_actions')body=body.replace(/;\s*end \$\$;$/,()=>" || case when ml_private.p3h_enabled(s) then jsonb_build_object('leap',jsonb_build_object('cells',ml_private.p3h_leap_cells(s,a))) else '{}'::jsonb end;end $$;");
 if(name==='p3g_dispatch_core')body=replace(body,"elsif typ='move' then if ml_private.p3g_cube_face", "elsif typ='move' then if ml_private.p3h_leap_role(s,a) then s:=ml_private.p3h_leap_move(s,cmd);elsif ml_private.p3g_cube_face");
 if(name==='stage3_revival_cells')body=replace(body,"select coalesce(jsonb_agg(c->'id'", "if ml_private.p3h_leap_role(s,a) then region:=ml_private.region_at(s->>'version',s#>>array['stage3','h','birth',a::text]);end if;select coalesce(jsonb_agg(c->'id'");
 if(name==='public_view')body=replace(body,"'ren',ml_private.p3h_ren_public(s)", "'ren',ml_private.p3h_ren_public(s)");
 if(name==='public_view')body=replace(body,"'cooperation',ml_private.p3h_cooperate_public(s))", "'cooperation',ml_private.p3h_cooperate_public(s))||case when s#>'{stage3,h}' ? 'birth' then jsonb_build_object('birth',s#>'{stage3,h,birth}') else '{}'::jsonb end");
 return body;
}
