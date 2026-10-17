export function stage4TerrainHooks(body,name,replace){
 if(!/\(s jsonb|\(previous jsonb/.test(body))return body;
 for(const [old,next] of [
  ["ml_private.location_card_allowed(s->>'version',p->>'cell',d->>'id')","ml_private.stage4_location_card(s,a,d->>'id')"],
  ["ml_private.location_basic_cost(s->>'version',p->>'cell')","ml_private.stage4_location_move_cost(s,a)"],
  ["ml_private.location_personal_ap(s->>'version',p,(s->>'round')::int)","ml_private.stage4_location_ap(s,a)"],
  ["ml_private.location_draw_count(s->>'version',p->>'cell',(s->>'round')::int)","ml_private.stage4_location_draw(s,a)"],
  ["ml_private.location_food_heal(s->>'version',p,amount)","ml_private.stage4_location_food(s,a,amount)"],
  ["ml_private.location_stops(s->>'version',cell)","ml_private.stage4_location_stops(s,a,cell)"],
  ["ml_private.location_stops(check_s->>'version',cell)","ml_private.stage4_location_stops(check_s,a,cell)"],
  ["ml_private.location_stops(s->>'version',c->>'id')","ml_private.stage4_location_stops(s,a,c->>'id')"],
 ])body=body.replaceAll(old,next);
 if(name==='stage3_locations')body=replace(body,"if ml_private.stage3_mount_blocked(s,a)","if ml_private.stage4_ignore_location(s,a) or ml_private.stage3_mount_blocked(s,a)");
 if(name==='classic_owes_water')body=replace(body,"and not ml_private.classic_native(s,a)","and not ml_private.stage4_ignore_location(s,a) and not ml_private.classic_native(s,a)");
 if(name==='classic_step_cost')body=replace(body,"then 2 else 1", "and not ml_private.stage4_ignore_location(s,a) then 2 else 1");
 if(name==='cave_ending')body=replace(body,"if countn<3 then", "if countn<3 or ml_private.stage4_ignore_location(s,a) then");
 if(name==='stage3_available_targets')body=replace(body,"ml_private.location_effect_allowed('web-v0.1.5',s#>>array['players',t#>>'{}','cell'],pending->>'definition')", "(case when s->>'version'='web-v0.1.7' then not(coalesce(pending#>'{stage4,officeExempt}','[]') @> jsonb_build_array(t)) else ml_private.location_effect_allowed('web-v0.1.5',s#>>array['players',t#>>'{}','cell'],pending->>'definition') end)");
 return body;
}
