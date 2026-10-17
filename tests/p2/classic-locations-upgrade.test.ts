import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {databaseReady} from '../../packages/online/src/version';
const migration=await readFile('database/migrations/011_classic_locations.sql','utf8');
const atomic=(text:string)=>`DO $outer$ BEGIN EXECUTE $payload$${text}$payload$; END $outer$;`;
async function beforeStage2(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;');
 for(const f of (await readdir('database/migrations')).filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))<=10).sort())await db.exec(await readFile('database/migrations/'+f,'utf8'));
 return db;
}
it('011 upgrades lemon metadata and locations atomically, without changing old profiles, rooms or permissions',async()=>{
 const db=await beforeStage2();try{
  const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$select 1000::bigint$$;');
  const call=async(p:Record<string,unknown>)=>q('select public.ml_room($1::jsonb) v',[JSON.stringify(p)]);
  const identity={name:'地点升级',token:'a'.repeat(64)},first=await call({...identity,op:'create',requestId:'create'}),roomId=first.snapshot.roomId;
  const rooms=await db.query('select * from ml_private.rooms'),old=await db.query("select key,value from ml_private.catalog where key in ('ruleset:web-v0.1.1','ruleset:web-v0.1.2','ruleset:web-v0.1.3') order by key");
  expect((await q("select ml_private.version_catalog('web-v0.1.4') v")).manifest.spawnConflicts).toEqual(['character-004']);
  await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await q('select public.ml_health() v')).engineRevision).toBe(10);
  await db.query(atomic(migration));await db.query(atomic(migration));
  expect(await db.query('select * from ml_private.rooms')).toEqual(rooms);expect(await db.query("select key,value from ml_private.catalog where key in ('ruleset:web-v0.1.1','ruleset:web-v0.1.2','ruleset:web-v0.1.3') order by key")).toEqual(old);
  const view=await call({...identity,epoch:first.snapshot.epoch,roomId,op:'view'});expect(view.ok,view.error).toBe(true);expect(view.snapshot.memberId).toBe(first.snapshot.memberId);expect((await call({...identity,op:'create',requestId:'create'})).duplicate).toBe(true);
  const health=await q('select public.ml_health() v');expect(health).toMatchObject({engineRevision:11,ruleVersion:'web-v0.1.3',locationDataReady:true,classicPlayable:false,waterRulesReady:false,environmentRulesReady:false});expect(health.locationDataReady).toBe(true);expect(databaseReady(health)).toBe(false);
  const profile=await q("select ml_private.version_catalog('web-v0.1.4') v");expect(profile.manifest.spawnConflicts).toEqual([]);expect(profile.characterTraits['character-004']).toMatchObject({faction:'帝汶家族',spawnRegion:'操场',waterNative:true});
  await db.exec('begin');await db.exec("update ml_private.catalog set value=value-'characterTraits' where key='ruleset:web-v0.1.4'");expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);await db.exec('rollback');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   for(const sql of ["select ml_private.location_basic_cost('web-v0.1.4','r2c4')", "select ml_private.location_teleport('{}',0,'ship','r1c1')", "select ml_private.allocate_spawns('web-v0.1.4','[]','{}')"])await expect(db.query(sql)).rejects.toThrow(/permission denied/);
   expect((await q('select public.ml_health() v')).locationDataReady).toBe(true);await db.exec('reset role');
  }
 }finally{await db.close();}
},30000);
it('010 stays frozen after the new approval; stage2 does not rewrite the stage1 migration',async()=>{
 const report=JSON.parse(await readFile('artifacts/p2-stage1/summary.json','utf8'));
 expect(createHash('sha256').update(await readFile('database/migrations/010_versioned_catalog.sql')).digest('hex')).toBe(report.migrationSha256);
});
