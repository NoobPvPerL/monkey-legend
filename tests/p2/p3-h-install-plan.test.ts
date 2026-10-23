import {afterAll,expect,it} from 'vitest';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {database} from './database';
import {databaseReady} from '../../packages/online/src/version';
import {databasePackagePlan,DATABASE_UPGRADE_BASES} from '../../tools/database-package-plan.mjs';

const migrations=await Promise.all((await readdir('database/migrations')).filter(file=>file.endsWith('.sql')).map(async file=>({file,body:await readFile('database/migrations/'+file,'utf8')})));
const fresh=databasePackagePlan('0.3.8-p3.9',migrations),upgrade=databasePackagePlan('0.3.8-p3.9',migrations,true);
const report:{scope:string;cases:Record<string,unknown>[]}={scope:'Pure package SQL assembly tested through isolated PostgreSQL prepared queries. No delivery folder/archive created, no production connection.',cases:[]};
afterAll(async()=>{await writeFile('artifacts/p3-batch-h/install-plan-matrix.json',JSON.stringify(report,null,2)+'\n');});
const sha=(sql:string)=>createHash('sha256').update(sql).digest('hex');
async function health(db:PGlite){return (await db.query<{v:any}>('select public.ml_health() v')).rows[0].v;}
async function verify(db:PGlite){expect(databaseReady(await health(db))).toBe(true);for(const result of await db.exec(await readFile('database/verify.sql','utf8')))for(const row of result.rows)for(const [key,value] of Object.entries(row))if(key.endsWith('_ready'))expect(value,key).toBe(true);}
function fault(sql:string){const text=sql.replace(/END (\$ml_outer_[0-9a-f]+\$);\n$/,'PERFORM 1/0; END $1;\n');expect(text).not.toBe(sql);return text;}
async function savedRoom(db:PGlite,base:number){
 const people=Array.from({length:4},(_,a)=>({name:`升级矩阵${base}-${a}`,token:String(a+1).repeat(64),epoch:1}));
 const call=async(a:number,op:string,extra={})=>(await db.query<{v:any}>('select public.ml_room($1::jsonb) v',[JSON.stringify({...people[a],op,...extra})])).rows[0].v;
 const first=await call(0,'create',{requestId:'create'});expect(first.ok,first.error).toBe(true);const id=first.snapshot.roomId;
 for(let a=1;a<4;a++)expect((await call(a,'join',{requestId:'join',code:first.snapshot.code})).ok).toBe(true);
 for(let a=0;a<4;a++){const view=(await call(a,'view',{roomId:id})).snapshot;expect((await call(a,'ready',{roomId:id,requestId:'ready',roomRevision:view.roomRevision,ready:true})).ok).toBe(true);}
 const view=(await call(0,'view',{roomId:id})).snapshot;expect((await call(0,'start',{roomId:id,requestId:'start',roomRevision:view.roomRevision})).ok).toBe(true);return id;
}
for(const base of DATABASE_UPGRADE_BASES)it(`actual one-statement package plan ${base}→030 rolls back, repeats and preserves saved room/draft/identities/receipts/catalogs`,async()=>{
 const db=await database(undefined,base);try{
  const id=await savedRoom(db,base),snapshot=async()=>({room:(await db.query('select to_jsonb(r) v from ml_private.rooms r where id=$1',[id])).rows,intakes:(await db.query('select * from ml_private.intakes order by token_hash,request_id')).rows,receipts:(await db.query('select * from ml_private.receipts order by room_id,member_id,request_id')).rows});
  const before=await snapshot(),oldHealth=await health(db),catalogs=(await db.query<{key:string;value:unknown}>('select key,value from ml_private.catalog order by key')).rows;
  const name=`UPGRADE-FROM-${String(base).padStart(3,'0')}-ONE-STATEMENT.sql`,sql=upgrade.files[name];expect(sql).toBeTruthy();expect(databaseReady(oldHealth)).toBe(false);
  await expect(db.query(fault(sql))).rejects.toThrow(/division by zero/);expect(await health(db)).toEqual(oldHealth);expect(await snapshot()).toEqual(before);expect((await db.query('select key,value from ml_private.catalog order by key')).rows).toEqual(catalogs);
  await db.query(sql);await verify(db);expect(await snapshot()).toEqual(before);expect((await db.query('select key,value from ml_private.catalog where key=any($1::text[]) order by key',[catalogs.map(c=>c.key)])).rows).toEqual(catalogs);
  await db.query(sql);await verify(db);expect(await snapshot()).toEqual(before);
  report.cases.push({base,target:30,file:name,sha256:sha(sql),rollback:true,repeated:true,savedRowsUnchanged:true,oldCatalogsUnchanged:true,ready:true});
 }finally{await db.close();}
},60000);

it('schema1 005—030 single-statement plan upgrades atomically and repeats without reinitialization',async()=>{
 const db=await database(undefined,4);try{
  const id=await savedRoom(db,4),snapshot=async()=>({room:(await db.query('select id,code,status,mode,host,members,revision,match_id,game,empty_since,created_at,updated_at from ml_private.rooms where id=$1',[id])).rows,intakes:(await db.query('select * from ml_private.intakes order by token_hash,request_id')).rows,receipts:(await db.query('select * from ml_private.receipts order by room_id,member_id,request_id')).rows}),rows=await snapshot();
  const before=await health(db),sql=upgrade.files['install-one-statement.sql'];expect(before.schemaVersion).toBe(1);expect(upgrade.migrations.every(m=>Number(m.file.slice(0,3))>=5)).toBe(true);
  await expect(db.query(fault(sql))).rejects.toThrow(/division by zero/);expect(await health(db)).toEqual(before);expect(await snapshot()).toEqual(rows);await db.query(sql);await verify(db);expect(await snapshot()).toEqual(rows);await db.query(sql);await verify(db);expect(await snapshot()).toEqual(rows);
  report.cases.push({base:'schema1',target:30,file:'install-one-statement.sql',sha256:sha(sql),rollback:true,repeated:true,savedRowsUnchanged:true,ready:true});
 }finally{await db.close();}
},60000);

it('incomplete or duplicate migration revisions are rejected before any delivery directory can be created',()=>{
 for(const mode of [false,true]){
  expect(()=>databasePackagePlan('0.3.8-p3.9',migrations.filter(m=>!m.file.startsWith('020_')),mode)).toThrow(/Missing or duplicate/);
  expect(()=>databasePackagePlan('0.3.8-p3.9',[...migrations,{file:'020_duplicate.sql',body:'select 1;'}],mode)).toThrow(/Missing or duplicate/);
 }
 report.cases.push({invalidMigrationInputsRejected:true});
});

for(const file of ['install-one-statement.sql','install.sql'])it(`fresh000—030 ${file} plan reaches full H readiness`,async()=>{
 const db=new PGlite();try{await db.waitReady;await db.exec('create role anon;create role authenticated;');if(file==='install.sql')await db.exec(fresh.files[file]);else await db.query(fresh.files[file]);await verify(db);report.cases.push({base:'empty',target:30,file,sha256:sha(fresh.files[file]),ready:true});}finally{await db.close();}
},60000);

it('upgrade minimum-baseline guard rejects a stale database before installing successor objects',async()=>{
 const db=await database(undefined,17);try{const before=await health(db);await expect(db.query(upgrade.files['UPGRADE-FROM-018-ONE-STATEMENT.sql'])).rejects.toThrow(/Expected complete revision 18 or later/);expect(await health(db)).toEqual(before);expect((await db.query("select count(*)::int v from ml_private.catalog where key='ruleset:web-v0.1.19'")).rows[0]).toEqual({v:0});report.cases.push({base:17,rejectedPlan:'from018',unchanged:true});}finally{await db.close();}
},60000);
