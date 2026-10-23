import {replace} from './p3-patch.mjs';
/** Apply to the latest definition of each signature, inside the private H harness. */
export function hActivePatch(name,body){
 const begin=code=>{body=body.replace(/\bbegin\b/i,'begin '+code);};
 if(name==='select_choice')begin("if ml_private.p3h_active_choice(kind) and not ml_private.p3h_active_allowed(s,a) then return s;end if;if kind='easy' and not ml_private.p3h_active_allowed(s,a) then return jsonb_set(s,array['cardStack','stack',(jsonb_array_length(s#>'{cardStack,stack}')-1)::text,'counter'],'null');end if;");
 if(name==='stage3_skill')begin("perform ml_private.need(not ml_private.p3h_active_skill(cmd->>'kind') or ml_private.p3h_active_allowed(s,(cmd->>'actor')::int),'又开始叫了：当前地区不能发动主动技能');");
 if(name==='stage3_play')begin("perform ml_private.need(coalesce(cmd->>'as','') not in ('elbow','dodge') or ml_private.p3h_active_allowed(s,(cmd->>'actor')::int),'又开始叫了：当前地区不能发动主动转换');");
 if(name==='stage3_actions'){
  body=replace(body,"then '0'::jsonb when d->>'randomCost'", "then case when ml_private.p3h_enabled(s) and ml_private.p3h_prime_active(s,a) then '1'::jsonb else '0'::jsonb end when d->>'randomCost'");
  body=replace(body,"converted:=case when p->>","converted:=case when not ml_private.p3h_active_allowed(s,a) then '[]'::jsonb when p->>");
  body=body.replaceAll("'available',free and","'available',free and ml_private.p3h_active_allowed(s,a) and");
  body=replace(body,"'jj',free and","'jj',free and ml_private.p3h_active_allowed(s,a) and");
  body=body.replace(/;\s*end \$\$;$/,()=>" || case when ml_private.p3h_enabled(s) then jsonb_build_object('activeBlocker',ml_private.p3h_active_blocker(s,a)) else '{}'::jsonb end;end $$;");
 }
 if(name==='stage3_card_cost')body=replace(body,"p->>'character'='character-006' and","p->>'character'='character-006' and ml_private.p3h_active_allowed(s,a) and");
 if(name==='stage3_gain_ap'||name==='stage3_overflow')body=replace(body,"q->>'character'='character-043'","q->>'character'='character-043' and ml_private.p3h_active_allowed(s,(q->>'seat')::int)");
 if(name==='stage3_role_targets')body=replace(body,"where (p->>'hp')","where (origin<>'role-active' or ml_private.p3h_active_allowed(s,a)) and (p->>'hp')");
 if(name==='stage3_ledger_candidates')body=replace(body,"if (p->>'hp')::int<=0","if not ml_private.p3h_active_allowed(s,xie) or (p->>'hp')::int<=0");
 if(name==='stage3_begin_card'){
  body=replace(body,"p->>'character'='character-002' and","p->>'character'='character-002' and ml_private.p3h_active_allowed(s,(p->>'seat')::int) and");
  body=replace(body,'if ml_private.p3g_prime(s,a) then','if ml_private.p3g_prime(s,a) and (ml_private.p3h_active_allowed(s,a) or s->>\'_hPrimeSecond\'=\'true\') then');
 }
 if(name==='stage3_counter_card')body=replace(body,'if not accept or at=','if not accept or not ml_private.p3h_active_allowed(s,a) or at=');
 if(name==='p3g_dual_task'){
  body=replace(body,"s:=ml_private.stage3_begin_card(s,a,firstn->>'card'","s:=ml_private.stage3_begin_card(s||jsonb_build_object('_hPrimeSecond',true),a,firstn->>'card'");
  body=replace(body,'idx:=(jsonb_array_length(s#>\'{cardStack,stack}\')-1)::text;c:=',"s:=s-'_hPrimeSecond';idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;c:=");
 }
 if(['p3g_prime_quote','stage3_responses','stage4_actions','stage4_validate_equipment'].includes(name))body=body.replaceAll('ml_private.p3g_prime(s,a)','ml_private.p3h_prime_active(s,a)');
 if(name==='p3c_end')body=replace(body,"to_jsonb(s#>>array['players',a::text,'character']","to_jsonb(ml_private.p3h_active_allowed(s,a) and s#>>array['players',a::text,'character']");
 if(name==='p3g_after_die'){
  body=replace(body,"is distinct from owner and ml_private.stage4_on_board", "is distinct from owner and ml_private.p3h_active_allowed(s,(v#>>'{}')::int) and ml_private.stage4_on_board");
  body=replace(body,'math:=owner is not null and','math:=owner is not null and ml_private.p3h_active_allowed(s,owner) and');
 }
 if(name==='p3g_capture')body=replace(body,"when s#>>array['players',err->>'owner','character']='character-042'", "when ml_private.p3h_active_allowed(s,(err->>'owner')::int) and s#>>array['players',err->>'owner','character']='character-042'");
 if(name==='p3g_dispatch_step'){
  body=replace(body,"w->'programmer'=c->'actor' and", "w->'programmer'=c->'actor' and ml_private.p3h_active_allowed(s,a) and");
  body=replace(body,"w->'owner'<>'null'::jsonb and ml_private.stage4_on_board", "w->'owner'<>'null'::jsonb and ml_private.p3h_active_allowed(s,(w->>'owner')::int) and ml_private.stage4_on_board");
  body=replace(body,"c->>'kind'='g-math' and w->'owner'=c->'actor'", "c->>'kind'='g-math' and w->'owner'=c->'actor' and ml_private.p3h_active_allowed(s,a)");
 }
 if(['p3g_counter_actor','p3g_food_thief'].includes(name))body=replace(body,"v<>c->'actor' and", "v<>c->'actor' and ml_private.p3h_active_allowed(s,(v#>>'{}')::int) and");
 if(name==='p3g_dog_targets')body=replace(body,'where ml_private.p3g_enabled(s) and', 'where ml_private.p3g_enabled(s) and ml_private.p3h_active_allowed(s,a) and');
 if(name==='p3g_haki_task'||name==='p3g_haki_choose')body=body.replaceAll('ml_private.p3g_haki(s,a) and', 'ml_private.p3g_haki(s,a) and ml_private.p3h_active_allowed(s,a) and');
 if(name==='p3g_dispatch_core')body=replace(body,"p->>'character'='character-049' and roll=6", "p->>'character'='character-049' and roll=6 and ml_private.p3h_active_allowed(s,a)");
 return body;
}
