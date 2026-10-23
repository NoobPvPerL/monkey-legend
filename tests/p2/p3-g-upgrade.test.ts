import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import {createStage3Draft,dispatchDraft} from '../../packages/game-core/src/draft';
import {databaseReady as readyForRequirement} from '../../packages/online/src/version';
const databaseReady=(health:unknown)=>readyForRequirement(health,{ruleVersion:'web-v0.1.18',engineRevision:29,stage4:true});
const db=await database(undefined,28);afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
const atomic=(sql:string)=>`DO $g_outer$ BEGIN EXECUTE $g_body$${sql}$g_body$;END $g_outer$;`;
const rng=(seed:number)=>({seed,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false});
const people=Array.from({length:4},(_,a)=>({name:'G升级'+a,token:String(a+1).repeat(64),epoch:1}));
const call=(a:number,op:string,extra={})=>q('select public.ml_room($1::jsonb) v',[JSON.stringify({...people[a],op,...extra})]);
async function room(prefix:string){
 const first=await call(0,'create',{requestId:prefix+'create'});expect(first.ok,first.error).toBe(true);const id=first.snapshot.roomId;
 for(let a=1;a<4;a++)expect((await call(a,'join',{requestId:prefix+'join',code:first.snapshot.code})).ok).toBe(true);
 for(let a=0;a<4;a++){const s=(await call(a,'view',{roomId:id})).snapshot;expect((await call(a,'ready',{roomId:id,requestId:prefix+'ready',roomRevision:s.roomRevision,ready:true})).ok).toBe(true);}
 const s=(await call(0,'view',{roomId:id})).snapshot,r=await call(0,'start',{roomId:id,requestId:prefix+'start',roomRevision:s.roomRevision});expect(r.ok,r.error).toBe(true);return {id,matchId:r.snapshot.matchId};
}
it('028→029 is atomic/idempotent and preserves the saved room, draft and all predecessor profiles',async()=>{
 await db.exec("create or replace function ml_private.now_ms() returns bigint language sql as 'select 1000::bigint';");
 const old=await room('g-old-'),before=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[old.id]),profiles=await db.query('select key,value from ml_private.catalog order by key');expect(before.draft.catalogVersion).toBe('web-v0.1.17');
 const sql=await readFile('database/migrations/029_p3_batch_g.sql','utf8');expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);
 await expect(db.query(atomic(sql+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await q('select public.ml_health() v')).engineRevision).toBe(28);expect(await q("select count(*)::int v from ml_private.catalog where key='ruleset:web-v0.1.18'")).toBe(0);
 await db.query(atomic(sql));await db.query(atomic(sql));expect(await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[old.id])).toEqual(before);expect(await db.query("select key,value from ml_private.catalog where key<>'ruleset:web-v0.1.18' order by key")).toEqual(profiles);
 const h=await q('select public.ml_health() v');expect(h).toMatchObject({engineRevision:29,ruleVersion:'web-v0.1.18',characterDefinitions:43,batchGReady:true});expect(databaseReady(h)).toBe(true);
 for(const flag of ['batchGReady','batchFReady','batchEReady','batchDReady','batchCReady','yinghaoRulesReady','p3CharactersReady','potatoRulesReady','versionedDataReady'])expect(databaseReady({...h,[flag]:false}),flag).toBe(false);
 for(let i=0;i<4;i++){const d=await q('select draft v from ml_private.rooms where id=$1',[old.id]);const r=await call(d.offer.actor,'draft-pick',{roomId:old.id,requestId:'g-old-pick-'+i,matchId:old.matchId,revision:d.revision,offer:d.offer.id,character:d.offer.candidates[0]});expect(r.ok,r.error).toBe(true);}
 expect((await call(0,'view',{roomId:old.id})).snapshot.game.version).toBe('web-v0.1.17');
 // New rooms must use the normal public path, with no G profile/state injection.
 people.forEach((p,a)=>Object.assign(p,{name:'G新局'+a,token:String(a+5).repeat(64)}));
 const fresh=await room('g-new-');for(let i=0;i<4;i++){const d=await q('select draft v from ml_private.rooms where id=$1',[fresh.id]);expect(d.catalogVersion).toBe('web-v0.1.18');const r=await call(d.offer.actor,'draft-pick',{roomId:fresh.id,requestId:'g-new-pick-'+i,matchId:fresh.matchId,revision:d.revision,offer:d.offer.id,character:d.offer.candidates[0]});expect(r.ok,r.error).toBe(true);}
 const saved=await q('select game v from ml_private.rooms where id=$1',[fresh.id]);expect(saved.version).toBe('web-v0.1.18');expect(saved.stage3.g).toBeDefined();
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query('select ml_private.p3g_initial_state()')).rejects.toThrow(/permission denied/);await db.exec('reset role');}
},60000);
it('all17 saved rule versions execute unchanged with029 installed',async()=>{
 for(let n=1;n<=17;n++){const version=('web-v0.1.'+n) as ReturnType<typeof createGame>['version'],s=createGame({mode:'ffa',ruleVersion:version,seed:42,seats:[0,1,2,3],first:0},1000),cmd={id:'g-old',revision:s.revision,actor:s.active,type:'tick' as const},ts=dispatch(s,cmd,61000),sql=await q('select ml_private.dispatch($1::jsonb,$2::jsonb,61000) v',[JSON.stringify(s),JSON.stringify(cmd)]);expect(sql).toEqual(ts);expect(sql.state.version).toBe(version);expect(sql.state.stage3?.g).toBeUndefined();}
});
it('G normal draft generation, capacity filtering and new-game factories match in FFA/team',async()=>{
 for(const mode of ['ffa','team'] as const)for(const seed of [1,42,917]){
  let s=createStage3Draft(mode,rng(seed),1000,'web-v0.1.18');expect(await q('select ml_private.stage4_create_draft($1,$2::jsonb,1000) v',[mode,JSON.stringify(rng(seed))])).toEqual(s);
  for(let i=0;i<4;i++){const cmd={id:`g-pick-${i}`,revision:s.revision,actor:s.offer!.actor,type:'pick' as const,offer:s.offer!.id,character:s.offer!.candidates[0]},ts=dispatchDraft(s,cmd,1001+i);expect(ts.ok).toBe(true);expect(await q('select ml_private.dispatch_draft($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),1001+i])).toEqual(ts);s=ts.state;}
  const setup={mode,seed,seats:[0,1,2,3],ruleVersion:'web-v0.1.18' as const,characters:s.selected as any,first:0};expect(await q('select ml_private.create_game($1::jsonb,2000) v',[JSON.stringify(setup)])).toEqual(createGame(setup,2000));
 }
 const over={mode:'ffa' as const,seed:42,seats:[0,1,2,3],ruleVersion:'web-v0.1.18' as const,characters:['character-004','character-024','character-038','character-009'] as any};expect(()=>createGame(over,1000)).toThrow('出生地区空格不足');await expect(q('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(over)])).rejects.toThrow();
},60000);
it('health refuses a partially installed G entry point or malformed G profile',async()=>{
 await db.exec("begin;drop function ml_private.p3g_initial_core(jsonb,double precision);");try{expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);}finally{await db.exec('rollback;');}
 await db.exec("begin;update ml_private.catalog set value=jsonb_set(value,'{p3,batchG}','false') where key='ruleset:web-v0.1.18';");try{expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);}finally{await db.exec('rollback;');}
 expect(databaseReady(await q('select public.ml_health() v'))).toBe(true);
});
