import {expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createGame} from '../../packages/game-core/src/index';
import {databaseReady} from '../../packages/online/src/version';
import {commandSchema} from '../../packages/online/src/protocol';
const migration=await readFile('database/migrations/012_classic_rules.sql','utf8');
const atomic=(sql:string)=>`DO $outer$ BEGIN EXECUTE $payload$${sql}$payload$; END $outer$;`;
async function previous(){const db=new PGlite();await db.exec('create role anon;create role authenticated;');for(const f of (await readdir('database/migrations')).filter(f=>/^\d{3}_.*\.sql$/.test(f)&&Number(f.slice(0,3))<=11).sort())await db.exec(await readFile('database/migrations/'+f,'utf8'));return db;}
it('012 rollback/repeat preserves legacy games, profiles, credentials and receipts; only subsequent new matches use classic',async()=>{
 const db=await previous();try{
  const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
  await db.exec('create or replace function ml_private.now_ms() returns bigint language sql as $$select 1000::bigint$$;');
  const call=async(p:Record<string,unknown>)=>{await db.exec('set role anon');try{return await q('select public.ml_room($1::jsonb) v',[JSON.stringify(p)]);}finally{await db.exec('reset role');}};
  const ps=Array.from({length:4},(_,i)=>({name:'经典升级'+i,token:String(i+1).repeat(64),roomId:'',epoch:0}));
  let v=(await call({...ps[0],op:'create',requestId:'create'})).snapshot;ps[0].roomId=v.roomId;ps[0].epoch=v.epoch;
  for(const p of ps.slice(1)){const joined=await call({...p,op:'join',code:v.code,requestId:'join'});Object.assign(p,{roomId:joined.snapshot.roomId,epoch:joined.snapshot.epoch});}
  const ready=async()=>{for(const p of ps){v=(await call({...p,op:'view'})).snapshot;expect((await call({...p,op:'ready',requestId:'ready-'+v.roomRevision,roomRevision:v.roomRevision,ready:true})).ok).toBe(true);}return (await call({...ps[0],op:'view'})).snapshot;};
  v=await ready();const oldStart={...ps[0],op:'start',requestId:'start-old',roomRevision:v.roomRevision};v=(await call(oldStart)).snapshot;expect(v.game.version).toBe('web-v0.1.3');
  const rows=await db.query('select * from ml_private.rooms'),profiles=await db.query("select key,value from ml_private.catalog where key in ('ruleset:web-v0.1.1','ruleset:web-v0.1.2','ruleset:web-v0.1.3') order by key");
  await expect(db.query(atomic(migration+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await q('select public.ml_health() v')).engineRevision).toBe(11);
  await db.query(atomic(migration));await db.query(atomic(migration));expect(await db.query('select * from ml_private.rooms')).toEqual(rows);expect(await db.query("select key,value from ml_private.catalog where key in ('ruleset:web-v0.1.1','ruleset:web-v0.1.2','ruleset:web-v0.1.3') order by key")).toEqual(profiles);
  expect((await call({...ps[0],op:'view'})).snapshot).toEqual(v);expect((await call(oldStart)).duplicate).toBe(true);expect((await q('select public.ml_health() v')).classicPlayable).toBe(true);expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);
  await db.exec('begin');await db.exec("update ml_private.catalog set value=value-'characterTraits' where key='ruleset:web-v0.1.4'");expect((await q('select public.ml_health() v')).classicPlayable).toBe(false);await db.exec('rollback');
  // End the synthetic legacy game, then verify same room/members start a new classic game.
  await db.query("update ml_private.rooms set status='finished',game=jsonb_set(game,'{phase}','\"over\"') where id=$1",[v.roomId]);
  v=await ready();const started=await call({...ps[0],op:'start',requestId:'start-classic',roomRevision:v.roomRevision});expect(started.ok,started.error).toBe(true);expect(started.snapshot.game.version).toBe('web-v0.1.4');expect(started.snapshot.roomId).toBe(ps[0].roomId);expect(started.snapshot.members.map((p:any)=>p.name)).toEqual(ps.map(p=>p.name));
  // Exercise real authenticated intent/receipt path at an arrival choice.
  const fixture=createGame({mode:'ffa',ruleVersion:'web-v0.1.4',seed:42,seats:[0,1,2,3],characters:['character-031','character-004','character-027','character-037'],first:0},1000);fixture.players[0].cell='r1c8';fixture.players[1].cell='r2c4';fixture.players[2].cell='r1c3';fixture.players[3].cell='r2c8';
  await db.query('update ml_private.rooms set game=$2::jsonb where id=$1',[ps[0].roomId,JSON.stringify(fixture)]);
  const request={...ps[0],op:'game',requestId:'ship-once',matchId:started.snapshot.matchId,revision:0,intent:{type:'location',kind:'ship',cell:'r4c6'}};
  expect(commandSchema.safeParse({op:request.op,requestId:request.requestId,matchId:request.matchId,revision:request.revision,intent:request.intent}).success).toBe(true);
  const moved=await call(request);expect(moved.ok,moved.error).toBe(true);expect(moved.snapshot.game.choice.kind).toBe('water-discard');expect((await call(request)).duplicate).toBe(true);
  const resumed=await call({...ps[0],op:'resume'});expect(resumed.ok).toBe(true);expect(resumed.snapshot.game.choice).toEqual(moved.snapshot.game.choice);ps[0].epoch=resumed.snapshot.epoch;
  const choice=resumed.snapshot.game.choice;const discarded=await call({...ps[0],op:'game',requestId:'water-once',matchId:started.snapshot.matchId,revision:1,intent:{type:'choose',choice:choice.id,cards:[fixture.players[0].hand[0]]}});expect(discarded.ok,discarded.error).toBe(true);expect(discarded.snapshot.game.choice).toBeNull();expect(discarded.snapshot.game.players[0].handCount).toBe(3);
  const forbidden=await call({...ps[0],op:'game',requestId:'fake-state',matchId:started.snapshot.matchId,revision:2,intent:{type:'location',kind:'ship',cell:'r1c1',ap:999}});expect(forbidden.ok).toBe(false);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const sql of ["select ml_private.classic_refresh('{}')","select ml_private.classic_environment('{}')","select ml_private.classic_walk('{}','[]',0)","select * from ml_private.catalog"])await expect(db.query(sql)).rejects.toThrow(/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
},30000);
it('the new engine never rewrites the frozen stage-one and location migration payloads',async()=>{
 const expected={'010_versioned_catalog.sql':'59fba1a3a58d36c9e9682b90abf32c44f43c9ec5004f6c9498ee9e0acb9c1a21','011_classic_locations.sql':'64f7b4efccaf3ea37fd0732faf1848fdc7d372f3f301f345c114135208290ae7'};
 for(const [file,hash] of Object.entries(expected))expect(createHash('sha256').update(await readFile('database/migrations/'+file)).digest('hex')).toBe(hash);
});
