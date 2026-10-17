import {readFile,writeFile} from 'node:fs/promises';
const engine=(await readFile('database/engine/stage3-generated.sql','utf8')).replaceAll('\r\n','\n');
const rooms=(await readFile('database/engine/stage3-rooms-generated.sql','utf8')).replaceAll('\r\n','\n');
const health=`
create or replace function public.ml_health() returns jsonb language sql security definer set search_path=pg_catalog as $$
with readiness as (select coalesce((select
 value#>>'{manifest,status}'='playable'
 and jsonb_array_length(value#>'{runtimeData,allCards}')=85
 and jsonb_object_length_placeholder
 and jsonb_array_length(value#>'{runtimeData,characterIds}')=16
 and value#>>'{characterTraits,character-004,faction}'='帝汶家族'
 and value#>>'{characterTraits,character-004,spawnRegion}'='操场'
 and value#>>'{environment,kind}'='classic-regions-v2'
 and value#>>'{environment,poisonRegionCount}'='11'
 and value#>'{environment,protectedRegions}'='["教学楼","操场","办公室"]'::jsonb
 and value#>>'{environment,caveEveryPersonalEnds}'='3'
 and value#>>'{environment,caveApLoss}'='2'
 and value#>>'{environment,caveDamage}'='1'
 from ml_private.catalog where key='ruleset:web-v0.1.6'),false)
 and exists(select 1 from ml_private.catalog where key='stage3:content-v1' and jsonb_array_length(value->'allCards')=85 and jsonb_array_length(value->'characterIds')=16)
 and exists(select 1 from information_schema.columns where table_schema='ml_private' and table_name='rooms' and column_name='draft')
 and to_regprocedure('ml_private.stage3_play(jsonb,jsonb,double precision)') is not null
 and to_regprocedure('ml_private.stage3_create_draft(text,jsonb,double precision)') is not null
 and to_regprocedure('ml_private.stage3_complete_draft(ml_private.rooms,bigint)') is not null
 and to_regprocedure('ml_private.stage3_handle_task(jsonb,jsonb,double precision)') is not null
 and to_regprocedure('ml_private.cave_ending(jsonb,integer)') is not null as ready)
select jsonb_build_object('ok',true,'schemaVersion',2,'engineRevision',16,'ruleVersion','web-v0.1.6',
 'legacyRuleVersions',jsonb_build_array('web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4','web-v0.1.5'),
 'feedbackRulesReady',ready,'versionedDataReady',(select count(*)=6 from ml_private.catalog where key in ('ruleset:web-v0.1.1','ruleset:web-v0.1.2','ruleset:web-v0.1.3','ruleset:web-v0.1.4','ruleset:web-v0.1.5','ruleset:web-v0.1.6')),
 'locationDataReady',ready,'locationRulesReady',ready,'waterRulesReady',ready,'environmentRulesReady',ready,'classicPlayable',ready,'classicPatchReady',ready,
 'draftReady',ready,'characterSkillsReady',ready,'stage3Ready',ready,'classicRuleVersion','web-v0.1.6','engine','postgresql') from readiness $$;
` .replace('jsonb_object_length_placeholder',"(select count(*)=23 from jsonb_object_keys(value#>'{runtimeData,cards}'))");
// One numbered migration promotes both generated components. Default rooms and
// readiness change together; wrapping the whole file atomically is mandatory.
const body=`-- Stage three release: 16 roles, 23 definitions / 85 entities, authoritative draft.
-- Apply after 014 + 015. 013 can be absent: draft foundation is included here.
DO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<14 OR to_regprocedure('ml_private.stage3_content()') IS NULL THEN RAISE EXCEPTION 'Apply 014 and 015 before 016'; END IF; END $$;
`+engine+rooms+health;
const path='database/migrations/016_stage3_release.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==body)throw Error('Stage-three release SQL differs');}else await writeFile(path,body);
console.log('016: complete v0.1.6 engine, draft rooms and revision 16 readiness.');
