import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const v=d.CLASSIC_RULE_VERSION;
const profile={manifest:d.ruleManifest(v),mapDefinition:d.mapForVersion(v),environment:d.environmentForVersion(v),sourceCatalog:d.sourceCatalogForVersion(v),runtimeData:d.runtimeForVersion(v),locationPolicy:d.classicLocationPolicy(),characterTraits:Object.fromEntries(Object.keys(d.sourceCatalogForVersion(v).characters).map(id=>[id,d.characterTraitsForVersion(v,id)]))};
const sources=await Promise.all(['002_engine','005_deferred_movement','006_social','007_feedback_rules','008_feedback_diagnostics','009_unlimited_attacks','010_versioned_catalog','011_classic_locations'].map(async n=>(await readFile(`database/migrations/${n}.sql`,'utf8')).replaceAll('\r\n','\n')));
const fn=name=>{for(const src of [...sources].reverse()){const found=src.match(new RegExp('create or replace function (?:ml_private|public)\\.'+name+'\\([\\s\\S]*?(?:end \\$\\$;|\\$\\$;)'));if(found)return found[0];}throw Error('Missing '+name);};
let sql=`-- Stage 2: approved classic map, locations, water and regional environment.
-- Four existing characters / 12 implemented card definitions; later content stays out of the runtime.
DO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<11 THEN RAISE EXCEPTION 'Apply 011 before 012'; END IF; END $$;
update ml_private.catalog set value='${JSON.stringify(profile).replaceAll("'","''")}'::jsonb where key='ruleset:web-v0.1.4';
`;
sql+=fn('allocate_spawns').replace("profile#>>'{manifest,status}'='foundation'","v='web-v0.1.4'")+'\n';
sql+=(await readFile('database/engine/classic.sql','utf8')).replaceAll('\r\n','\n');
const newer=body=>body.replaceAll("('web-v0.1.2','web-v0.1.3')","('web-v0.1.2','web-v0.1.3','web-v0.1.4')").replaceAll("s->>'version'='web-v0.1.3' or", "s->>'version' in ('web-v0.1.3','web-v0.1.4') or");
for(const name of ['select_choice','settle_movement','resolve_attack','expire','validate','create_game','escape','end_turn','teleport_cells','legal_steps','pump','choose','dispatch','public_view']){
 let body=newer(fn(name));
 if(name==='expire')body=body.replace("c->>'kind'='discard'", "c->>'kind' in ('discard','water-discard')");
 if(name==='validate')body=body.replace("('web-v0.1.1','web-v0.1.2','web-v0.1.3')", "('web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4')").replace("(s->>'round')::int between 1 and 12", "(s->>'round')::int>=1 and (s->>'version'='web-v0.1.4' or (s->>'round')::int<=12)").replace("s->>'phase'='moving' and", "(s->>'phase'='moving' or s#>>'{choice,kind}'='water-discard') and");
 if(name==='escape')body=body.replace("if ml_private.location_stops","if not ml_private.classic_enter(s,cell) then return false;end if;\n if ml_private.location_stops");
 if(name==='end_turn')body=body.replace("then s:=ml_private.settle_movement(s);", "then s:=ml_private.settle_movement(s);s:=ml_private.classic_relocated(s,a,s->'players'->a->>'cell',s#>>'{movement,lastEmpty}');");
 if(name==='create_game')body=body.replace("for a in 0..3 loop id:=chars", "if rulev='web-v0.1.4' then s:=ml_private.allocate_spawns(rulev,chars,s); end if;\n for a in 0..3 loop id:=chars")
  .replace("'cell',c->'spawn'", "'cell',case when rulev='web-v0.1.4' then s->'_spawns'->a else c->'spawn' end")
  .replace("s:=ml_private.emit(s,'setup'", "s:=s-'_spawns'; if rulev='web-v0.1.4' then s:=s||jsonb_build_object('classic',jsonb_build_object('poison','[]'::jsonb,'bombs','[]'::jsonb,'exposure',(select jsonb_agg(jsonb_build_object('region',null,'streak',0)) from generate_series(0,3)),'shipUsed','[]'::jsonb,'farmClosed',false)); end if;\n s:=ml_private.emit(s,'setup'");
 if(name==='create_game')body=body.replaceAll("then 'web-v0.1.3' else 'web-v0.1.1'","then 'web-v0.1.4' else 'web-v0.1.1'");
 if(name==='teleport_cells')body=body.replace("c->>'terrain'='land'", "c->>'terrain'='land' and ml_private.classic_enter(s,c->>'id')");
 if(name==='legal_steps'){
  sql+=body.replace('ml_private.legal_steps(', 'ml_private.legal_steps_legacy(')+'\n';
  body=`create or replace function ml_private.legal_steps(s jsonb) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$ begin
 if s->>'version'<>'web-v0.1.4' then return ml_private.legal_steps_legacy(s);end if;
 if s->>'phase'<>'moving' or s->'movement'='null'::jsonb then return '[]';end if;
 return (select coalesce(jsonb_agg(c->'id'),'[]') from ml_private.arr(ml_private.game_data(s,'cells')) c where ml_private.classic_step_cost(s,(s->>'active')::int,c->>'id')<=(s#>>'{movement,remaining}')::int and ml_private.escape(s,(s->>'active')::int,c->>'id',(s#>>'{movement,remaining}')::int-ml_private.classic_step_cost(s,(s->>'active')::int,c->>'id')));
end $$;`;
 }
 if(name==='pump')body=body.replace("case task->>'kind'",`case task->>'kind'
   when 'water' then if ml_private.classic_owes_water(s,a) then s:=ml_private.select_choice(s,'water-discard',a,at,jsonb_build_object('count',1,'cards',p->'hand'));end if;
   when 'classic-start' then
    for a in 0..3 loop p:=s->'players'->a;if (p->>'hp')::int>0 then p:=p||jsonb_build_object('skillUsed',false,'rewarded','[]'::jsonb);if (p->>'ap')::int<5 then p:=p||jsonb_build_object('ap',(p->>'ap')::int+3);s:=ml_private.put_player(s,a,p);s:=ml_private.emit(s,'ap',ml_private.name(s,a)||' 轮开始获得3AP → '||(p->>'ap'));end if;s:=ml_private.put_player(s,a,p);end if;end loop;
    s:=ml_private.classic_refresh(s);s:=ml_private.emit(s,'round','第'||(s->>'round')||'轮开始，毒区：'||(select string_agg(x#>>'{}','、') from ml_private.arr(s#>'{classic,poison}') x)||case when (s#>>'{classic,farmClosed}')::boolean then '；高唐农场已封闭' else '' end);s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','after-env'))||(s->'queue'));
   when 'round-next' then s:=ml_private.finish(s,false,at);if s->>'phase'<>'over' then s:=s||jsonb_build_object('round',(s->>'round')::int+1,'cursor',0);s:=ml_private.start_round(s,at);end if;
   when 'walk' then s:=ml_private.classic_walk(s,coalesce(task->'path','[]'),at);`)
  .replace("s:=s||jsonb_build_object('active',a", "if s->>'version'='web-v0.1.4' then s:=jsonb_set(s,'{classic,shipUsed}',(s#>'{classic,shipUsed}')-a);end if;\n    s:=s||jsonb_build_object('active',a");
 // jsonb integer subtraction removes an index, not an integer value.
 if(name==='pump')body=body.replace("(s#>'{classic,shipUsed}')-a", "(select coalesce(jsonb_agg(x),'[]') from ml_private.arr(s#>'{classic,shipUsed}') x where x<>to_jsonb(a))");
 if(name==='choose')body=body.replace("when 'discard' then", "when 'discard','water-discard' then")
  .replace("s:=ml_private.put_player(s,a,p||jsonb_build_object('cell',cell,'skillUsed',true));", "s:=ml_private.put_player(s,a,p||jsonb_build_object('cell',cell,'skillUsed',true));s:=ml_private.classic_relocated(s,a,p->>'cell',cell);");
 if(name==='dispatch'){
  body=body.replace("guard:=guard+1; perform ml_private.need(guard<1000","exit when s->>'version'='web-v0.1.4' and guard>=999;guard:=guard+1; perform ml_private.need(guard<1000");
  body=body.replace("'choose','tick')", "'choose','tick','location')");
  body=body.replace("if typ='step' then perform", "if typ='location' then perform ml_private.need(cmd->>'kind' in ('ship','commute') and jsonb_typeof(cmd->'cell')='string','地点动作输入无效');end if;\n if typ='step' then perform");
  const a=body.indexOf("when 'step' then"),b=body.indexOf("when 'stop' then",a),original=body.slice(a,b);
  body=body.slice(0,a)+"when 'step' then if s->>'version'='web-v0.1.4' then perform ml_private.need(s->>'phase'='moving' and s->'movement'<>'null'::jsonb and jsonb_array_length(cmd->'path')>0,'尚未开始移动或路径为空');s:=ml_private.classic_walk(s,cmd->'path',at);else "+original.replace("when 'step' then",'')+"end if;\n    "+body.slice(b);
  body=body.replace("if typ='move' then", `if typ='location' then
      v:=s||jsonb_build_object('shipUsed',coalesce(s#>'{classic,shipUsed}','[]'),'farmClosed',coalesce(s#>'{classic,farmClosed}','false'));cell:=cmd->>'cell';
      perform ml_private.need(ml_private.location_destinations(v,a,cmd->>'kind') ? cell,'地点传送当前不可用或落点不合法');
      if cmd->>'kind'='ship' then s:=jsonb_set(s,'{classic,shipUsed}',(s#>'{classic,shipUsed}')||to_jsonb(a));else s:=ml_private.put_player(s,a,p||jsonb_build_object('ap',0));end if;
      s:=ml_private.put_player(s,a,(s->'players'->a)||jsonb_build_object('cell',cell));s:=ml_private.classic_relocated(s,a,p->>'cell',cell);
      s:=ml_private.emit(s,'teleport',ml_private.name(s,a)||' '||case when cmd->>'kind'='ship' then '飞船' else '通校' end||'至'||cell);
      if ml_private.classic_owes_water(s,a,p->>'cell') then s:=jsonb_set(s,'{queue}',(s->'queue')||jsonb_build_array(jsonb_build_object('kind','action')));s:=ml_private.select_choice(s,'water-discard',a,at,jsonb_build_object('count',1,'cards',p->'hand'));end if;
     elsif typ='move' then`);
 }
 sql+=body+'\n';
}
sql+=fn('damage').replace("case when environment then 0", "case when environment and s->>'version'<>'web-v0.1.4' then 0")+'\n';
for(const name of ['start_round','next_turn']){
 sql+=fn(name).replace('ml_private.'+name+'(', 'ml_private.'+name+'_legacy(')+'\n';
 sql+=`create or replace function ml_private.${name}(s jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$ declare cursor integer; a integer; begin
 if s->>'version'<>'web-v0.1.4' then return ml_private.${name}_legacy(s,at);end if;
 ${name==='start_round'?`s:=ml_private.pause(s,at);s:=jsonb_set(s,'{phase}','"resolving"');
 s:=jsonb_set(s,'{queue}',(s->'queue')||(select jsonb_agg(jsonb_build_object('kind','water','actor',x)) from ml_private.arr(s->'order') x)||jsonb_build_array(jsonb_build_object('kind','classic-start')));return ml_private.pump(s,at);`
 :`s:=ml_private.pause(s,at);a:=(s->>'active')::int;s:=ml_private.put_player(s,a,(s->'players'->a)||jsonb_build_object('moved',false,'attacks',0));cursor:=(s->>'cursor')::int+1;
 while cursor<4 and (s->'players'->(s->'order'->>cursor)::int->>'hp')::int<=0 loop cursor:=cursor+1;end loop;s:=jsonb_set(s,'{cursor}',to_jsonb(cursor));
 if cursor<4 then return jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','turn-start','actor',s->'order'->cursor))||(s->'queue'));end if;
 s:=jsonb_set(s,'{phase}','"resolving"');s:=ml_private.classic_environment(s);s:=ml_private.emit(s,'environment','第'||(s->>'round')||'轮末，轰炸：'||(select string_agg(x#>>'{}','、') from ml_private.arr(s#>'{classic,bombs}') x));s:=ml_private.damage(s,s->'_hits',true);s:=s-'_hits';
 s:=jsonb_set(s,'{queue}',(s->'queue')||(s->'_triggers')||jsonb_build_array(jsonb_build_object('kind','round-next')));return s-'_triggers';`}
end $$;
`;
}
sql+=`create or replace function ml_private.safe_for_version(v text,r integer) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$
 select coalesce(jsonb_agg(c->'id'),'[]') from ml_private.arr(ml_private.runtime_data(v,'cells')) c where v='web-v0.1.4' or r<=3 or (r<=5 and (c->>'col')::int between 2 and 7) or (r>5 and r<=7 and (c->>'col')::int between 3 and 6) or (r>7 and r<=9 and (c->>'row')::int between 2 and 3 and (c->>'col')::int between 3 and 6) or (r>9 and (c->>'row')::int between 2 and 3 and (c->>'col')::int between 3 and 5) $$;
`;
// Existing room identity/revision/receipt/authority checks are retained.
sql+=fn('room_v1').replace("('play','move','step','stop','end','choose')", "('play','move','step','stop','end','choose','location')").replace("'cell','cards')","'cell','cards','kind')")+'\n';
sql+=`create or replace function public.ml_health() returns jsonb language sql security definer set search_path=pg_catalog as $$
 with readiness as (select coalesce((select value#>>'{manifest,status}'='playable' and jsonb_array_length(value#>'{runtimeData,allCards}')=64 and value#>>'{environment,kind}'='classic-regions-v1' and value#>>'{characterTraits,character-004,faction}'='帝汶家族' and value#>>'{characterTraits,character-004,spawnRegion}'='操场' from ml_private.catalog where key='ruleset:web-v0.1.4'),false) and to_regprocedure('ml_private.classic_walk(jsonb,jsonb,double precision)') is not null and to_regprocedure('ml_private.classic_environment(jsonb)') is not null as ready)
 select jsonb_build_object('ok',true,'schemaVersion',2,'engineRevision',12,'ruleVersion','web-v0.1.4','legacyRuleVersions',jsonb_build_array('web-v0.1.1','web-v0.1.2','web-v0.1.3'),'feedbackRulesReady',true,'versionedDataReady',(select count(*)=4 from ml_private.catalog where key like 'ruleset:web-v0.1.%'),'locationDataReady',ready,'locationRulesReady',ready,'waterRulesReady',ready,'environmentRulesReady',ready,'classicPlayable',ready,'classicRuleVersion','web-v0.1.4','engine','postgresql') from readiness $$;
revoke all on all functions in schema ml_private from public;
DO $$ declare r text; begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;
`;
const path='database/migrations/012_classic_rules.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==sql)throw Error('Classic engine SQL differs');}else await writeFile(path,sql);
console.log('012: classic location commands, resumable water choice and regional environment.');
