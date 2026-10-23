import {replace} from './p3-patch.mjs';

// Applied to the latest frozen function definitions by the forthcoming029
// generator. A new unclassified d6 call fails rather than acquiring an owner
// from the currently active seat. Legacy versions still call their old die.
const owned={
 resolve_attack:[["d->>'name'",'a']],
 dispatch:[["'西帝汶方向'",'a'],["'基础移动'",'a']],
 dispatch_before_stage3:[["'基础移动'",'a']],
 choose_before_stage3:[["'跑者恢复'",'a']],
 stage3_handle_task:[["'油泼'","(c->>'actor')::int"]],
 choose_before_stage4:[["'你要不要吃'",'a'],["'easy 太简单了'",'a'],["'QB 纯菜'",'a']],
 stage3_skill_before_stage4:[["'紫檀木费用'",'a']],
 stage3_handle_task_before_stage4:[["d->>'name'","(pending->>'actor')::int"],["'S'||(target+1)||' 猴子游戏'",'target']],
 stage4_combat_task:[["'躲避球'","(c->>'actor')::int"]],
 stage4_combat_choose:[["'帝汶斗篷'",'a']],
 p3c_move:[["'脚短'",'a']],p3d_task:[["'摇'",'a']],p3d_choose:[["'鼓励队友'",'a']],
 p3f_move_gate:[["'干枯'",'a']],p3f_skill:[["'斩杀'",'a']],
 p3f_choose:[["case when k='f-self-harm' then '自虐' when k='f-bccb' then 'bccb' else '毒蜇' end",'a']],
};
export function patchGDieOwners(name,body){
 if(name==='playtest_role_choice')body=replace(body,"select s->>'version'", "select (ml_private.p3g_enabled(s) and kind in ('g-haki','g-food','g-invisible','g-program','g-math','g-counter','g-white-eye')) or s->>'version'");
 if(name==='select_choice')body=body.replaceAll("kind='discard' or ml_private.p3f_enabled(s)","ml_private.p3g_enabled(s) and kind='g-discard' or kind='discard' or ml_private.p3f_enabled(s)");
 if(name==='stage3_turn_start_before_stage4')body=replace(replace(body,'return ml_private.p3f_start(','return ml_private.p3g_start(ml_private.p3f_start('),'),a),a),a),a);','),a),a),a),a),a);');
 if(['pump','expire'].includes(name))body=body.replace(/\bbegin\b/i,'begin s:=ml_private.p3g_at(s,at);');
 for(const [reason,owner] of owned[name]??[])body=replace(body,`ml_private.die(s,${reason})`,`ml_private.p3g_owned_die(s,${reason},${owner})`);
 if(body.includes('ml_private.die(s,'))throw Error('G骰子归属未分类：'+name);
 if(name==='stage4_quote'){
  const start="  if jsonb_array_length(s#>'{random,dice}')>0 then",end="s:=s-'_int';end if;";
  body=replace(body,start,"  if ml_private.p3g_enabled(s) then s:=ml_private.p3g_die(s,'随机费用',a);roll:=(s->>'_roll')::int;s:=s-'_roll';else\n"+start);
  body=replace(body,end,end+'end if;');
 }
 if(name==='stage4_map_choose'){
  const anchor="s:=ml_private.emit(s,'dice','卫汶找你：d6 = '||roll,to_jsonb(roll));";
  body=replace(body,anchor,anchor+"if ml_private.p3g_enabled(s) then s:=ml_private.p3g_after_die(s,'卫汶找你',(pending->>'actor')::int,roll);roll:=(s->>'_roll')::int;s:=s-'_roll';end if;");
 }
 return body;
}
