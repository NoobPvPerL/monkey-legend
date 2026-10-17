import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {createDraft,dispatchDraft,draftView,validateDraft} from '../../packages/game-core/src/draft';
import type {DraftSetup,DraftState,DraftCommand} from '../../packages/game-core/src/draft';
import {sourceCatalogForVersion} from '../../packages/game-data/src/index';
import {databaseReady} from '../../packages/online/src/version';
const db=await database();afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
const ids=Object.keys(sourceCatalogForVersion('web-v0.1.4').characters);
// Explicit synthetic pools for tests; these are not approved faction lists.
function setup(mode:'ffa'|'team'='ffa',seed=42):DraftSetup{
 const teams=mode==='team'?['机械猴子','帝汶家族','机械猴子','帝汶家族']:['S1','S2','S3','S4'];
 return {mode,order:[2,3,0,1],teams,pools:mode==='team'?{'机械猴子':ids.slice(0,8),'帝汶家族':ids.slice(8)}:Object.fromEntries(teams.map(t=>[t,[...ids]])),random:{seed,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false}};
}
let serial=0;
async function start(input=setup(),at=1000){const old=structuredClone(input),s=createDraft(input,at);expect(await q('select ml_private.create_draft($1::jsonb,$2) v',[JSON.stringify(input),at])).toEqual(s);expect(input).toEqual(old);return s;}
async function act(s:DraftState,cmd:DraftCommand,at=s.time+1){const old=structuredClone(s),ts=dispatchDraft(s,cmd,at);expect(await q('select ml_private.dispatch_draft($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).toEqual(ts);expect(s).toEqual(old);return ts;}
const pick=(s:DraftState,index=0):DraftCommand=>({id:'pick-'+ ++serial,revision:s.revision,actor:s.offer!.actor,type:'pick',offer:s.offer!.id,character:s.offer!.candidates[index]});
it('creates three unique candidates without mutating pools or dealing cards; all seeded FFA/team starts match SQL',async()=>{
 for(const mode of ['ffa','team'] as const)for(let seed=0;seed<24;seed++){
  const s=await start(setup(mode,seed));expect(s.offer?.actor).toBe(2);expect(s.offer?.deadline).toBe(31000);expect(new Set(s.offer!.candidates).size).toBe(3);expect(s.selected).toEqual([null,null,null,null]);expect(s).not.toHaveProperty('players');expect(s).not.toHaveProperty('deck');expect(s.pools).toEqual(setup(mode,seed).pools);
 }
});
it('moves only the selected character out of every pool, returns unchosen cards and completes in round order',async()=>{
 let s=await start();const first=s.offer!,unchosen=first.candidates.slice(1);let result=await act(s,pick(s));expect(result.ok,result.error).toBe(true);s=result.state;
 expect(s.selected[2]).toBe(first.candidates[0]);for(const pool of Object.values(s.pools)){expect(pool).not.toContain(first.candidates[0]);expect(pool).toEqual(expect.arrayContaining(unchosen));}
 for(let i=0;i<3;i++){const result=await act(s,pick(s,i%3));expect(result.ok,result.error).toBe(true);s=result.state;}
 expect(s.status).toBe('complete');expect(s.offer).toBeNull();expect(new Set(s.selected).size).toBe(4);expect(s.events.filter(e=>e.kind==='pick').map(e=>e.actor)).toEqual([2,3,0,1]);expect(Object.values(s.pools).every(pool=>pool.length===12)).toBe(true);validateDraft(s);
});
it('applies provided family pools, including shared neutral candidates, while retaining global uniqueness',async()=>{
 const input=setup('team');input.pools={'机械猴子':ids.slice(0,12),'帝汶家族':ids.slice(4)};
 let s=await start(input);for(let i=0;i<4;i++){
  expect(s.offer!.candidates.every(id=>input.pools[s.teams[s.offer!.actor]].includes(id))).toBe(true);
  const result=await act(s,pick(s));expect(result.ok,result.error).toBe(true);s=result.state;
 }
 expect(new Set(s.selected).size).toBe(4);for(const id of s.selected)for(const pool of Object.values(s.pools))expect(pool).not.toContain(id);
});
it('never discloses opponents candidates, pools, randomness or receipts; spectators and the active player see all three',async()=>{
 const s=await start();for(const viewer of [0,1,2,3,null]){
  const v=draftView(s,viewer);expect(await q('select ml_private.draft_view($1::jsonb,$2) v',[JSON.stringify(s),viewer])).toEqual(v);
  expect(v.offer).toHaveProperty('deadline',31000);for(const key of ['random','pools','requests','cursor','time'])expect(v).not.toHaveProperty(key);
  if(viewer===null||viewer===2)expect(v.offer?.candidates).toEqual(s.offer!.candidates);else expect(v.offer).not.toHaveProperty('candidates');
 }
 const next=(await act(s,pick(s))).state;for(const viewer of [0,1,2,3,null])expect(draftView(next,viewer).selected[2]).toBe(s.offer!.candidates[0]);
});
it('view refresh/reconnect does not redraw candidates, consume RNG, advance revision or extend the deadline',async()=>{
 const s=await start(),before=structuredClone(s);for(let i=0;i<8;i++)expect(await q('select ml_private.draft_view($1::jsonb,2) v',[JSON.stringify(s)])).toEqual(draftView(s,2));expect(s).toEqual(before);
 const early=await act(s,{id:'early',revision:0,actor:0,type:'tick'},30999);expect(early).toEqual({state:s,ok:true});
});
it('expires at exactly thirty seconds and starts the next original window; late picks cannot change the outcome',async()=>{
 const s=await start();expect((await act(s,pick(s),31000)).ok).toBe(false);
 const expired=await act(s,{id:'expire',revision:0,actor:0,type:'tick'},31000);expect(expired.ok).toBe(true);expect(s.offer!.candidates).toContain(expired.state.selected[2]);expect(expired.state.offer).toMatchObject({actor:3,deadline:61000});expect(expired.state.events.find(e=>e.kind==='pick')).toMatchObject({at:31000,timedOut:true});
});
it('catches up all four offline deadlines without starting four fresh windows at reconnect time',async()=>{
 const s=await start();const result=await act(s,{id:'offline',revision:0,actor:0,type:'tick'},200000);expect(result.ok,result.error).toBe(true);expect(result.state.status).toBe('complete');expect(result.state.events.filter(e=>e.kind==='pick').map(e=>e.at)).toEqual([31000,61000,91000,121000]);expect(result.state.revision).toBe(1);
});
it('retries an identical request once, rejects changed payloads under the same id and rejects old window/revision/actor',async()=>{
 const s=await start(),cmd=pick(s),r=await act(s,cmd);expect(r.ok).toBe(true);
 expect(await act(r.state,cmd,r.state.time+1)).toEqual({state:r.state,ok:true,duplicate:true});
 for(const altered of [{...cmd,character:s.offer!.candidates[1]},{...cmd,id:'old-revision'},{...pick(r.state),actor:s.offer!.actor},{...pick(r.state),offer:cmd.type==='pick'?cmd.offer:0}])expect((await act(r.state,altered)).ok).toBe(false);
});
it('rejects state/RNG/identity injection and invalid picks atomically',async()=>{
 const s=await start();for(const patch of [{random:{seed:1}},{pools:{}},{deadline:99999},{actor:3},{character:'character-053'},{character:'unknown'},{offer:0},{revision:1.5},{id:'id\n'}]){
  const cmd={...pick(s),...patch} as DraftCommand;const result=await act(s,cmd);expect(result.ok).toBe(false);expect(result.state).toBe(s);
 }
});
it('rejects absent, unknown, duplicate or undersized family pools before drawing and leaves active game readiness unchanged',async()=>{
 for(const change of [()=>({}),()=>({'机械猴子':ids.slice(0,8)}),()=>({'机械猴子':ids.slice(0,3),'帝汶家族':ids.slice(8)}),()=>({'机械猴子':['unknown',...ids.slice(0,8)],'帝汶家族':ids.slice(8)}),()=>({'机械猴子':[ids[0],ids[0],...ids.slice(1,8)],'帝汶家族':ids.slice(8)})]){
  const input={...setup('team'),pools:change()};expect(()=>createDraft(input,1000)).toThrow();await expect(q('select ml_private.create_draft($1::jsonb,1000) v',[JSON.stringify(input)])).rejects.toThrow();
 }
 const health=await q('select public.ml_health() v');expect(health).toMatchObject({engineRevision:16,ruleVersion:'web-v0.1.6'});expect(databaseReady(health)).toBe(true);
});
it('private draft functions are inaccessible to anonymous/authenticated clients',async()=>{
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const sql of ["select ml_private.create_draft('{}',0)","select ml_private.draft_view('{}',null)","select ml_private.dispatch_draft('{}','{}',0)"])await expect(db.query(sql)).rejects.toThrow(/permission denied/);await db.exec('reset role');}
});
