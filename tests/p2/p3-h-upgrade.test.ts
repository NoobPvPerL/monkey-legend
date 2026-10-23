import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame,dispatch,validateState} from '../../packages/game-core/src/index';
import {createDraft,createStage3Draft,dispatchDraft,validateDraft} from '../../packages/game-core/src/draft';
import {runtimeForVersion,sourceCatalogForVersion} from '../../packages/game-data/src/index';
import {databaseReady} from '../../packages/online/src/version';
import type {Setup,GameState,Command} from '../../packages/game-core/src/types';
const db=await database(undefined,29);afterAll(()=>db.close());
const q=async<T=any>(sql:string,args:unknown[]=[])=>((await db.query<{v:T}>(sql,args)).rows[0].v);
const atomic=(sql:string)=>`DO $h_outer$ BEGIN EXECUTE $h_body$${sql}$h_body$;END $h_outer$;`;
const rng=(seed:number)=>({seed,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false});
let rpcRoom:{id:string;matchId:string};
let people=Array.from({length:4},(_,a)=>({name:'H旧玩家'+a,token:String(a+1).repeat(64),epoch:1}));
const call=(a:number,op:string,extra={})=>q('select public.ml_room($1::jsonb) v',[JSON.stringify({...people[a],op,...extra})]);
async function room(prefix:string){
 const first=await call(0,'create',{requestId:prefix+'create'});expect(first.ok,first.error).toBe(true);const id=first.snapshot.roomId;
 for(let a=1;a<4;a++)expect((await call(a,'join',{requestId:prefix+'join',code:first.snapshot.code})).ok).toBe(true);
 for(let a=0;a<4;a++){const s=(await call(a,'view',{roomId:id})).snapshot;expect((await call(a,'ready',{roomId:id,requestId:prefix+'ready',roomRevision:s.roomRevision,ready:true})).ok).toBe(true);}
 const s=(await call(0,'view',{roomId:id})).snapshot,r=await call(0,'start',{roomId:id,requestId:prefix+'start',roomRevision:s.roomRevision});expect(r.ok,r.error).toBe(true);return {id,matchId:r.snapshot.matchId};
}

it('029→030 rolls back atomically, installs repeatedly, preserves the saved v18 room/draft/receipts and all predecessor catalogs',async()=>{
 await db.exec("create or replace function ml_private.now_ms() returns bigint language sql as 'select 1000::bigint';");
 const old=await room('h-old-'),before=await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[old.id]),profiles=await db.query('select key,value from ml_private.catalog order by key'),intakes=await db.query('select * from ml_private.intakes order by token_hash,request_id');
 expect(before.draft.catalogVersion).toBe('web-v0.1.18');expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);
 const sql=await readFile('database/migrations/030_p3_batch_h.sql','utf8');
 await expect(db.query(atomic(sql+'\nselect 1/0;'))).rejects.toThrow(/division by zero/);expect((await q('select public.ml_health() v')).engineRevision).toBe(29);expect(await q("select count(*)::int v from ml_private.catalog where key='ruleset:web-v0.1.19'")).toBe(0);
 await db.query(atomic(sql));await db.query(atomic(sql));
 expect(await q('select to_jsonb(r) v from ml_private.rooms r where id=$1',[old.id])).toEqual(before);expect(await db.query('select * from ml_private.intakes order by token_hash,request_id')).toEqual(intakes);expect(await db.query("select key,value from ml_private.catalog where key<>'ruleset:web-v0.1.19' order by key")).toEqual(profiles);
 const health=await q('select public.ml_health() v');expect(health).toMatchObject({engineRevision:30,ruleVersion:'web-v0.1.19',characterDefinitions:52,batchHReady:true,batchGReady:true});expect(databaseReady(health)).toBe(true);
 const verification=await db.exec(await readFile('database/verify.sql','utf8'));for(const result of verification)for(const row of result.rows)for(const [key,value] of Object.entries(row))if(key.endsWith('_ready'))expect(value,key).toBe(true);
 for(const flag of ['batchHReady','batchGReady','batchFReady','batchEReady','batchDReady','batchCReady','potatoRulesReady','p3CharactersReady','yinghaoRulesReady'])expect(databaseReady({...health,[flag]:false}),flag).toBe(false);
 for(let i=0;i<4;i++){const d=await q('select draft v from ml_private.rooms where id=$1',[old.id]);const r=await call(d.offer.actor,'draft-pick',{roomId:old.id,requestId:'h-old-pick-'+i,matchId:old.matchId,revision:d.revision,offer:d.offer.id,character:d.offer.candidates[0]});expect(r.ok,r.error).toBe(true);}
 expect((await call(0,'view',{roomId:old.id})).snapshot.game.version).toBe('web-v0.1.18');
},60000);

for(const mode of ['ffa','team'] as const)for(const seed of [1,42,917])it(`normal H ${mode} draft/new-game parity seed${seed}`,async()=>{
 let s=createStage3Draft(mode,rng(seed),1000,'web-v0.1.19');expect(await q('select ml_private.stage4_create_draft($1,$2::jsonb,1000) v',[mode,JSON.stringify(rng(seed))])).toEqual(s);
 for(let i=0;i<4;i++){const cmd={id:`h-pick-${i}`,revision:s.revision,actor:s.offer!.actor,type:'pick' as const,offer:s.offer!.id,character:s.offer!.candidates[0]},ts=dispatchDraft(s,cmd,1001+i);expect(ts.ok,ts.error).toBe(true);expect(await q('select ml_private.dispatch_draft($1::jsonb,$2::jsonb,$3::double precision) v',[JSON.stringify(s),JSON.stringify(cmd),1001+i])).toEqual(ts);s=JSON.parse(JSON.stringify(ts.state));}
 const setup:Setup={mode,seed,seats:[0,1,2,3],ruleVersion:'web-v0.1.19',characters:s.selected as Setup['characters'],first:0};const ts=createGame(setup,2000);expect(await q('select ml_private.create_game($1::jsonb,2000) v',[JSON.stringify(setup)])).toEqual(ts);validateState(ts);
});

for(const id of ['001','011','015','030','034','035','039','041','050'])it(`ordinary H factory fully initializes character-${id}, including resumable birth`,async()=>{
 const setup:Setup={mode:'ffa',seed:42,seats:[0,1,2,3],first:0,ruleVersion:'web-v0.1.19',characters:[`character-${id}`,'character-048','character-025','character-031'] as Setup['characters']};let s=createGame(setup,1000);expect(await q('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).toEqual(s);expect(s.stage3?.h).toBeDefined();
 if(id==='035'){
  expect(s.choice?.kind).toBe('h-birth');expect(s.players.every(p=>p.hand.length===0)).toBe(true);expect(s.players[0].cell).toBe('');s=JSON.parse(JSON.stringify(s));
  const cmd:Command={id:'h-born',revision:s.revision,actor:0,type:'choose',choice:s.choice!.id,cell:s.choice!.cells![0]},ts=dispatch(s,cmd,1001);expect(ts.ok,ts.error).toBe(true);expect(await q('select ml_private.dispatch($1::jsonb,$2::jsonb,1001) v',[JSON.stringify(s),JSON.stringify(cmd)])).toEqual(ts);expect(ts.state.players.every(p=>p.hand.length===4)).toBe(true);
 }
});

it('all nine H roles remain selectable;035 bypasses fixed birth capacity while041 keeps it',async()=>{
 const all=runtimeForVersion('web-v0.1.19').characterIds;
 for(const id of ['001','011','015','030','034','035','039','041','050']){
  const selected=`character-${id}`,fill=all.filter(x=>x!==selected&&x!=='character-035').slice(0,14),teams=['S1','S2','S3','S4'];
  const pools=Object.fromEntries(teams.map((t,a)=>[t,a===0?[selected,...fill.slice(0,2)]:[...all]]));
  const setup={mode:'ffa' as const,catalogVersion:'web-v0.1.19' as const,order:[0,1,2,3],teams,pools,random:rng(42)};
  const d=createDraft(setup,1000);expect(d.offer!.candidates).toContain(selected);expect(await q('select ml_private.create_draft($1::jsonb,1000) v',[JSON.stringify(setup)])).toEqual(d);
 }
 const d=createStage3Draft('ffa',rng(42),1000,'web-v0.1.19'),source=sourceCatalogForVersion('web-v0.1.19').characters;
 const island=all.filter(id=>source[id].spawnRegion==='帝汶岛'&&id!=='character-041').slice(0,4);expect(island).toHaveLength(4);
 // Inspect the helper at full regional capacity, independently of turn completion.
 const full={...d,selected:island};expect(await q('select ml_private.p3d_spawn_pool($1::jsonb,$2::jsonb) v',[JSON.stringify(full),JSON.stringify(['character-041','character-035'])])).toEqual(['character-035']);
 expect(()=>createGame({mode:'ffa',ruleVersion:'web-v0.1.19',seed:42,seats:[0,1,2,3],characters:['character-004','character-024','character-038','character-050']},1000)).toThrow('出生地区空格不足');
});

it('all eighteen valid predecessor saved games still execute their stored version under030',async()=>{
 for(let n=1;n<=18;n++){
  const version=`web-v0.1.${n}` as GameState['version'],s=createGame({mode:'ffa',ruleVersion:version,seed:42,seats:[0,1,2,3],first:0},1000),cmd:Command={id:'h-old-tick',revision:s.revision,actor:s.active,type:'tick'},ts=dispatch(s,cmd,1001);
  expect(await q('select ml_private.dispatch($1::jsonb,$2::jsonb,1001) v',[JSON.stringify(s),JSON.stringify(cmd)])).toEqual(ts);expect(ts.state.version).toBe(version);expect(ts.state.stage3?.h).toBeUndefined();
 }
});

it('normal public room selection uses H without a test profile or state injection',async()=>{
 people=Array.from({length:4},(_,a)=>({name:'H新玩家'+a,token:String(a+5).repeat(64),epoch:1}));
 const fresh=await room('h-new-');rpcRoom=fresh;for(let i=0;i<4;i++){const d=await q('select draft v from ml_private.rooms where id=$1',[fresh.id]);expect(d.catalogVersion).toBe('web-v0.1.19');const r=await call(d.offer.actor,'draft-pick',{roomId:fresh.id,requestId:'h-new-pick-'+i,matchId:fresh.matchId,revision:d.revision,offer:d.offer.id,character:d.offer.candidates[0]});expect(r.ok,r.error).toBe(true);}
 const saved=await q('select game v from ml_private.rooms where id=$1',[fresh.id]);expect(saved.version).toBe('web-v0.1.19');expect(saved.stage3.h).toBeDefined();
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query('select ml_private.p3h_initial_state()')).rejects.toThrow(/permission denied/);await db.exec('reset role');}
},60000);

it('H readiness rejects a missing birth function or a malformed H profile',async()=>{
 await db.exec('begin;drop function ml_private.p3h_birth_begin(jsonb,double precision);');try{expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);}finally{await db.exec('rollback;');}
 await db.exec("begin;update ml_private.catalog set value=jsonb_set(value,'{p3,batchH}','false') where key='ruleset:web-v0.1.19';");try{expect(databaseReady(await q('select public.ml_health() v'))).toBe(false);}finally{await db.exec('rollback;');}
 expect(databaseReady(await q('select public.ml_health() v'))).toBe(true);
});

it('a conflicting private/candidate v19 catalog is rejected instead of rewriting saved rules',async()=>{
 const sql=await readFile('database/migrations/030_p3_batch_h.sql','utf8');await db.exec("begin;update ml_private.catalog set value=jsonb_set(value,'{p3,batchH}','false') where key='ruleset:web-v0.1.19';");
 try{await expect(db.query(atomic(sql))).rejects.toThrow('H candidate catalog conflict');}finally{await db.exec('rollback;');}
 expect(databaseReady(await q('select public.ml_health() v'))).toBe(true);
});

it('owner-arranged H freeze uses the authenticated RPC, charges once and rejects forged/stale/wrong-seat intents',async()=>{
 const row=(await db.query<{id:string;match_id:string}>('select id,match_id from ml_private.rooms where id=$1',[rpcRoom.id])).rows[0],id=row.id;
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.19',seed:42,seats:[0,1,2,3],first:0,characters:['character-039','character-048','character-025','character-031']},1000);
 // Test-only owner setup; no public endpoint accepts GameState.
 await db.query('update ml_private.rooms set game=$2::jsonb where id=$1',[id,JSON.stringify(s)]);
 const packet=(a:number,intent:unknown,key:string,revision=s.revision)=>call(a,'game',{roomId:id,requestId:key,matchId:row.match_id,revision,intent});
 expect((await packet(1,{type:'skill',kind:'freeze',target:1},'h-freeze-wrong')).ok).toBe(false);
 for(const bad of [{type:'skill',kind:'freeze',target:1,cost:0},{type:'skill',kind:'freeze',target:1,actor:0},{type:'skill',kind:'freeze',target:1,state:s}])expect((await packet(0,bad,'h-forged-'+Object.keys(bad).at(-1))).ok).toBe(false);
 const accepted=await packet(0,{type:'skill',kind:'freeze',target:1},'h-freeze');expect(accepted.ok,accepted.error).toBe(true);expect(accepted.snapshot.game.players[0].ap).toBe(s.players[0].ap-2);expect(accepted.snapshot.game.stage3.h.frozenBy[1]).toBe(0);
 expect((await packet(0,{type:'skill',kind:'freeze',target:1},'h-freeze')).duplicate).toBe(true);expect((await packet(0,{type:'skill',kind:'freeze',target:1},'h-freeze-stale')).ok).toBe(false);
 const view=(await call(1,'view',{roomId:id})).snapshot;expect(view.game.players[0]).not.toHaveProperty('hand');expect(view.game).not.toHaveProperty('random');expect(view.game).not.toHaveProperty('queue');
 const end=await packet(0,{type:'end'},'h-freeze-end',accepted.snapshot.game.revision);expect(end.ok,end.error).toBe(true);expect(end.snapshot.game.active).toBe(2);
});

it('owner-arranged H035 RPC birth remains private, resumes once after save and keeps the original hand/deadline contract',async()=>{
 const row=(await db.query<{id:string;match_id:string}>('select id,match_id from ml_private.rooms where id=$1',[rpcRoom.id])).rows[0],id=row.id;
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.19',seed:42,seats:[0,1,2,3],first:0,characters:['character-035','character-048','character-025','character-031']},1000);expect(s.choice?.kind).toBe('h-birth');
 await db.query('update ml_private.rooms set game=$2::jsonb where id=$1',[id,JSON.stringify(s)]);
 const peer=(await call(1,'view',{roomId:id})).snapshot.game;expect(peer.choice).not.toHaveProperty('cells');expect(peer.players.every((p:any)=>p.handCount===0)).toBe(true);
 const body={roomId:id,requestId:'h-birth',matchId:row.match_id,revision:s.revision,intent:{type:'choose',choice:s.choice!.id,cell:s.choice!.cells![0]}};
 expect((await call(1,'game',{...body,requestId:'h-birth-wrong'})).ok).toBe(false);
 const born=await call(0,'game',body);expect(born.ok,born.error).toBe(true);expect(born.snapshot.game.players.every((p:any)=>p.handCount===4)).toBe(true);expect(born.snapshot.game.version).toBe('web-v0.1.19');expect(born.snapshot.game.players[0].cell).toBe(s.choice!.cells![0]);expect((await call(0,'game',body)).duplicate).toBe(true);
});
