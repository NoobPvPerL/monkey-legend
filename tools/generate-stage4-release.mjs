import {readFile,writeFile} from 'node:fs/promises';
const engine=(await readFile('database/engine/stage4-generated.sql','utf8')).replaceAll('\r\n','\n');
const rooms=(await readFile('database/engine/stage4-rooms-generated.sql','utf8')).replaceAll('\r\n','\n');
const health=`
create or replace function public.ml_health() returns jsonb language sql security definer set search_path=pg_catalog as $$
with readiness as (select coalesce((select
 value#>>'{manifest,status}'='playable'
 and jsonb_array_length(value#>'{runtimeData,allCards}')=191
 and (select count(*)=76 from jsonb_object_keys(value#>'{runtimeData,cards}'))
 and jsonb_array_length(value#>'{runtimeData,characterIds}')=16
 and value#>>'{characterTraits,character-004,faction}'='帝汶家族'
 and value#>>'{characterTraits,character-004,spawnRegion}'='操场'
 and value#>>'{environment,kind}'='classic-regions-v2'
 and value#>>'{environment,poisonRegionCount}'='11'
 and value#>'{environment,protectedRegions}'='["教学楼","操场","办公室"]'::jsonb
 and value#>>'{environment,caveEveryPersonalEnds}'='3'
 and value#>>'{environment,caveApLoss}'='2'
 and value#>>'{environment,caveDamage}'='1'
 from ml_private.catalog where key='ruleset:web-v0.1.7'),false)
 and exists(select 1 from ml_private.catalog where key='stage4:foundation-v1' and jsonb_array_length(value->'allCards')=191)
 and exists(select 1 from ml_private.catalog where key='stage4:capabilities-v1' and jsonb_array_length(value)=76)
 and exists(select 1 from information_schema.columns where table_schema='ml_private' and table_name='rooms' and column_name='draft')
 and to_regprocedure('ml_private.stage4_actions(jsonb,integer)') is not null
 and to_regprocedure('ml_private.stage4_combat_task(jsonb,jsonb,double precision)') is not null
 and to_regprocedure('ml_private.stage4_movement_task(jsonb,jsonb,double precision)') is not null
 and to_regprocedure('ml_private.stage4_equipment_task(jsonb,jsonb,double precision)') is not null
 and to_regprocedure('ml_private.stage4_equipment_skill(jsonb,jsonb,double precision)') is not null
 and to_regprocedure('ml_private.stage4_create_draft(text,jsonb,double precision)') is not null
 and to_regprocedure('ml_private.stage3_complete_draft(ml_private.rooms,bigint)') is not null
 and to_regprocedure('ml_private.stage4_reserve_interrupt(jsonb,jsonb)') is not null
 and to_regprocedure('ml_private.stage4_cost_quote(jsonb,integer,text,jsonb,integer,bigint)') is not null as ready)
select jsonb_build_object('ok',true,'schemaVersion',2,'engineRevision',18,'ruleVersion','web-v0.1.7',
 'legacyRuleVersions',jsonb_build_array('web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4','web-v0.1.5','web-v0.1.6'),
 'feedbackRulesReady',ready,'versionedDataReady',(select count(*)=7 from ml_private.catalog where key in ('ruleset:web-v0.1.1','ruleset:web-v0.1.2','ruleset:web-v0.1.3','ruleset:web-v0.1.4','ruleset:web-v0.1.5','ruleset:web-v0.1.6','ruleset:web-v0.1.7')),
 'locationDataReady',ready,'locationRulesReady',ready,'waterRulesReady',ready,'environmentRulesReady',ready,'classicPlayable',ready,'classicPatchReady',ready,
 'draftReady',ready,'characterSkillsReady',ready,'stage3Ready',ready,'stage4Ready',ready,'cardDefinitions',76,'cardInstances',191,'classicRuleVersion','web-v0.1.7','engine','postgresql') from readiness $$;
`;
const body=`-- Stage four release: 16 roles, 76 definitions / 191 entities, full equipment and authoritative draft.
-- Atomic owner migration; preserves all existing rooms, identities, receipts, profiles and draft versions.
DO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<16 OR to_regprocedure('ml_private.stage4_content()') IS NULL THEN RAISE EXCEPTION 'Apply 016 and 017 before 018'; END IF; END $$;
`+engine+rooms+health;
const path='database/migrations/018_stage4_release.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==body)throw Error('Stage-four release differs');}else await writeFile(path,body);
console.log('018: complete v0.1.7 engine, version-preserving draft rooms and revision18 readiness.');
