import {readFile} from 'node:fs/promises';
import {generateP3,replace} from './p3-patch.mjs';
const source=JSON.parse(await readFile('packages/game-data/src/p3-c-source.json','utf8')),transcript=(await readFile('docs/cards/角色牌.md','utf8')).replaceAll('\r\n','\n');
for(const [id,c] of Object.entries(source.characters)){const block=transcript.split('## '+id+' · ')[1]?.split('\n## ')[0];if(!block||block.split('\n')[0]!==c.name||block.match(/### 能力文本（牌面）\n([\s\S]*?)(?=\n### )/)?.[1].trim()!==c.text)throw Error('C source drift: '+id);}
await generateP3({previous:'web-v0.1.13',version:'web-v0.1.14',revision:25,characters:20,path:'database/migrations/025_p3_batch_c.sql',helpers:'database/engine/p3-c.sql',patch(name,body){
 if(name==='validate')body=replace(body,'begin\n',"begin\n perform ml_private.need(ml_private.p3c_valid(s),'C批角色状态无效');\n");
 if(name==='stage3_turn_start_before_stage4')body=replace(body,"return jsonb_set(s,'{stage3}',r);","return ml_private.p3c_start(jsonb_set(s,'{stage3}',r),a);");
 if(name==='stage3_turn_end')body=replace(body,"return jsonb_set(s,'{stage3}',r);","return ml_private.p3c_end(jsonb_set(s,'{stage3}',r),a);");
 if(name==='stage3_begin_card')body=replace(body," return jsonb_set(s,'{cardStack}'"," s:=ml_private.p3c_mark_card(s,a);\n return jsonb_set(s,'{cardStack}'");
 if(name==='pump')body=replace(body,"s:=ml_private.emit(s,'turn',ml_private.name(s,a)||' 开始行动');","s:=ml_private.p3c_sleep(s,a,allowed);s:=ml_private.emit(s,'turn',ml_private.name(s,a)||' 开始行动');");
 if(name==='stage3_handle_task'){
  body=replace(body,'begin\n',"begin\n if t->>'action'='primitive-food' then return ml_private.p3c_food_task(s,(t->>'actor')::int,at);end if;\n");
  body=replace(body,'targets:=ml_private.stage3_available_targets(s,c);','targets:=ml_private.stage3_available_targets(s,c);s:=ml_private.p3c_mark_food(s,targets);');
 }
 if(name==='stage3_handle_task_before_stage4'){
  body=replace(body,"closed:=s->'_closed';s:=s-'_closed';","closed:=s->'_closed';s:=s-'_closed';s:=ml_private.p3c_food_tasks(s,closed);");
  body=body.replaceAll('targets:=ml_private.stage3_available_targets(s,pending);','targets:=ml_private.stage3_available_targets(s,pending);s:=ml_private.p3c_mark_food(s,targets);');
 }
 if(name==='stage4_counter_task')body=replace(body,"if c->>'definition'='basic-038' then s:=ml_private.heal", "if c->>'definition'='basic-038' then s:=ml_private.p3c_mark_food(s,jsonb_build_array(c->'actor'));s:=ml_private.heal");
 if(name==='playtest_role_choice')body=replace(body,"and kind in (","and (ml_private.p3c_enabled(s) and kind='primitive-food' or kind in (").replace(') $$;', ()=>')) $$;');
 if(name==='choose_before_stage4')body=replace(body," case kind\n", " case kind\n when 'primitive-food' then if cmd->>'accept'='true' and not timeout and ml_private.stage4_on_board(s,a) then s:=ml_private.die(s,'你要不要吃');amount:=(s->>'_roll')::int;s:=s-'_roll';if amount>=5 then s:=ml_private.heal(s,a,1,false);end if;end if;\n");
 if(name==='stage4_card_range')body=replace(body,'begin\n',"begin\n if ml_private.p3c_feather(s,a) and d->>'type'='attack' then return true;end if;\n");
 if(name==='stage3_monkey_targets')body=replace(body,"and (boost or ml_private.stage3_same_near", "and (not ml_private.p3c_feather(s,a) or q->>'character' not in ('character-026','character-044')) and (boost or ml_private.p3c_feather(s,a) or ml_private.stage3_same_near");
 if(name==='targets')body=replace(body,"and ml_private.stage4_location_card(s,a,d->>'id')", "and (not ml_private.p3c_feather(s,a) or q->>'character' not in ('character-026','character-044')) and ml_private.stage4_location_card(s,a,d->>'id')");
 if(name==='stage4_attack_effect')body=replace(body,'return ml_private.p3_monkey_effect(s,a,card,', 'return ml_private.p3c_effect(s,a,card,ml_private.p3_monkey_effect(s,a,card,').replace("jsonb_set(effect,'{roleModifiers}',mods));","jsonb_set(effect,'{roleModifiers}',mods)));");
 if(name==='character_effect_allowed')body=replace(body,"when target_character='character-044' and effect->>'origin'='role-active' and (effect->>'actor')::int<>target_seat then false", "when target_character='character-044' and ((effect->>'origin'='role-active' and (effect->>'actor')::int<>target_seat) or exists(select 1 from jsonb_array_elements(coalesce(effect->'roleModifiers','[]'::jsonb)) m where m->>'kind'='active-range' and (m->>'actor')::int<>target_seat)) then false");
 if(name==='stage3_skill')body=replace(body,' begin\n'," begin\n if cmd->>'kind'='feather' then return ml_private.p3c_skill(s,(cmd->>'actor')::int);end if;\n");
 if(name==='stage3_actions'){
  body=replace(body,"'movementBlocked',ml_private.stage3_mount_blocked(s,a)","'movementBlocked',ml_private.stage3_mount_blocked(s,a) or coalesce((s#>>array['stage3','c','blocked',a::text])::boolean,false)");
  body=replace(body,';\nend $$;'," || case when ml_private.p3c_enabled(s) then jsonb_build_object('feather',jsonb_build_object('available',free and ml_private.stage4_on_board(s,a) and p->>'character'='character-046' and not ml_private.p3c_feather(s,a),'active',coalesce((s#>>array['stage3','c','feather',a::text])::boolean,false)),'primitive',jsonb_build_object('used',s#>array['stage3','c','used',a::text],'sleep',s#>array['stage3','c','sleep',a::text])) else '{}'::jsonb end;\nend $$;");
 }
 if(name==='public_view')body=replace(body,"v:=v||jsonb_build_object('stage4'", "if ml_private.p3c_enabled(s) then v:=jsonb_set(v,'{stage3,c}',s#>'{stage3,c}');end if;v:=v||jsonb_build_object('stage4'");
 if(name==='dispatch'){
  body=replace(body,"'gift','terrain','mayi'","'gift','terrain','mayi','feather'");
  body=replace(body,"p->>'moved'='false','本个人回合已使用基础移动'", "p->>'moved'='false' and coalesce(s#>>array['stage3','c','blocked',a::text],'false')<>'true','本个人回合已使用基础移动'");
  body=replace(body," if p->>'character'='character-040' then", " s:=ml_private.p3c_move(s,a,cost);if s->>'_cMoveFailed'='true' then s:=s-'_cMoveFailed';else s:=s-'_cMoveFailed';\n if p->>'character'='character-040' then");
  body=replace(body," elsif typ='skill' then", " end if;\n elsif typ='skill' then");
 }
 return body;
}});
