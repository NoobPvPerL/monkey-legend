import {readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['packages/game-data/src/index.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const d=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
const v=d.CLASSIC_RULE_VERSION;
const profile=JSON.parse(await readFile('packages/game-data/src/baselines/stage2-locations.json','utf8'));
let sql=`-- Stage 2 owner-approved locations and lemon classification. No legacy ruleset changes.
DO $$ BEGIN
 IF coalesce((public.ml_health()->>'engineRevision')::int,0)<10 OR NOT EXISTS (select 1 from ml_private.catalog where key='ruleset:web-v0.1.4') THEN
  RAISE EXCEPTION 'Apply 010_versioned_catalog.sql before 011_classic_locations.sql';
 END IF;
END $$;
update ml_private.catalog set value='${JSON.stringify(profile).replaceAll("'","''")}'::jsonb where key='ruleset:web-v0.1.4' and value#>>'{manifest,status}'='foundation';
create or replace function ml_private.region_at(v text,cell text) returns text language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare region text:=ml_private.version_catalog(v)#>>array['mapDefinition','map',cell,'region']; begin
 perform ml_private.need(region is not null,'位置无效'); return region;
end $$;
create or replace function ml_private.location_basic_cost(v text,cell text) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select case when v='web-v0.1.4' and ml_private.region_at(v,cell)='操场' then 0 else 1 end $$;
create or replace function ml_private.location_draw_count(v text,cell text,r integer) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select case when r=1 then 0 when v='web-v0.1.4' and ml_private.region_at(v,cell)='高唐农场' then 3 else 2 end $$;
create or replace function ml_private.location_personal_ap(v text,p jsonb,r integer) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select case when p->>'character'='character-031' then greatest(6,(p->>'ap')::int) else (p->>'ap')::int end + case when v='web-v0.1.4' and r>1 and ml_private.region_at(v,p->>'cell')='尚德荟' then 1 else 0 end $$;
create or replace function ml_private.location_food_heal(v text,p jsonb,amount integer) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select case when (p->>'hp')::int<=0 or p->>'character'='character-027' then 0 else least(greatest(0,(p->>'maxHp')::int-(p->>'hp')::int),amount+case when v='web-v0.1.4' and ml_private.region_at(v,p->>'cell')='XDF' then 1 else 0 end) end $$;
create or replace function ml_private.location_card_allowed(v text,cell text,card text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select not (v='web-v0.1.4' and ml_private.region_at(v,cell) in ('教学楼','秀松苑') and split_part(card,'#',1) in ('basic-009','basic-010')) $$;
create or replace function ml_private.location_effect_allowed(v text,cell text,card text) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare definition jsonb; begin
 if v<>'web-v0.1.4' or ml_private.region_at(v,cell)<>'办公室' then return true; end if;
 definition:=ml_private.version_catalog(v)#>array['sourceCatalog','cards',split_part(card,'#',1)]; perform ml_private.need(definition is not null,'卡牌未在此版本目录');
 return not (definition->'tags' ? '建民');
end $$;
create or replace function ml_private.location_stops(v text,cell text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select v='web-v0.1.4' and ml_private.region_at(v,cell)='山洞' $$;
create or replace function ml_private.location_destinations(s jsonb,a integer,kind text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a; cells jsonb; begin
 perform ml_private.need(kind in ('ship','commute'),'未知地点动作');
 if s->>'version'<>'web-v0.1.4' or s->>'phase'<>'action' or s->'choice'<>'null'::jsonb or (s->>'active')::int<>a or (p->>'hp')::int<=0 or (p->>'ap')::int<1 then return '[]'; end if;
 if kind='ship' and (ml_private.region_at(s->>'version',p->>'cell')<>'飞船' or coalesce(s->'shipUsed','[]') @> jsonb_build_array(a)) then return '[]'; end if;
 cells:=ml_private.version_catalog(s->>'version')#>'{mapDefinition,cells}';
 return (select coalesce(jsonb_agg(c->'id'),'[]') from ml_private.arr(cells) c
 where (kind<>'commute' or c->>'region'='云上学府') and (not coalesce((s->>'farmClosed')::boolean,false) or c->>'region'<>'高唐农场') and not exists (select 1 from ml_private.arr(s->'players') other where (other->>'hp')::int>0 and other->>'cell'=c->>'id'));
end $$;
create or replace function ml_private.location_teleport(previous jsonb,a integer,kind text,cell text) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare s jsonb:=previous; p jsonb; candidates jsonb; begin
 candidates:=ml_private.location_destinations(s,a,kind);
 perform ml_private.need(candidates ? cell,'地点传送当前不可用或落点不合法');
 if kind='ship' then s:=s||jsonb_build_object('shipUsed',coalesce(s->'shipUsed','[]')||jsonb_build_array(a));
 else s:=jsonb_set(s,array['players',a::text,'ap'],'0'); end if;
 s:=jsonb_set(s,array['players',a::text,'cell'],to_jsonb(cell));
 return jsonb_build_object('state',s,'arrival',jsonb_build_object('actor',a,'cell',cell,'kind',kind,'water',(ml_private.version_catalog(s->>'version')#>>array['mapDefinition','map',cell,'terrain'])='water'));
end $$;
`;
// Override only the obsolete conflict check; 010 and its baseline remain unchanged.
const old=(await readFile('database/migrations/010_versioned_catalog.sql','utf8')).replaceAll('\r\n','\n');
const allocate=old.match(/create or replace function ml_private\.allocate_spawns\([\s\S]*?end \$\$;/)?.[0];if(!allocate)throw Error('Missing 010 spawn helper');
sql+=allocate.replace(/^.*perform ml_private.need\(not \(profile#>'\{manifest,spawnConflicts\}'.*\n/m,'')+'\n';
const original=(await readFile('database/migrations/002_engine.sql','utf8')).replaceAll('\r\n','\n');
const definition=name=>(old.match(new RegExp('create or replace function ml_private\\.'+name+'\\([\\s\\S]*?end \\$\\$;'))??original.match(new RegExp('create or replace function ml_private\\.'+name+'\\([\\s\\S]*?end \\$\\$;')))?.[0];
for(const name of ['heal','pump','escape','targets','dispatch']){
 let body=definition(name);if(!body)throw Error('Missing location adapter '+name);
 if(name==='heal')body=body.replace("if hp>0 and not (food and p->>'character'='character-027') then hp:=least((p->>'maxHp')::int,hp+amount); end if;","if hp>0 then hp:=hp+case when food then ml_private.location_food_heal(s->>'version',p,amount) else least((p->>'maxHp')::int-hp,amount) end; end if;");
 if(name==='pump')body=body.replace("s:=ml_private.emit(s,'turn'", "if ml_private.location_personal_ap(s->>'version',p,(s->>'round')::int)>(p->>'ap')::int then p:=p||jsonb_build_object('ap',ml_private.location_personal_ap(s->>'version',p,(s->>'round')::int)); s:=ml_private.put_player(s,a,p); s:=ml_private.emit(s,'ap',ml_private.name(s,a)||' 尚德荟获得1AP → '||(p->>'ap')); end if;\n    s:=ml_private.emit(s,'turn'")
  .replace('ml_private.draw(s,a,2)','ml_private.draw(s,a,ml_private.location_draw_count(s->>\'version\',p->>\'cell\',(s->>\'round\')::int))')
  .replace("when 'response' then if", "when 'response' then if not (s#>'{attack,cancelled}' @> jsonb_build_array(a)) and");
 if(name==='escape')body=body.replace("if not ml_private.occupied(s,cell,a) then return true; end if;","if ml_private.location_stops(s->>'version',cell) and ml_private.occupied(s,cell,a) then return false; end if;\n if not ml_private.occupied(s,cell,a) then return true; end if;");
 if(name==='targets')body=body.replace("if d is null or d->>'type'<>'attack'", "if d is null or d->>'type'<>'attack' or not ml_private.location_card_allowed(s->>'version',s->'players'->a->>'cell',card)");
 if(name==='dispatch')body=body
  .replace("(p->>'ap')::int>=1,'移动需要1AP'", "(p->>'ap')::int>=ml_private.location_basic_cost(s->>'version',p->>'cell'),'移动需要1AP'")
  .replace("jsonb_build_object('costDue',true)","jsonb_build_object('costDue',ml_private.location_basic_cost(s->>'version',p->>'cell')>0)")
  .replace("case when s->>'version' in ('web-v0.1.2','web-v0.1.3') then ' 移动结束扣费，获得'", "case when ml_private.location_basic_cost(s->>'version',p->>'cell')=0 then ' 操场免费移动，获得' when s->>'version' in ('web-v0.1.2','web-v0.1.3') then ' 移动结束扣费，获得'")
  .replace("s:=ml_private.emit(s,'move',ml_private.name(s,a)||' → '","if ml_private.location_stops(s->>'version',cell) then left_steps:=0; m:=jsonb_set(m,'{remaining}','0'); end if;\n      s:=ml_private.emit(s,'move',ml_private.name(s,a)||' → '")
  .replace("d:=ml_private.rule_card(s,card); targets:=", "d:=ml_private.rule_card(s,card); perform ml_private.need(ml_private.location_card_allowed(s->>'version',p->>'cell',card),'当前位置禁止使用此牌'); targets:=")
  .replace("'cancelled','[]'::jsonb,'elbows'", "'cancelled',(select coalesce(jsonb_agg(x),'[]') from ml_private.arr(targets) x where not ml_private.location_effect_allowed(s->>'version',s->'players'->(x#>>'{}')::int->>'cell',card)),'elbows'");
 if(body===definition(name))throw Error('Location adapter did not change '+name);
 sql+=body+'\n';
}
sql+=`create or replace function public.ml_health() returns jsonb language sql security definer
set search_path=pg_catalog as $$ select jsonb_build_object('ok',true,'schemaVersion',2,'engineRevision',11,'feedbackRulesReady',true,'versionedDataReady',
 to_regprocedure('ml_private.game_data(jsonb,text)') is not null and (select count(*)=4 from ml_private.catalog where key like 'ruleset:web-v0.1.%'),
 'ruleVersion','web-v0.1.3','legacyRuleVersion','web-v0.1.1','legacyRuleVersions',jsonb_build_array('web-v0.1.1','web-v0.1.2'),'foundationRuleVersion','web-v0.1.4','classicPlayable',false,
 'locationDataReady',to_regprocedure('ml_private.location_teleport(jsonb,integer,text,text)') is not null and
 coalesce((select value#>>'{characterTraits,character-004,faction}'='帝汶家族' and value#>>'{characterTraits,character-004,spawnRegion}'='操场' from ml_private.catalog where key='ruleset:web-v0.1.4'),false),
 'locationRulesReady',false,'waterRulesReady',false,'environmentRulesReady',false,'engine','postgresql',
 'features',jsonb_build_array('deferred-movement','spectators','chat','feedback-rules','unlimited-attacks','versioned-data','classic-foundation','classic-locations','lemon-retainer')) $$;
revoke all on all functions in schema ml_private from public;
DO $$ declare r text; begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r); end loop; end $$;
`;
const path='database/migrations/011_classic_locations.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==sql)throw Error('Stage 2 location SQL differs from approved profiles');}
else await writeFile(path,sql);
console.log('011: lemon retainer / playground spawn and approved location functions; water and environment remain gated.');
