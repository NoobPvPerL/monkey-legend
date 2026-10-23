import {readFile} from 'node:fs/promises';
import {generateP3,replace} from './p3-patch.mjs';
const text=(await readFile('docs/cards/角色牌.md','utf8')).replaceAll('\r\n','\n'),source=JSON.parse(await readFile('packages/game-data/src/p3-character-source.json','utf8'));
for(const [id,entry] of Object.entries(source.characters)){
 const block=text.split('## '+id+' · ')[1]?.split('\n## ')[0];if(!block||block.split('\n')[0]!==entry.name)throw Error('P3 character source drift: '+id);
 const ability=block.match(/### 能力文本（牌面）\n([\s\S]*?)(?=\n### )/)?.[1].trim();if(ability!==entry.text)throw Error('P3 character text drift: '+id);
}
await generateP3({previous:'web-v0.1.11',version:'web-v0.1.12',revision:23,characters:18,path:'database/migrations/023_p3_characters.sql',helpers:'database/engine/p3-characters.sql',patch(name,body){
 if(name==='stage4_create_draft')body=body.replaceAll("ml_private.stage3_content()", "ml_private.runtime_data('web-v0.1.12','characters')").replace("ml_private.runtime_data('web-v0.1.12','characters')->'characterIds'","ml_private.runtime_data('web-v0.1.12','characterIds')").replace("#>>array['characters',id#>>'{}','faction']","#>>array[id#>>'{}','faction']");
 if(name==='stage4_attack_effect')body=replace(body,"return jsonb_set(effect,'{roleModifiers}',mods);","return ml_private.p3_monkey_effect(s,a,card,jsonb_set(effect,'{roleModifiers}',mods));");
 if(name==='stage3_actions')body=replace(body,';\nend $$;'," || case when s->>'version'='web-v0.1.12' then jsonb_build_object('mayi',jsonb_build_object('available',free and p->>'character'='character-025' and (p->>'ap')::int>=3,'targets',ml_private.p3_mayi_targets(s,a),'cost',3)) else '{}'::jsonb end;\nend $$;");
 if(name==='stage3_skill')body=replace(body,' begin\n'," begin\n if cmd->>'kind'='mayi' then return ml_private.p3_mayi_skill(s,cmd);end if;\n");
 if(name==='dispatch')body=replace(body,"'quote-cost','watch','flight','gift','terrain'","'quote-cost','watch','flight','gift','terrain','mayi'");
 if(name==='stage4_prepare_hit')body=replace(body,'begin\n',"begin\n if s->>'version'='web-v0.1.12' then s:=ml_private.p3_prepare_hit(s,h,environment);h:=s->'_hit';s:=s-'_hit';if h='null'::jsonb then return s||jsonb_build_object('_hit',null);end if;end if;\n");
 // In v12 the damage bonus precedes the cap, matching TS. Old order is frozen.
 if(name==='stage3_damage')body=replace(body,' begin\n'," begin\n if s->>'version'='web-v0.1.12' then return ml_private.stage3_damage_before_stage4(s,hits,environment,skip_pursuit);end if;\n");
 if(name==='stage3_damage_before_stage4')body=replace(body,'\n blocked:=',"\n if s->>'version'='web-v0.1.12' and ((not environment and p->>'character'='character-037') or ml_private.stage3_equipped(s,a,'basic-059')) then h:=h||jsonb_build_object('amount',least(1,(h->>'amount')::int));end if;\n blocked:=");
 if(name==='stage4_combat_choose')for(const flag of ['reflected','extra'])body=replace(body,`'${flag}',true)`, `'${flag}',true)||case when s->>'version'='web-v0.1.12' then jsonb_build_object('originCard',card) else '{}'::jsonb end`);
 return body;
}});
