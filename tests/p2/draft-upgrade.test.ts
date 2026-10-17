import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const migration=await readFile('database/migrations/013_draft_foundation.sql','utf8');
const atomic=(sql:string)=>`DO $outer$ BEGIN EXECUTE $payload$${sql}$payload$; END $outer$;`;
it('013 is atomic/repeatable and preserves all four profiles, room state, credentials and active health',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;');for(const f of (await readdir('database/migrations')).filter(f=>/^\d{3}_/.test(f)&&Number(f.slice(0,3))<=12).sort())await db.exec(await readFile('database/migrations/'+f,'utf8'));
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$select 1000::bigint$$;');
  const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
  const identity={name:'选角迁移',token:'a'.repeat(64)},call=async(p:Record<string,unknown>)=>q('select public.ml_room($1::jsonb) v',[JSON.stringify(p)]);
  const first=await call({...identity,op:'create',requestId:'create'}),rooms=await db.query('select * from ml_private.rooms'),profiles=await db.query("select key,value from ml_private.catalog where key like 'ruleset:%' order by key"),health=await q('select public.ml_health() v');
  await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect(await q("select to_regprocedure('ml_private.create_draft(jsonb,double precision)') v")).toBeNull();
  await db.query(atomic(migration));await db.query(atomic(migration));expect(await db.query('select * from ml_private.rooms')).toEqual(rooms);expect(await db.query("select key,value from ml_private.catalog where key like 'ruleset:%' order by key")).toEqual(profiles);expect(await q('select public.ml_health() v')).toEqual(health);
  expect((await call({...identity,op:'create',requestId:'create'})).duplicate).toBe(true);expect((await call({...identity,op:'view',roomId:first.snapshot.roomId,epoch:first.snapshot.epoch})).ok).toBe(true);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query("select ml_private.create_draft('{}',0)")).rejects.toThrow(/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
},30000);
it('keeps the accepted classic migration bytes frozen while draft work proceeds',async()=>{
 expect(createHash('sha256').update(await readFile('database/migrations/012_classic_rules.sql')).digest('hex')).toBe('70f9968f124342340d88f03ccde9b7aab71ff853716b4594f856469a038dbea0');
});
