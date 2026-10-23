import {hDraftPatch} from './p3-h-draft-patch.mjs';
import {hEquipmentPatch} from './p3-h-equipment-patch.mjs';
import {hSmallPatch} from './p3-h-small-patch.mjs';
import {hLeapPatch} from './p3-h-leap-patch.mjs';
import {hRenPatch} from './p3-h-ren-patch.mjs';
import {hLinksPatch} from './p3-h-links-patch.mjs';
import {readFile,readdir} from 'node:fs/promises';
import {hCirclePatch} from './p3-h-circle-patch.mjs';
import {hActivePatch} from './p3-h-active-patch.mjs';
import {replace} from './p3-patch.mjs';
// Compose a private isolated PostgreSQL harness from immutable000–029.
// This does not emit a numbered migration, change health/defaults, or contact a DB.
export async function hDevelopmentSQL(profile,{activate=false}={}){
 const functions=new Map();for(const file of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<=29).sort())for(const m of (await readFile('database/migrations/'+file,'utf8')).replaceAll('\r\n','\n').matchAll(/create or replace function ((?:ml_private|public)\.\w+)\([\s\S]*?\$\$;/gi))functions.set(m[0].slice(0,m[0].indexOf(' returns ')),{qualified:m[1],raw:m[0]});
 let sql=await readFile('database/engine/p3-h-active.sql','utf8');
 sql+=await readFile('database/engine/p3-h.sql','utf8');
 sql+=await readFile('database/engine/p3-h-equipment.sql','utf8');
 sql+=await readFile('database/engine/p3-h-circle.sql','utf8');
 sql+=await readFile('database/engine/p3-h-links.sql','utf8');
 sql+=await readFile('database/engine/p3-h-ren.sql','utf8');
 sql+=await readFile('database/engine/p3-h-small.sql','utf8');
 sql+=await readFile('database/engine/p3-h-leap.sql','utf8');
 sql+=`insert into ml_private.catalog(key,value) values('ruleset:web-v0.1.19','${JSON.stringify(profile).replaceAll("'","''")}'::jsonb) on conflict(key) do nothing;\n`;
 sql+=`create or replace function ml_private.p3h_window(s jsonb,pending jsonb,w jsonb,kind text,a integer,choice_at double precision,at double precision,cmd jsonb) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin pending:=jsonb_set(pending,'{waiting}',w);s:=jsonb_set(s,'{stage3,g,dice}',pending);s:=ml_private.select_choice(s,kind,a,choice_at,jsonb_build_object('data',jsonb_build_object('owner',w->'owner','reason',w->'reason','value',w->'value')));s:=s||jsonb_build_object('seen',(s->'seen')||jsonb_build_array(cmd->'id'),'revision',(s->>'revision')::int+1,'time',at);return jsonb_build_object('state',s,'ok',true);end $$;\n`;
 for(const {qualified,raw} of functions.values()){const name=qualified.split('.')[1];if(qualified==='public.ml_health')continue;
  let body=raw.replace(/\b((?:not\s+)?in\s*\([^)]*)'web-v0\.1\.18'(\s*\))/g,"$1'web-v0.1.18','web-v0.1.19'$2");
  if(name==='p3g_enabled')body=replace(body,"s->>'version'='web-v0.1.18'","s->>'version' in ('web-v0.1.18','web-v0.1.19')");
  if(name==='select_choice')body=replace(body,"' 等待选择：'||kind","' 等待选择：'||ml_private.p3h_choice_label(kind)");
  if(name==='playtest_role_choice')body=replace(body,'select (ml_private.p3g_enabled(s)',"select (ml_private.p3h_enabled(s) and kind in ('h-circle-pay','h-attract','h-reroll','h-six')) or (ml_private.p3g_enabled(s)");
  if(name==='p3f_damage_frame')body=replace(body,'if loss>0 then s:=ml_private.p3g_cube_injury', 's:=ml_private.p3h_observe_hp(s);if loss>0 then s:=ml_private.p3g_cube_injury');
  if(name==='heal')body=replace(body,"return ml_private.emit(s,'heal'","s:=ml_private.p3h_observe_hp(s);return ml_private.emit(s,'heal'");
  if(name==='p3f_complete_damage')body=replace(body,"end if; end loop;\n if s->>'version' in (", "end if; end loop;\n s:=ml_private.p3h_observe_hp(s);if s->>'version' in (");
  if(name==='stage3_skill')body=body.replace(/\bbegin\b/i,"begin if ml_private.p3h_enabled(s) and cmd->>'kind'='freeze' then return ml_private.p3h_freeze(s,(cmd->>'actor')::int,(cmd->>'target')::int);end if;");
  if(name==='p3g_dispatch_core')body=replace(body,"'execute','magma','dog'","'execute','magma','dog','freeze'");
  if(name==='stage3_actions')body=body.replace(/;\s*end \$\$;$/,()=>" || case when ml_private.p3h_enabled(s) then jsonb_build_object('freeze',ml_private.p3h_freeze_action(s,a)) else '{}'::jsonb end;end $$;");
  if(name==='public_view')body=replace(body,"v:=jsonb_set(v-'exercise'", "if ml_private.p3h_enabled(s) then v:=jsonb_set(v,'{stage3,h}',jsonb_build_object('frozenBy',s#>'{stage3,h,frozenBy}','freezeReadyAt',s#>'{stage3,h,freezeReadyAt}'));end if;v:=jsonb_set(v-'exercise'");
  if(name==='stage3_handle_task')body=body.replace(/\bbegin\b/i,"begin s:=ml_private.p3h_task(s,t,at);if s->>'_hHandled'='true' then return s-'_hHandled';end if;s:=s-'_hHandled';");
  if(name==='choose_before_stage4')body=replace(body,"s:=ml_private.p3g_haki_choose", "s:=ml_private.p3h_choose(s,cmd,at,timeout);if s->>'_hHandled'='true' then s:=s-'_hHandled';if timeout then s:=ml_private.emit(s,'timeout',ml_private.name(s,a)||' 选择超时：'||ml_private.p3h_choice_label(c->>'kind'));end if;s:=s||jsonb_build_object('choice',null,'phase','resolving');s:=ml_private.pump(s,at);if s->'choice'='null'::jsonb and s->'queue'='[]'::jsonb and s->>'phase'='resolving' and s->'movement'='null'::jsonb and ml_private.stage3_alive(s,(s->>'active')::int) then s:=ml_private.resume(jsonb_set(s,'{phase}','\"action\"'),at);end if;return s;end if;s:=s-'_hHandled';s:=ml_private.p3g_haki_choose");
  if(name==='next_turn'){
   body=replace(body,"s:=jsonb_set(s,'{stage4,interruptTurn}','null');","s:=jsonb_set(s,'{stage4,interruptTurn}','null');if ml_private.p3h_enabled(s) then s:=jsonb_set(s,'{stage3,h,extraReturn}','null');end if;");
   body=replace(body," cursor:=(s->>'cursor')::int+1;", " s:=ml_private.p3h_return_extra(s);if s->>'_hExtraReturned'='true' then return s-'_hExtraReturned';end if;s:=s-'_hExtraReturned';cursor:=(s->>'cursor')::int+1;");
   body=replace(body,"if cursor<4 then return jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','turn-start','actor',s->'order'->cursor))||(s->'queue'));end if;", "if cursor<4 then s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','turn-start','actor',s->'order'->cursor))||(s->'queue'));s:=ml_private.p3h_take_extra(s,s->'queue');return s-'_hExtraTaken';end if;");
  }
  if(name==='pump'){
   body=replace(body,"loop at:=ml_private.p3g_now(s,at);","loop at:=ml_private.p3g_now(s,at);s:=ml_private.p3h_observe_hp(s);");
   body=replace(body,"exit when jsonb_array_length(s->'queue')=0;", "if ml_private.p3h_should_yield(s) then return ml_private.end_turn(s,at);end if;exit when jsonb_array_length(s->'queue')=0;");
   body=replace(body,"when 'round-next' then", "when 'round-next' then s:=ml_private.p3h_take_extra(s,jsonb_build_array(t)||(s->'queue'));if s->>'_hExtraTaken'='true' then s:=s-'_hExtraTaken';continue;end if;s:=s-'_hExtraTaken';");
   body=replace(body,' s:=ml_private.stage3_start_gain_allowed(s,a);'," if ml_private.p3h_enabled(s) and t#>>'{data,hStartDone}' is distinct from 'true' and jsonb_array_length(ml_private.p3h_start_tasks(s,a))>0 then s:=ml_private.stage3_prepend(s,ml_private.p3h_start_tasks(s,a)||jsonb_build_array(jsonb_build_object('kind','turn-start','actor',a,'data',coalesce(t->'data','{}')||jsonb_build_object('resuming',true,'hStartDone',true))));continue;end if;\n s:=ml_private.stage3_start_gain_allowed(s,a);");
   body=replace(body,"when 'action' then s:=jsonb_set(s,'{phase}','\"action\"');s:=ml_private.resume(s,at);", "when 'action' then if ml_private.p3h_enabled(s) and s#>array['stage3','h','frozenBy',a::text]<>'null'::jsonb then s:=jsonb_set(s,array['stage3','h','frozenBy',a::text],'null');s:=ml_private.emit(s,'skill','S'||(a+1)||' 冰封之力：跳过本次自由行动，继续个人结束结算');s:=ml_private.end_turn(s,at);else s:=jsonb_set(s,'{phase}','\"action\"');s:=ml_private.resume(s,at);end if;");
  }
  if(name==='create_game'){
   // Repair v14 opening choices in this successor harness, never in frozen025.
   body=replace(body,"s:=ml_private.emit(s,'setup'", "if ml_private.p3c_enabled(s) and not(s#>'{stage3}' ? 'c') then s:=jsonb_set(s,'{stage3,c}','{\"feather\":[false,false,false,false],\"blocked\":[false,false,false,false],\"used\":[false,false,false,false],\"sleep\":[false,false,false,false]}'::jsonb);end if;s:=ml_private.emit(s,'setup'");
   const privateBody=replace(body,'function ml_private.create_game(','function ml_private.p3h_create_development(').replace(/\bbegin\b/i,"begin perform ml_private.need(setup->>'ruleVersion'='web-v0.1.19','开发开局仅接受H版本');");
   sql+=hLeapPatch('p3h_create_development',replace(privateBody,"s:=ml_private.emit(s,'setup'", "if ml_private.p3h_enabled(s) then s:=jsonb_set(s,'{stage3,h}',ml_private.p3h_initial_state());s:=ml_private.p3h_observe_hp(s,true);end if;s:=ml_private.emit(s,'setup'"))+"\n";
   if(activate)body=hLeapPatch('p3h_create_development',replace(body,"s:=ml_private.emit(s,'setup'", "if ml_private.p3h_enabled(s) then s:=jsonb_set(s,'{stage3,h}',ml_private.p3h_initial_state());s:=ml_private.p3h_observe_hp(s,true);end if;s:=ml_private.emit(s,'setup'"));
   else body=body.replace(/\bbegin\b/i,"begin perform ml_private.need(setup->>'ruleVersion' is distinct from 'web-v0.1.19','H批尚未完整启用，不能创建正式对局');");
  }
  if(name==='create_draft'&&!activate)body=body.replace(/\bbegin\b/i,"begin perform ml_private.need(setup->>'catalogVersion' is distinct from 'web-v0.1.19','H批尚未完整启用，不能创建正式选角');");
  if(name==='stage4_create_draft'&&activate)body=body.replaceAll("'web-v0.1.18'","'web-v0.1.19'");
  if(name==='p3g_after_die'){
   body=replace(body,'math boolean;','math boolean;saved_events jsonb;saved_serial jsonb;');
   body=replace(body,"for intent in select * from ml_private.arr(old->'intents')", "if old ? 'h' then if old#>>'{h,rolled}'='true' then s:=ml_private.p3g_raw_die(s);perform ml_private.need(s->'_roll'=old#>'{h,reroll}','H狂叫续接随机不一致');s:=jsonb_set(s-'_roll',array['stage3','h','rerollRoots',old#>>'{h,root}'],'true');end if;if old#>>'{h,draw}'='true' then saved_events:=s->'events';saved_serial:=s->'eventSerial';s:=ml_private.draw(s,(old#>>'{h,sixActor}')::int,2);s:=s||jsonb_build_object('events',saved_events,'eventSerial',saved_serial);end if;end if;for intent in select * from ml_private.arr(old->'intents')");
   body=replace(body,'if programmer is not null or math then', 'if programmer is not null or math or ml_private.p3h_can_reroll(s,owner) or ml_private.p3h_six_actor(s,owner,raw) is not null then');
  }
  if(name==='p3g_capture'){
   body=replace(body,'waiting jsonb;','waiting jsonb;kind text;a integer;');
   body=replace(body,"s:=jsonb_set(s,'{stage3,g,dice}'", "if ml_private.p3h_enabled(s) then waiting:=waiting||jsonb_build_object('h',jsonb_build_object('root',case when err->'owner'='null'::jsonb then 'none' else ml_private.p3h_reroll_key(s,(err->>'owner')::int) end,'rolled',false,'reroll',null,'sixActor',null,'draw',false));end if;kind:=case when err->'programmer'<>'null'::jsonb then 'g-program' when ml_private.p3h_can_reroll(s,(err->>'owner')::int) then 'h-reroll' when s#>>array['players',err->>'owner','character']='character-042' then 'g-math' else 'h-six' end;a:=case when kind='h-six' then ml_private.p3h_six_actor(s,(err->>'owner')::int,(err->>'raw')::int) else coalesce((err->>'programmer')::int,(err->>'owner')::int) end;if kind='h-six' then waiting:=jsonb_set(waiting,'{h,sixActor}',to_jsonb(a));end if;s:=jsonb_set(s,'{stage3,g,dice}'");
   body=replace(body,"case when err->'programmer'<>'null'::jsonb then 'g-program' else 'g-math' end,coalesce((err->>'programmer')::int,(err->>'owner')::int)", 'kind,a');
  }
  if(name==='p3g_dispatch_step'){
   body=replace(body,"s:=previous;pending:=flow;w:=pending->'waiting';","s:=previous;pending:=flow;w:=pending->'waiting';if ml_private.p3h_enabled(s) then a:=(c->>'actor')::int;end if;");
   body=replace(body,"if w->'owner'<>'null'::jsonb and ml_private.stage4_on_board", "if ml_private.p3h_can_reroll(s,(w->>'owner')::int) then return ml_private.p3h_window(s,pending,w,'h-reroll',(w->>'owner')::int,choice_at,at,cmd);end if;if w->'owner'<>'null'::jsonb and ml_private.stage4_on_board");
   body=replace(body," else\n  perform ml_private.need(c->>'kind'='g-math'", ` elsif c->>'kind'='h-reroll' then
  perform ml_private.need(ml_private.p3h_can_reroll(s,(w->>'owner')::int) and w->'owner'=c->'actor','狂叫次数或来源无效');
  if not timeout and cmd->>'accept'='true' then s:=jsonb_set(s,array['stage3','h','rerollRoots',w#>>'{h,root}'],'true');w:=jsonb_set(w,'{h,rolled}','true');s:=jsonb_set(s,'{random,_gTrace}',jsonb_build_object('index',jsonb_array_length(pending->'random'),'entries',pending->'random'));s:=ml_private.p3g_raw_die(s);w:=jsonb_set(w,'{value}',s->'_roll');w:=jsonb_set(w,'{h,reroll}',s->'_roll');pending:=jsonb_set(pending,'{random}',s#>'{random,_gTrace,entries}');s:=(s-'_roll')#-'{random,_gTrace}';s:=ml_private.emit(s,'dice','狂叫：d6 = '||(w->>'value'),w->'value');end if;
  if timeout then s:=ml_private.emit(s,'timeout','S'||(a+1)||' 狂叫选择超时');end if;
 elsif c->>'kind'='h-six' then
  perform ml_private.need(w#>'{h,sixActor}'=c->'actor' and ml_private.p3h_six_actor(s,(w->>'owner')::int,(w->>'value')::int)=a,'6技能来源或最终点数无效');
  if not timeout and cmd->>'accept'='true' then w:=jsonb_set(w,'{h,draw}','true');s:=jsonb_set(s,'{random,_gTrace}',jsonb_build_object('index',jsonb_array_length(pending->'random'),'entries',pending->'random'));s:=ml_private.draw(s,a,2);pending:=jsonb_set(pending,'{random}',s#>'{random,_gTrace,entries}');s:=s#-'{random,_gTrace}';s:=ml_private.emit(s,'skill','S'||(a+1)||' 6：最终点数6，免费摸2');end if;
  if timeout then s:=ml_private.emit(s,'timeout','S'||(a+1)||' 6选择超时');end if;
 else
  perform ml_private.need(c->>'kind'='g-math'`);
   body=replace(body," select coalesce(jsonb_agg(ev order by n),'[]') into events", " if c->>'kind'<>'h-six' and ml_private.p3h_six_actor(s,(w->>'owner')::int,(w->>'value')::int) is not null then a:=ml_private.p3h_six_actor(s,(w->>'owner')::int,(w->>'value')::int);w:=jsonb_set(w,'{h,sixActor}',to_jsonb(a));return ml_private.p3h_window(s,pending,w,'h-six',a,choice_at,at,cmd);end if;select coalesce(jsonb_agg(ev order by n),'[]') into events");
  }
  body=hDraftPatch(name,hEquipmentPatch(name,hSmallPatch(name,hLeapPatch(name,hRenPatch(name,hLinksPatch(name,hCirclePatch(name,hActivePatch(name,body))))))));
  if(body!==raw)sql+=body+'\n';
 }
 sql+=`revoke all on all functions in schema ml_private from public,anon,authenticated;\n`;
 return sql;
}
