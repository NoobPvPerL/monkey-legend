create or replace function ml_private.stage4_public_state(s jsonb) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select jsonb_build_object(
 'copies',s#>'{stage4,copies}','durability',s#>'{stage4,durability}','offMap',s#>'{stage4,offMap}','terrainIgnore',s#>'{stage4,terrainIgnore}',
 'water',coalesce((select jsonb_object_agg(key,value->'owner') from jsonb_each(s#>'{stage4,water}')),'{}'),
 'deserts',coalesce((select jsonb_object_agg(key,value->'owner') from jsonb_each(s#>'{stage4,deserts}')),'{}'),
 'blocks',(select coalesce(jsonb_agg(jsonb_build_object('region',v->'region','owner',v->'owner','until',v->'until') order by ord),'[]') from jsonb_array_elements(s#>'{stage4,blocks}') with ordinality q(v,ord)),
 'toilet',(select jsonb_agg(v<>'null'::jsonb order by ord) from jsonb_array_elements(s#>'{stage4,toiletUntil}') with ordinality q(v,ord)),
 'lmm',(select jsonb_agg(v<>'null'::jsonb order by ord) from jsonb_array_elements(s#>'{stage4,lmmUntil}') with ordinality q(v,ord)),
 'tongBlocked',(select jsonb_agg(s#>array['stage4','tongBlocked',v->>'seat'] is not null order by ord) from jsonb_array_elements(s->'players') with ordinality q(v,ord)),
 'tea',s#>'{stage4,tea}','dodge',s#>'{stage4,dodge}','exerciseFree',s#>'{stage4,exerciseFree}','exerciseGuard',s#>'{stage4,exerciseGuard}') $$;
create or replace function ml_private.stage4_tea_targets(s jsonb,a integer) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(q->'seat' order by ord),'[]') from jsonb_array_elements(s->'players') with ordinality t(q,ord) where (q->>'seat')::int<>a and ml_private.stage4_on_board(s,(q->>'seat')::int) and not ml_private.stage4_single_protected(s,a,(q->>'seat')::int) and ml_private.game_data(s,'map')#>>array[q->>'cell','region']=ml_private.game_data(s,'map')#>>array[s#>>array['players',a::text,'cell'],'region'] $$;
create or replace function ml_private.stage4_actions(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$
declare base jsonb:=ml_private.stage3_actions(s,a);p jsonb:=s->'players'->a;r jsonb:=s->'stage4';free boolean:=ml_private.stage4_on_board(s,a) and (s->>'active')::int=a and s->>'phase'='action' and s->'choice'='null'::jsonb;
 blocked boolean:=ml_private.stage3_mount_blocked(s,a);normal integer:=ml_private.stage3_fixed_cost(s,a,ml_private.stage4_location_move_cost(s,a));card text;definition text;d jsonb;info jsonb;tea boolean;exercise boolean;targeted boolean;targets jsonb;elbow boolean;pushes jsonb;target integer;cells jsonb;direction text;cell text;options jsonb;cards jsonb:='{}';copies jsonb;steal jsonb;watch text;record jsonb;watch_cell text;flight jsonb:='[]';gift jsonb:='[]';interrupt text;reserve integer;can_interrupt boolean;begin
 for card in select v#>>'{}' from ml_private.arr(p->'hand') v loop
  definition:=split_part(card,'#',1);d:=ml_private.stage4_content()#>array['cards',definition];info:=base#>array['cards',card];tea:=definition='basic-002' and r#>>array['tea',a::text]='true';exercise:=definition in ('basic-003','basic-004','basic-005') and r#>>array['exerciseFree',a::text]='true';
  targeted:=tea or d->>'type'='attack' or definition in ('basic-016','basic-037','basic-018','basic-019','basic-021','basic-022','basic-024','basic-029','basic-030','basic-035','basic-036') or definition='basic-002' and p->>'character'='character-023';
  targets:=case when tea then ml_private.stage4_tea_targets(s,a) when d->>'inherited'='true' then info->'targets' when targeted then ml_private.stage4_targets(s,a,card) else '[]'::jsonb end;
  elbow:=tea or definition='basic-002' and p->>'character'='character-023';pushes:='{}';
  if elbow then for target in select (v#>>'{}')::int from ml_private.arr(targets) v loop cells:=ml_private.stage3_elbow_cells(ml_private.stage3_board(s),a,target);options:='{}';foreach direction in array array['up','right','down','left'] loop cell:=ml_private.stage3_direction_cell(s#>>array['players',target::text,'cell'],direction);if cell is not null and cells ? cell then options:=options||jsonb_build_object(direction,cell);end if;end loop;pushes:=pushes||jsonb_build_object(target::text,options);end loop;end if;
  cards:=cards||jsonb_build_object(card,info||jsonb_build_object('cost',case when tea or exercise then '0'::jsonb when d#>>'{cost,kind}'='variable' then 'null'::jsonb else info->'cost' end,
   'needsQuote',not tea and not exercise and (info->>'needsQuote')::boolean,'costKind',d#>'{cost,kind}','printedCost',d->'printedCost','targeted',targeted,'targets',targets,'tea',tea,'elbow',elbow,'pushes',pushes,
   'playable',(d->>'type'<>'response' or elbow) and definition not in ('basic-027','basic-028','basic-038'),'allowed',ml_private.stage4_location_card(s,a,definition),'region',definition in ('basic-023','basic-032','basic-033'),'counter',definition in ('basic-027','basic-028','basic-038')));
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('owner',q->'seat','card',v) order by player_ord,gear_ord),'[]') into copies from jsonb_array_elements(s->'players') with ordinality t(q,player_ord) cross join lateral jsonb_array_elements(s#>array['stage3','equipment',q->>'seat']) with ordinality g(v,gear_ord) where (q->>'seat')::int<>a and ml_private.stage4_on_board(s,(q->>'seat')::int) and split_part(v#>>'{}','#',1)<>'basic-073' and ml_private.rule_card(s,v#>>'{}')->>'slot'='mount';
 select jsonb_object_agg(q->>'seat',coalesce((select jsonb_object_agg(v#>>'{}',ml_private.stage3_equipment_options(s,a,v#>>'{}')) from ml_private.arr(s#>array['stage3','equipment',q->>'seat']) v),'{}')) into steal from ml_private.arr(s->'players') q;
 watch:=ml_private.stage4_combat_gear(s,a,'basic-060');record:=r#>array['watches',watch];
 if free and not blocked and record->>'previous' is not null and record->'usedTurn' is distinct from s#>'{stage3,turn}' and record->>'previous'<>p->>'cell' and ml_private.stage4_board_empty(s,a,record->>'previous',jsonb_build_array(a)) then watch_cell:=record->>'previous';end if;
 if free and not blocked and p->>'moved'<>'true' and ml_private.stage4_combat_gear(s,a,'basic-074') is not null and (p->>'ap')::int>=normal+1 then select coalesce(jsonb_agg(v->'id' order by ord),'[]') into flight from jsonb_array_elements(ml_private.game_data(s,'cells')) with ordinality q(v,ord) where v->>'id'<>p->>'cell' and ml_private.stage4_board_empty(s,a,v->>'id',jsonb_build_array(a));end if;
 if free and ml_private.stage4_combat_gear(s,a,'basic-075') is not null then select coalesce(jsonb_agg(v->'seat' order by ord),'[]') into gift from jsonb_array_elements(s->'players') with ordinality q(v,ord) where (v->>'seat')::int<>a and ml_private.stage4_on_board(s,(v->>'seat')::int);end if;
 select v#>>'{}' into interrupt from ml_private.arr(p->'hand') v where split_part(v#>>'{}','#',1)='basic-017' limit 1;reserve:=case when (s->>'active')::int=a and s#>>'{movement,costDue}'='true' and jsonb_array_length(s#>'{movement,path}')>1 then 1 else 0 end;
 can_interrupt:=coalesce(interrupt is not null and ml_private.stage4_on_board(s,a) and p->>'character'<>'character-005' and ((s->>'active')::int<>a or s#>>array['stage3','breadBlocked',a::text]<>'true') and (p->>'ap')::int>=(ml_private.stage3_card_cost(s,a,interrupt)->>'cost')::int+reserve,false);
 return jsonb_build_object('cards',cards,'regions',(select jsonb_agg(key order by key) from jsonb_object_keys(ml_private.version_catalog(s->>'version')#>'{mapDefinition,regions}') key),
  'copyMounts',copies,'stealEquipment',steal,'watchCell',watch_cell,'flightCells',flight,'flightCost',normal+1,'giftTargets',gift,'canInterrupt',can_interrupt,'terrainSelectable',ml_private.stage4_on_board(s,a) and ml_private.stage4_combat_gear(s,a,'basic-069') is not null);
end $$;
create or replace function ml_private.public_view(s jsonb,viewer integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare v jsonb:=ml_private.public_view_before_stage4(s,viewer);begin
 if s->>'version'<>'web-v0.1.7' then return v;end if;
 v:=v||jsonb_build_object('stage4',ml_private.stage4_public_state(s));return jsonb_set(v,'{actions,stage4}',ml_private.stage4_actions(s,viewer));
end $$;
