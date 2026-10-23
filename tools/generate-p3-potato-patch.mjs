import {generateP3,replace} from './p3-patch.mjs';
await generateP3({previous:'web-v0.1.12',version:'web-v0.1.13',revision:24,characters:18,path:'database/migrations/024_p3_potato_teleport.sql',helpers:'database/engine/p3-potato.sql',patch(name,body){
 if(name==='teleport_cells')body=replace(body,'return ml_private.teleport_cells_before_stage3(s,a);',"if s->>'version'='web-v0.1.13' then return ml_private.p3_potato_cells(s,a);end if;return ml_private.teleport_cells_before_stage3(s,a);");
 if(body.includes("'传送须为距离≤3的空陆地'"))body=body.replaceAll("'传送须为距离≤3的空陆地'","case when s->>'version'='web-v0.1.13' then '传送须为全图合法空格' else '传送须为距离≤3的空陆地' end");
 return body;
}});
