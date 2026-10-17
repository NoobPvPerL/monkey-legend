import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createGame} from '../../packages/game-core/src/index';
import {ACTIVE_RULE_VERSIONS} from '../../packages/game-data/src/index';

const migration=await readFile('database/migrations/010_versioned_catalog.sql','utf8');
const atomic=(body:string)=>`DO $outer$ BEGIN EXECUTE $payload$${body}$payload$; END $outer$;`;
async function previousDatabase(max:number){
 const db=new PGlite();await db.exec('create role anon; create role authenticated;');
 for(const file of (await readdir('database/migrations')).filter(f=>/^00\d_.*\.sql$/.test(f)&&Number(f.slice(0,3))<=max).sort())await db.exec(await readFile('database/migrations/'+file,'utf8'));
 return db;
}
it('010 is atomic and repeatable; all three saved rulesets and authenticated room identity survive upgrade',async()=>{
 const db=await previousDatabase(9);try{
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$ select 1000::bigint $$;');
  const one=async<T=any>(sql:string,values:unknown[]=[])=>((await db.query<{v:T}>(sql,values)).rows[0].v);
  const call=async(p:Record<string,unknown>)=>one('select public.ml_room($1::jsonb) v',[JSON.stringify(p)]);
  const people=Array.from({length:4},(_,i)=>({name:'版本升级'+i,token:String(i+1).repeat(64),epoch:1}));
  const first=(await call({...people[0],op:'create',requestId:'create'})).snapshot,roomId=first.roomId;
  for(const p of people.slice(1))expect((await call({...p,op:'join',code:first.code,requestId:'join'})).ok).toBe(true);
  for(const p of people){const s=(await call({...p,roomId,op:'view'})).snapshot;expect((await call({...p,roomId,op:'ready',requestId:'ready',ready:true,roomRevision:s.roomRevision})).ok).toBe(true);}
  const lobby=(await call({...people[0],roomId,op:'view'})).snapshot;
  const started=await call({...people[0],roomId,op:'start',requestId:'start',roomRevision:lobby.roomRevision});expect(started.snapshot.game.version).toBe('web-v0.1.3');
  const snapshot=await call({...people[0],roomId,op:'view'}),rows=await db.query('select * from ml_private.rooms where id=$1',[roomId]);
  const saved=[];
  for(const ruleVersion of ACTIVE_RULE_VERSIONS.filter(v=>['web-v0.1.1','web-v0.1.2','web-v0.1.3'].includes(v))){
   const s=createGame({mode:'ffa',seed:19,seats:[0,1,2,3],first:0,characters:['character-031','character-027','character-037','character-004'],dice:[6],ruleVersion},1000);
   const before=await one('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify({mode:'ffa',seed:19,seats:[0,1,2,3],first:0,characters:['character-031','character-027','character-037','character-004'],dice:[6],ruleVersion})]);expect(before).toEqual(s);
   const commands=[],results=[];let state=s;
   for(const [i,input] of [{type:'move'},{type:'step',path:['r1c2']},{type:'stop'},{type:'tick'}].entries()){
    const cmd={id:'upgrade-command-'+i,actor:0,revision:state.revision,...input},at=i===3?80000:1100+i;
    const result=await one('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(state),JSON.stringify(cmd),at]);expect(result.ok,result.error).toBe(true);
    commands.push({state,cmd,at});results.push(result);state=result.state;
   }
   saved.push({commands,results});
  }
  await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);
  expect((await one('select public.ml_health() v')).engineRevision).toBe(9);expect(await one("select count(*)::int v from ml_private.catalog where key like 'ruleset:%'")).toBe(0);
  await db.query(atomic(migration));await db.query(atomic(migration));
  expect(await db.query('select * from ml_private.rooms where id=$1',[roomId])).toEqual(rows);
  expect(await call({...people[0],roomId,op:'view'})).toEqual(snapshot);
  for(const {commands,results} of saved)for(let i=0;i<commands.length;i++){
   const {state,cmd,at}=commands[i];expect(await one('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(state),JSON.stringify(cmd),at])).toEqual(results[i]);
  }
  // Request receipts and original credentials are still usable.
  expect((await call({...people[0],roomId,op:'start',requestId:'start',roomRevision:lobby.roomRevision})).duplicate).toBe(true);
  const health=await one('select public.ml_health() v');expect(health).toMatchObject({engineRevision:10,ruleVersion:'web-v0.1.3',versionedDataReady:true,classicPlayable:false});expect(health.versionedDataReady).toBe(true);
  await db.exec('begin');await db.exec("delete from ml_private.catalog where key='ruleset:web-v0.1.4'");expect((await one('select public.ml_health() v')).versionedDataReady).toBe(false);await db.exec('rollback');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   for(const sql of ["select ml_private.version_catalog('web-v0.1.4')", "select ml_private.runtime_data('web-v0.1.3','cards')", "select ml_private.allocate_spawns('web-v0.1.4','[]','{}')", 'select * from ml_private.catalog'])await expect(db.query(sql)).rejects.toThrow(/permission denied/);
   expect((await one('select public.ml_health() v')).versionedDataReady).toBe(true);await db.exec('reset role');
  }
 }finally{await db.close();}
},30000);
it('010 rejects missing 009 rather than reporting a partial installation ready',async()=>{
 const db=await previousDatabase(8);try{
  await expect(db.query(atomic(migration))).rejects.toThrow(/009/);
  expect((await db.query<any>('select public.ml_health() v')).rows[0].v.engineRevision).toBe(8);
  expect((await db.query<any>("select count(*)::int n from ml_private.catalog where key like 'ruleset:%'")).rows[0].n).toBe(0);
 }finally{await db.close();}
},30000);
