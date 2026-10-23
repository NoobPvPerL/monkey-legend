import {generateP3,replace} from './p3-patch.mjs';
await generateP3({previous:'web-v0.1.10',version:'web-v0.1.11',revision:22,characters:16,path:'database/migrations/022_p3_yinghao_rules.sql',helpers:'database/engine/p3-yinghao.sql',patch(name,body){
 if(name==='stage3_card_allowed')body=replace(body,"if p->>'character'='character-005'", "if ml_private.p3_yinghao_immune(s,target,card) then return false;end if;\n if p->>'character'='character-005'");
 if(name==='stage3_monkey_targets')body=replace(body,"and (q->>'seat')::int<>a", "and not ml_private.p3_yinghao_immune(s,(q->>'seat')::int,'basic-010') and (q->>'seat')::int<>a");
 return body;
}});
