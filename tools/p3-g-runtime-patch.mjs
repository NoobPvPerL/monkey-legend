import {readFile,readdir} from 'node:fs/promises';
import {replace} from './p3-patch.mjs';
import {patchGDieOwners} from './p3-g-dice-patch.mjs';
import {patchGObserver} from './p3-g-observer-patch.mjs';
import {patchGFood} from './p3-g-food-patch.mjs';
import {patchGMovement} from './p3-g-movement-patch.mjs';
import {patchGEquipment} from './p3-g-equipment-patch.mjs';
export const extendG=s=>s.replace(/\b((?:not\s+)?in\s*\([^)]*)'web-v0\.1\.17'(\s*\))/g,"$1'web-v0.1.17','web-v0.1.18'$2").replace(/<>\s*'web-v0\.1\.17'/g," not in ('web-v0.1.17','web-v0.1.18')").replace(/(?<![<>=!])=\s*'web-v0\.1\.17'/g," in ('web-v0.1.17','web-v0.1.18')");
const dieNames=new Set(['resolve_attack','dispatch','dispatch_before_stage3','choose_before_stage3','stage3_handle_task','choose_before_stage4','stage3_skill_before_stage4','stage3_handle_task_before_stage4','stage4_combat_task','stage4_combat_choose','p3c_move','p3d_task','p3d_choose','p3f_move_gate','p3f_skill','p3f_choose','playtest_role_choice','select_choice','stage3_turn_start_before_stage4','pump','expire','stage4_quote','stage4_map_choose']);
export function patchGRuntime(name,body){
 body=extendG(body);
 if(dieNames.has(name))body=patchGDieOwners(name,body);
 body=patchGObserver(name,body);body=patchGFood(name,body);body=patchGMovement(name,body);body=patchGEquipment(name,body);
 if(name==='pause')body=replace(body,'ml_private.budget(s,at)','ml_private.budget(s,ml_private.p3g_now(s,at))');
 if(name==='resume')body=replace(body,'to_jsonb(at)','to_jsonb(ml_private.p3g_now(s,at))');
 if(name==='select_choice')body=body.replace(/\bbegin\b/i,'begin at:=ml_private.p3g_now(s,at);');
 if(name==='pump'||name==='expire')body=replace(body,'s:=ml_private.p3g_at(s,at);','at:=ml_private.p3g_now(s,at);s:=ml_private.p3g_at(s,at);');
 if(name==='pump')body=replace(body,"while s->'choice'='null'::jsonb and s->>'phase'<>'over' loop", "while s->'choice'='null'::jsonb and s->>'phase'<>'over' loop at:=ml_private.p3g_now(s,at);");
 if(name==='public_view')body=replace(body,"v:=jsonb_set(v,'{stage3,g}',ml_private.p3g_public_state(s,viewer));", "v:=jsonb_set(v-'exercise','{stage3,g}',ml_private.p3g_public_state(s,viewer));");
 if(name==='stage3_handle_task')body=body.replace(/\bbegin\b/i,"begin s:=ml_private.p3g_card_task(s,t,at);if s->>'_gCardHandled'='true' then return s-'_gCardHandled';end if;s:=s-'_gCardHandled';s:=ml_private.p3g_observer_task(s,t,at);if s->>'_gObserverHandled'='true' then return s-'_gObserverHandled';end if;s:=s-'_gObserverHandled';");
 if(name==='stage3_handle_task')body=body.replace(/\bbegin\b/i,"begin s:=ml_private.p3g_dual_task(s,t,at);if s->>'_gDualHandled'='true' then return s-'_gDualHandled';end if;s:=s-'_gDualHandled';");
 if(name==='stage3_begin_card'){
  body=body.replace(/\bbegin\b/i,'begin at:=ml_private.p3g_now(s,at);');
  body=replace(body,'s:=ml_private.p3c_mark_card(s,a);',"if ml_private.p3g_prime(s,a) then pending:=pending||jsonb_build_object('g',jsonb_build_object('copy',1,'targets',targets));if ml_private.rule_card(s,definition)->>'type'='equipment' then s:=ml_private.p3g_begin_pair(s,card);end if;end if;s:=ml_private.p3c_mark_card(s,a);");
 }
 if(name==='stage3_close_card'||name==='stage3_close_card_before_stage4')body=body.replace(/\bbegin\b/i,"begin if ml_private.p3g_enabled(s) and s#>'{cardStack,stack,-1,g}' is not null then return ml_private.p3g_close_card(s);end if;");
 if(name==='stage4_interrupt_task'){
  const failed="(closed->>'countered'='true' and coalesce(closed#>>'{g,firstSucceeded}','false')<>'true')";
  body=body.replace(/closed->>'countered'(<>|=)'true'/g,(_,op)=>op==='<>'?`not ${failed}`:failed);
 }
 if(name==='choose_before_stage4'){
  const hooks=['haki','food','observer','card'].map(k=>{const mark=k==='haki'?'Haki':k==='food'?'Food':k==='observer'?'Observer':'Card';return `s:=ml_private.p3g_${k}_choose(s,cmd,at,timeout);if s->>'_g${mark}Handled'='true' then s:=s-'_g${mark}Handled';if timeout then s:=ml_private.emit(s,'timeout',ml_private.name(s,a)||' 选择超时：'||(c->>'kind'));end if;s:=s||jsonb_build_object('choice',null,'phase','resolving');s:=ml_private.pump(s,at);if s->'choice'='null'::jsonb and s->'queue'='[]'::jsonb and s->>'phase'='resolving' and s->'movement'='null'::jsonb and ml_private.stage3_alive(s,(s->>'active')::int) then s:=ml_private.resume(jsonb_set(s,'{phase}','"action"'),at);end if;return s;end if;s:=s-'_g${mark}Handled';`;}).join('');
  body=body.replace(/\bbegin\b/i,"begin if ml_private.p3g_enabled(s) then perform ml_private.need(cmd->'choice'=c->'id','选择窗口已过期');perform ml_private.need((cmd->>'actor')::int=a,'请交给待选择的座位操作');end if;"+hooks);
  body=replace(body,"else ml_private.stage3_card_cost(s,a,card) end;s:=ml_private.p3d_pay", "else ml_private.stage3_card_cost(s,a,card) end;quoted:=ml_private.p3g_prime_quote(s,a,quoted);s:=ml_private.p3d_pay");
 }
 if(name==='stage3_card_cost')body=replace(body,"return jsonb_build_object('cost',n,'effect',effect);","return ml_private.p3g_prime_quote(s,a,ml_private.p3g_free_quote(s,a,d->>'id',n,effect));");
 if(name==='create_game')body=body.replace(/\bbegin\b/i,"begin perform ml_private.need(setup->>'ruleVersion' is distinct from 'web-v0.1.18','G批尚未完整启用，不能创建正式对局');");
 if(name==='create_game'){
  body=replace(body,"s:=ml_private.emit(s,'setup'", "if ml_private.p3g_enabled(s) then s:=jsonb_set(s,'{stage3,g}',ml_private.p3g_initial_state());end if;s:=ml_private.emit(s,'setup'");
  body=replace(body,'s:=ml_private.start_round(s,at); perform ml_private.validate(s); return s;', 'if ml_private.p3g_enabled(s) then return ml_private.p3g_initial(s,at);end if;s:=ml_private.start_round(s,at); perform ml_private.validate(s); return s;');
 }
 if(name==='create_draft'||name==='stage4_create_draft')body=body.replace(/\bbegin\b/i,"begin perform ml_private.need(setup->>'catalogVersion' is distinct from 'web-v0.1.18','G批尚未完整启用，不能创建正式选角');");
 if(name==='stage3_play'){
  body=replace(body,"if not(cmd ? 'as') and d->>'type'='equipment' then", "perform ml_private.need(ml_private.p3g_cube_face(s,a)<>1 or not(d->>'type'='attack' or tea or coalesce(cmd->>'as' in ('elbow','dodge'),false)),'魔法有方1：本个人回合不能主动使用攻击牌');if not(cmd ? 'as') and d->>'type'='equipment' then");
  body=replace(body,"fee:=ml_private.stage4_fee_plan((p->>'ap')::int,(quoted->>'cost')::int,false", "quoted:=ml_private.p3g_prime_quote(s,a,quoted);fee:=ml_private.stage4_fee_plan((p->>'ap')::int,(quoted->>'cost')::int,false");
 }
 if(name==='stage3_play_before_stage4'){
  body=replace(body,"perform ml_private.need(not converted or", "perform ml_private.need(ml_private.p3g_cube_face(s,a)<>1 or not(d->>'type'='attack' or elbow),'魔法有方1：本个人回合不能主动使用攻击牌');perform ml_private.need(not converted or");
  body=replace(body,"end if;effect:=quoted->'effect';", "end if;quoted:=ml_private.p3g_prime_quote(s,a,quoted);effect:=quoted->'effect';");
  body=replace(body,"elsif d->>'id'='basic-016' then perform ml_private.need(", "elsif d->>'id'='basic-016' then perform ml_private.need(ml_private.p3g_card_target_allowed(s,a,(targets->>0)::int,'basic-016') and ");
 }
 if(name==='stage3_actions')body=body.replace(/;\s*end \$\$;$/, ()=>" || case when ml_private.p3g_enabled(s) then jsonb_build_object('cube',jsonb_build_object('face',ml_private.p3g_cube_face(s,a),'teleportCells',ml_private.p3g_cube_cells(s,a)),'dog',jsonb_build_object('available',free and ml_private.stage4_on_board(s,a) and p->>'character'='character-022' and (p->>'ap')::int>=1,'targets',ml_private.p3g_dog_targets(s,a))) else '{}'::jsonb end;end $$;");
 if(name==='stage4_actions'){
  body=replace(body,"case when tea or exercise then '0'::jsonb", "case when tea or exercise then case when ml_private.p3g_prime(s,a) then '1'::jsonb else '0'::jsonb end");
  body=replace(body,"'allowed',ml_private.stage4_location_card(s,a,definition)", "'allowed',ml_private.stage4_location_card(s,a,definition) and not(ml_private.p3g_cube_face(s,a)=1 and (d->>'type'='attack' or elbow))");
 }
 if(name==='targets'){
  body=body.replace(/\bbegin\b/i,"begin if ml_private.p3g_cube_face(s,a)=1 then return '[]';end if;");
  body=replace(body,"where (q->>'hp')::int>0 and", "where ml_private.p3g_card_target_allowed(s,a,(q->>'seat')::int,d->>'id') and (q->>'hp')::int>0 and");
 }
 if(name==='stage4_targets')body=replace(body,"where ml_private.stage4_on_board(s,(p->>'seat')::int)", "where ml_private.p3g_card_target_allowed(s,a,(p->>'seat')::int,split_part(card,'#',1)) and ml_private.stage4_on_board(s,(p->>'seat')::int)");
 if(name==='stage4_tea_targets')body=replace(body,"where (q->>'seat')::int<>a", "where ml_private.p3g_card_target_allowed(s,a,(q->>'seat')::int,'basic-002') and (q->>'seat')::int<>a");
 if(name==='stage4_counter_cards')body=replace(body,"if not ml_private.stage4_location_card(s,a,d->>'id')", "if not ml_private.p3g_card_target_allowed(s,a,(c->>'actor')::int,d->>'id') or not ml_private.stage4_location_card(s,a,d->>'id')");
 if(name==='stage3_elbow_targets')body=replace(body,'with ordinality x(t,ord) where',"with ordinality x(t,ord) where ml_private.p3g_card_target_allowed(s,a,(t#>>'{}')::int,'basic-002') and");
 if(name==='stage3_jj_targets')body=replace(body,'if jj is null or',"if jj is null or not ml_private.p3g_card_target_allowed(s,a,jj,d->>'id') or");
 if(name==='stage3_responses')body=body.replace(/ where [\s\S]*? \$\$;/,()=>" where ml_private.p3g_card_target_allowed(s,a,case when split_part(card#>>'{}','#',1)='basic-001' then a else (pending->>'actor')::int end,split_part(card#>>'{}','#',1)) and case when ml_private.exercise_response(s,pending->>'definition',card#>>'{}') then (s#>>array['players',a::text,'ap'])::int>=case when ml_private.p3g_prime(s,a) then 1 else 0 end else ((split_part(card#>>'{}','#',1)='basic-001' and pending->>'definition'<>'basic-009') or (split_part(card#>>'{}','#',1)='basic-002' and pending->>'definition'='basic-008')) and (s#>>array['players',a::text,'ap'])::int>=(ml_private.stage3_card_cost(s,a,card#>>'{}')->>'cost')::int end $$;");
 if(name==='stage3_skill')body=body.replace(/\bbegin\b/i,"begin if ml_private.p3g_enabled(s) and cmd->>'kind'='dog' then return ml_private.p3g_dog(s,(cmd->>'actor')::int,(cmd->>'target')::int,cmd->>'direction');end if;");
 if(name==='end_turn')body=replace(body,'||ml_private.p3f_end_tasks(s)||','||ml_private.p3f_end_tasks(s)||ml_private.p3g_end_tasks(s)||');
 if(name==='pump'){
  body=replace(body,' s:=ml_private.stage3_start_gain_allowed(s,a);'," if ml_private.p3g_enabled(s) and t#>>'{data,gCubeDone}' is distinct from 'true' and jsonb_array_length(ml_private.p3g_cube_start_tasks(s,a))>0 then s:=ml_private.stage3_prepend(s,ml_private.p3g_cube_start_tasks(s,a)||jsonb_build_array(jsonb_build_object('kind','turn-start','actor',a,'data',coalesce(t->'data','{}')||jsonb_build_object('resuming',true,'gCubeDone',true))));continue;end if;\n s:=ml_private.stage3_start_gain_allowed(s,a);");
  const draw=/if \(s->>'round'\)::int>1 and \(s->>'version' not in \([^)]+\) or s#>>array\['stage4','drawBlocked',a::text\]<>'true'\) then s:=ml_private\.draw\(s,a,ml_private\.stage4_location_draw\(s,a\)\);end if;/;
  if(!draw.test(body))throw Error('G normal-draw anchor drift');
  body=body.replace(draw,"if (s->>'round')::int>1 and coalesce(s#>>array['stage4','drawBlocked',a::text],'false')<>'true' then if ml_private.p3g_enabled(s) and p->>'character'='character-009' then null;else s:=ml_private.draw(s,a,ml_private.stage4_location_draw(s,a)+ml_private.p3g_cube_draw(s,a));end if;elsif ml_private.p3g_cube_draw(s,a)>0 then s:=ml_private.draw(s,a,ml_private.p3g_cube_draw(s,a));end if;");
  body=replace(body,"s:=ml_private.stage3_prepend(s,case when p->>'character'='character-010'", "s:=ml_private.stage3_prepend(s,case when ml_private.p3g_enabled(s) and p->>'character'='character-009' and (s->>'round')::int>1 and coalesce(s#>>array['stage4','drawBlocked',a::text],'false')<>'true' then jsonb_build_array(ml_private.stage3_task('g-white-eye',jsonb_build_object('actor',a))) else '[]'::jsonb end||case when p->>'character'='character-010'");
 }
 if(name==='dispatch'){
  body=body.replace(/\bbegin\b/i,"begin if cmd ? 'replacements' then perform ml_private.need(ml_private.p3g_prime(s,(cmd->>'actor')::int) and not(cmd ? 'replacement') and jsonb_typeof(cmd->'replacements')='array' and jsonb_array_length(cmd->'replacements')<=2 and (select count(distinct g_item) from ml_private.arr(cmd->'replacements') g_item)=jsonb_array_length(cmd->'replacements') and not exists(select 1 from ml_private.arr(cmd->'replacements') g_item where jsonb_typeof(g_item)<>'string'),'双装备替换输入无效');end if;");
  body=replace(body,"'execute','magma'","'execute','magma','dog'");
  body=replace(body,'exception when others then',"exception when sqlstate 'P3G01' then raise;when others then");
  body=replace(body,"s:=ml_private.p3c_move(s,a,cost);", "if ml_private.p3g_enabled(s) then s:=jsonb_set(s,array['players',a::text,'moved'],'true');end if;s:=ml_private.p3c_move(s,a,cost);");
  body=replace(body,"elsif typ='move' then","elsif typ='move' then if ml_private.p3g_cube_face(s,a)=6 then s:=ml_private.p3g_cube_move(s,cmd);else perform ml_private.need(not(cmd ? 'cell'),'当前基础移动不接受传送落点');");
  body=replace(body,"elsif typ='skill' then s:=ml_private.stage3_skill(s,cmd,at);","end if;elsif typ='skill' then s:=ml_private.stage3_skill(s,cmd,at);");
  body=replace(body,"s:=ml_private.emit(s,'cost',ml_private.name(s,a)||case when cost=0", "if ml_private.p3g_enabled(s) and p->>'character'='character-049' and roll=6 then s:=jsonb_set(s,'{movement,haki}','[]');end if;s:=ml_private.emit(s,'cost',ml_private.name(s,a)||case when cost=0");
 }
 if(name==='room_v1')body=replace(body,"k not in ('type','card','targets','path','choice','accept','cell','cards','kind','direction','as','replacement','target','action','x','region','take','item','copy','option','guess','northGroup')", "k not in ('type','card','targets','path','choice','accept','cell','cards','kind','direction','as','replacement','target','action','x','region','take','item','copy','option','guess','northGroup') and not(k='replacements' and ml_private.p3g_enabled(r.game))");
 if(name==='escape')body=body.replace(/\bbegin\b/i,"begin if ml_private.p3g_haki(s,a) then return ml_private.p3g_haki_escape(s,a,cell,left_steps);end if;");
 if(name==='legal_steps')body=replace(body,"and p->>'character'<>'character-045')", "and p->>'character'<>'character-045' and not ml_private.p3g_haki(s,a))");
 if(name==='classic_landings'){
  body=replace(body,"and ml_private.occupied(s,cell->>'id',a) then cell:=null;exit;end if;", "and not ml_private.p3g_haki(s,a) and ml_private.occupied(s,cell->>'id',a) then cell:=null;exit;end if;if ml_private.p3g_haki(s,a) and not ml_private.stage4_board_entry(s,a,cell->>'id') then cell:=null;exit;end if;");
  body=replace(body,"and not ml_private.occupied(s,cell->>'id',-1) then result:=", "and (not ml_private.occupied(s,cell->>'id',-1) or ml_private.p3g_haki(s,a) and ml_private.occupied(s,cell->>'id',a)) then result:=");
 }
 if(name==='validate')body=replace(body,"perform ml_private.need(s->>'version' not in (", "perform ml_private.need(ml_private.p3g_haki(s,(s->>'active')::int) and (s#>>'{movement,remaining}')::int>0 and (a=(s->>'active')::int or b=(s->>'active')::int) or s->>'version' not in (");
 if(name==='p3e_gate')body=body.replace(/\bbegin\b/i,"begin if ml_private.p3g_cube_face(s,target)=2 then return '[]'::jsonb;end if;");
 if(name==='classic_walk'||name==='stage4_resume_walk')body=body.replace(/\bbegin\b/i,"begin if ml_private.p3g_haki(s,(s->>'active')::int) then s:=ml_private.finish(s,false,at);if s->>'phase'='over' then return s;end if;if not ml_private.stage4_on_board(s,(s->>'active')::int) then return ml_private.end_turn(s,at);end if;end if;");
 if(name==='classic_walk'){
  body=replace(body,'pushed jsonb;tail jsonb;','pushed jsonb;haki_tasks jsonb;tail jsonb;');
  body=replace(body,"if ml_private.p3e_enabled(s) then select (v->>'seat')::int into e_target", "if ml_private.p3e_enabled(s) and not ml_private.p3g_haki(s,a) then select (v->>'seat')::int into e_target");
  body=replace(body,"if ml_private.p3f_enabled(s) and e_target is not null then", "if ml_private.p3f_enabled(s) and s#>>array['players',a::text,'character']='character-045' and e_target is not null then");
  body=replace(body,"m:=m||jsonb_build_object('remaining',", "s:=ml_private.p3g_haki_crossed(s,a,origin,cell);haki_tasks:=s->'_gHakiTasks';s:=s-'_gHakiTasks';m:=s->'movement';m:=m||jsonb_build_object('remaining',");
  body=replace(body,'if jsonb_array_length(pushed)>0 or water_due or jsonb_array_length(arrival)>0 or', 'if jsonb_array_length(haki_tasks)>0 or jsonb_array_length(pushed)>0 or water_due or jsonb_array_length(arrival)>0 or');
  body=replace(body,'s:=ml_private.stage3_prepend(s,pushed||case when water_due', 's:=ml_private.stage3_prepend(s,haki_tasks||pushed||case when water_due');
 }
 return body;
}
/** Compose from frozen predecessors. Default mode is an isolated development
 * installation with formal G factories closed. The029 generator alone requests
 * activation and appends readiness/permission SQL. No DB connection is opened. */
export async function gDevelopmentSQL(profile,{activate=false}={}){
 const functions=new Map();for(const file of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<=28).sort())for(const m of (await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n').matchAll(/create or replace function ((?:ml_private|public)\.\w+)\([\s\S]*?\$\$;/gi))functions.set(m[1],m[0]);
 let sql=functions.get('ml_private.int').replace('function ml_private.int(','function ml_private.int_before_p3g(')+'\n';
 for(const file of ['p3-g.sql','p3-g-food.sql','p3-g-movement.sql','p3-g-haki.sql','p3-g-cards.sql','p3-g-equipment.sql'])sql+=await readFile('database/engine/'+file,'utf8')+'\n';
 sql+=`create or replace function ml_private.int(s jsonb,bound integer) returns jsonb language sql volatile set search_path=pg_catalog,ml_private as $$select case when ml_private.p3g_enabled(s) then ml_private.p3g_int(s,bound) else ml_private.int_before_p3g(s,bound) end$$;\n`;
 sql+=`insert into ml_private.catalog(key,value) values('ruleset:web-v0.1.18','${JSON.stringify(profile).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
 for(const [qualified,raw] of functions){const name=qualified.split('.')[1];if(qualified==='public.ml_health'||qualified==='ml_private.int')continue;let body=patchGRuntime(name,raw);
  if(activate){body=body.replace(/perform ml_private\.need\(setup->>'(?:ruleVersion|catalogVersion)' is distinct from 'web-v0\.1\.18','G批尚未完整启用，不能创建正式(?:对局|选角)'\);/g,'');if(name==='stage4_create_draft')body=body.replaceAll("'web-v0.1.17'","'web-v0.1.18'");}
  if(name==='dispatch'&&qualified.startsWith('ml_private.'))body=body.replace('function ml_private.dispatch(','function ml_private.p3g_dispatch_core(');if(name==='exercise_discard')body=body.replace('function ml_private.exercise_discard(','function ml_private.exercise_discard_before_g(');if(body!==raw)sql+=body+'\n';}
 sql+=`create or replace function ml_private.exercise_discard(s jsonb,cards jsonb) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare card text;entries jsonb;begin if not ml_private.p3g_enabled(s) then return ml_private.exercise_discard_before_g(s,cards);end if;for card in select v#>>'{}' from ml_private.arr(cards) v loop s:=ml_private.p3g_discard_entries(s,card);entries:=s->'_gDiscardEntries';s:=ml_private.exercise_discard_before_g(s-'_gDiscardEntries',entries);end loop;return s;end $$;\n`;
 sql+=`create or replace function ml_private.dispatch(previous jsonb,cmd jsonb,at double precision) returns jsonb language sql volatile set search_path=pg_catalog,ml_private as $$select case when ml_private.p3g_enabled(previous) then ml_private.p3g_dispatch(previous,cmd,at) else ml_private.p3g_dispatch_core(previous,cmd,at) end$$;\n`;
 sql+=patchGRuntime('create_game',functions.get('ml_private.create_game')).replace('function ml_private.create_game(','function ml_private.p3g_create_development(').replace("perform ml_private.need(setup->>'ruleVersion' is distinct from 'web-v0.1.18','G批尚未完整启用，不能创建正式对局');","perform ml_private.need(setup->>'ruleVersion'='web-v0.1.18','开发开局仅接受G版本');")+'\n';
 sql+=`create or replace function ml_private.p3g_initial_core(s jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin at:=ml_private.p3g_now(s,at);s:=ml_private.start_round(s,at);perform ml_private.validate(s);return s;end $$;\n`;
 return sql;
}
