import {readFile} from 'node:fs/promises';
import {generateP3,replace} from './p3-patch.mjs';
const source=JSON.parse(await readFile('packages/game-data/src/p3-d-source.json','utf8')),transcript=(await readFile('docs/cards/角色牌.md','utf8')).replaceAll('\r\n','\n');
for(const [id,c] of Object.entries(source.characters)){const block=transcript.split('## '+id+' · ')[1]?.split('\n## ')[0];if(!block||block.split('\n')[0]!==c.name||block.match(/### 能力文本（牌面）\n([\s\S]*?)(?=\n### )/)?.[1].trim()!==c.text)throw Error('D source drift: '+id);}
await generateP3({previous:'web-v0.1.14',version:'web-v0.1.15',revision:26,characters:23,path:'database/migrations/026_p3_batch_d.sql',helpers:'database/engine/p3-d.sql',patch(name,body){
 if(name==='draft_offer')body=replace(body,"pool:=s->'pools'->(s->'teams'->>a);","pool:=ml_private.p3d_spawn_pool(s,s->'pools'->(s->'teams'->>a));");
 if(name==='create_draft')body=replace(body,'s:=ml_private.draft_offer(s,at);',"perform ml_private.need(ml_private.p3d_spawn_safe(s),'出生容量过滤后角色池可能不足三个候选，请补齐角色池');s:=ml_private.draft_offer(s,at);");
 if(name==='validate_draft'){
  body=replace(body,"for i in 0..3 loop", "if s->>'catalogVersion'='web-v0.1.15' then for a in select (v#>>'{}')::int from ml_private.arr(s->'order') v where s->'selected'->(v#>>'{}')::int<>'null'::jsonb loop perform ml_private.need(ml_private.p3d_spawn_pool(jsonb_set(s,array['selected',a::text],'null'),jsonb_build_array(s->'selected'->a)) @> jsonb_build_array(s->'selected'->a),'已选角色超过出生地区容量');end loop;end if;for i in 0..3 loop");
  body=replace(body,"s->'pools'->(s->'teams'->>(o->>'actor')::int) @> (o->'candidates')", "ml_private.p3d_spawn_pool(s,s->'pools'->(s->'teams'->>(o->>'actor')::int)) @> (o->'candidates')");
 }
 if(name==='validate')body=replace(body,'begin\n',"begin\n perform ml_private.need(ml_private.p3d_valid(s),'D批角色状态无效');\n");
 if(name==='create_game'){
  body=replace(body,"if setup ? 'deck' then", "if ml_private.p3d_enabled(s) and chars ? 'character-020' then select ord-1 into firstn from jsonb_array_elements(chars) with ordinality q(v,ord) where v='\"character-020\"';end if;\n if setup ? 'deck' then");
  body=replace(body,"s:=ml_private.emit(s,'setup'", "if ml_private.p3d_enabled(s) then s:=ml_private.p3d_start(ml_private.p3c_start(s,firstn),firstn);end if;s:=ml_private.emit(s,'setup'");
 }
 if(name==='stage3_turn_start_before_stage4')body=replace(body,'return ml_private.p3c_start(', 'return ml_private.p3d_start(ml_private.p3c_start(').replace('stage3}', 'stage3}').replace('),a);',()=>'),a),a);');
 if(name==='stage3_damage_before_stage4')body=replace(body,"jsonb_build_object('_triggers',triggers)","jsonb_build_object('_triggers',triggers||ml_private.p3d_injury(s,injured))");
 if(name==='stage3_handle_task')body=replace(body,'begin\n',"begin\n if ml_private.p3d_enabled(s) and t->>'action' in ('encourage','encourage-discard','nailong-shake') then return ml_private.p3d_task(s,t,at);end if;\n");
 if(name==='playtest_role_choice')body=replace(body,"ml_private.p3c_enabled(s) and kind='primitive-food'", "ml_private.p3d_enabled(s) and kind='encourage' or ml_private.p3c_enabled(s) and kind='primitive-food'");
 if(name==='select_choice')body=body.replaceAll("when kind='discard'", "when (kind='discard' or ml_private.p3d_enabled(s) and kind='encourage-discard')");
 if(name==='choose_before_stage4'){
  body=replace(body,' case kind\n'," case kind\n when 'encourage','encourage-discard' then s:=ml_private.p3d_choose(s,cmd,at,timeout);\n");
  body=replace(body,"s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((s#>>array['players',a::text,'ap'])::int-(quoted->>'cost')::int));", "s:=ml_private.p3d_pay(s,a,(quoted->>'cost')::int);");
 }
 if(name==='choose')body=replace(body,"s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((s#>>array['players',a::text,'ap'])::int-(fee->>'spend')::int));", "s:=ml_private.p3d_pay(s,a,(fee->>'spend')::int);");
 if(name==='stage3_skill')body=replace(body,' begin\n'," begin\n if cmd->>'kind'='clan' then return ml_private.p3d_clan(s,(cmd->>'actor')::int);end if;\n");
 if(name==='stage3_skill_before_stage4'||name==='stage4_equipment_skill')body=replace(body,"s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((p->>'ap')::int-cost));", "s:=ml_private.p3d_pay(s,a,cost);");
 if(name==='stage4_combat_choose')body=replace(body,"s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((s#>>array['players',a::text,'ap'])::int-1));", "s:=ml_private.p3d_pay(s,a,1);");
 if(name==='stage4_pay')body=replace(body,"if amount>0 and", "if mode='desert' and pay_ap then s:=ml_private.p3d_paid(s,a,(s#>>array['players',a::text,'ap'])::int+amount,amount);end if;\n  if amount>0 and");
 if(name==='stage4_reserve_interrupt')body=replace(body,'s:=ml_private.put_player(s,a,p);',"s:=ml_private.put_player(s,a,p);s:=ml_private.p3d_paid(s,a,(p->>'ap')::int+(quoted->>'cost')::int,(quoted->>'cost')::int);");
 if(name==='settle_movement_before_stage3')body=replace(body,"s:=ml_private.put_player(s,a,p||jsonb_build_object('ap',greatest(0,(p->>'ap')::int-1)));", "s:=ml_private.p3d_pay(s,a,least(1,(p->>'ap')::int));");
 if(name==='targets')body=replace(body,"and (not ml_private.p3c_feather", "and (d->>'id'<>'basic-009' or ml_private.p3d_ball_allowed(s,a,(q->>'seat')::int)) and (not ml_private.p3c_feather");
 if(name==='stage4_attack_effect')body=replace(body,'return ml_private.p3c_effect(', 'return ml_private.p3d_effect(s,a,card,ml_private.p3c_effect(').replace("jsonb_set(effect,'{roleModifiers}',mods)));", "jsonb_set(effect,'{roleModifiers}',mods))));");
 if(name==='stage4_prepare_hit')body=replace(body,'begin\n',"begin\n if ml_private.p3d_enabled(s) and s#>>array['players',a::text,'character']='character-029' and c->>'definition'='basic-009' then return s||jsonb_build_object('_hit',null);end if;\n");
 if(name==='stage4_combat_task'){
  body=replace(body,"coalesce(c#>>'{stage4,dodge}','false')<>'true' then", "coalesce(c#>>'{stage4,dodge}','false')<>'true' and not(ml_private.p3d_enabled(s) and s#>>array['players',a::text,'character']='character-029') then");
  body=replace(body,"hit:=coalesce(c#>>'{stage4,dodge}','false')='true' or", "hit:=coalesce(c#>>'{stage4,dodge}','false')='true' or ml_private.p3d_enabled(s) and s#>>array['players',a::text,'character']='character-029' or");
 }
 if(name==='stage3_play_before_stage4'){
  body=replace(body,"cost integer;begin", "cost integer;dodge boolean:=cmd->>'as'='dodge';begin\n if coalesce(dodge,false) then perform ml_private.need(ml_private.p3d_enabled(s) and p->>'character'='character-029','只有本版本奶龙大帝可以转换躲避球');d:=ml_private.rule_card(s,'basic-009');end if;");
  body=replace(body,'if converted then quoted:=',"if coalesce(dodge,false) then quoted:=jsonb_build_object('cost',2,'effect',jsonb_build_object('origin','role-active','actor',a,'faction',p->'faction','roleModifiers',jsonb_build_array(jsonb_build_object('actor',a,'kind','conversion'))));elsif converted then quoted:=");
  body=replace(body,'ml_private.stage4_attack_effect(s,a,card,effect)',"ml_private.stage4_attack_effect(s,a,case when dodge then 'basic-009' else card end,effect)");
  body=replace(body,'legal:=ml_private.targets(s,a,card);',"legal:=case when dodge then ml_private.p3d_dodge_targets(s,a) else ml_private.targets(s,a,card) end;");
  body=replace(body,"case when elbow then 'basic-002' else card end", "case when elbow then 'basic-002' when dodge then 'basic-009' else card end");
  body=replace(body,'s:=ml_private.put_player(s,a,p);',"s:=ml_private.put_player(s,a,p);s:=ml_private.p3d_paid(s,a,(p->>'ap')::int+cost,cost);");
 }
 if(name==='stage3_play'){
  body=replace(body,"or cmd->>'as'='elbow' then", "or cmd->>'as' in ('elbow','dodge') then");
  body=replace(body,"if not(cmd ? 'as') and definition='basic-009' and", "if (not(cmd ? 'as') or cmd->>'as'='dodge') and (definition='basic-009' or cmd->>'as'='dodge') and");
  body=replace(body,'s:=ml_private.put_player(s,a,p);',"s:=ml_private.put_player(s,a,p);s:=ml_private.p3d_paid(s,a,(p->>'ap')::int+(fee->>'spend')::int,(fee->>'spend')::int);");
 }
 if(name==='stage3_actions'){
  body=replace(body,"then ml_private.stage3_elbow_targets(s,a,true) else", "then ml_private.stage3_elbow_targets(s,a,true) when ml_private.p3d_enabled(s) and p->>'character'='character-029' then ml_private.p3d_dodge_targets(s,a) else");
  body=replace(body,';\nend $$;'," || case when ml_private.p3d_enabled(s) then jsonb_build_object('clan',jsonb_build_object('available',free and ml_private.stage4_on_board(s,a) and p->>'character'='character-053' and s#>>array['stage3','d','clanUsed',a::text]='false' and jsonb_array_length(p->'hand')>0,'used',s#>array['stage3','d','clanUsed',a::text],'targets',ml_private.p3d_clan_targets(s,a,true))) else '{}'::jsonb end;\nend $$;");
 }
 if(name==='public_view')body=replace(body,"if ml_private.p3c_enabled(s) then", "if ml_private.p3d_enabled(s) then v:=jsonb_set(v,'{stage3,d}',s#>'{stage3,d}');end if;if ml_private.p3c_enabled(s) then");
 if(name==='dispatch'){
  body=replace(body,"cmd->>'as'='elbow')", "cmd->>'as'='elbow' or ml_private.p3d_enabled(s) and cmd->>'as'='dodge')");
  body=replace(body,"'mayi','feather'", "'mayi','feather','clan'");
  body=replace(body,"else s:=jsonb_set(s,array['players',a::text,'ap'],'0');end if;", "else s:=ml_private.p3d_pay(s,a,(s#>>array['players',a::text,'ap'])::int);end if;");
 }
 return body;
}});
