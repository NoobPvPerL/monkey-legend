import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {createGame,dispatch,validateState} from '../../packages/game-core/src/index';
import {poisonRegions,bombingRegions,refreshClassicRound,classicEnvironmentHits,caveEnding,relocated} from '../../packages/game-core/src/classic';
import {mapForVersion,runtimeForVersion,PROTECTED_REGIONS} from '../../packages/game-data/src/index';
import type {GameState,Command} from '../../packages/game-core/src/types';
import {readFile} from 'node:fs/promises';
const db=await database();afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0]?.v);
const setup={mode:'ffa' as const,ruleVersion:'web-v0.1.5' as const,seed:42,seats:[0,1,2,3],characters:['character-031','character-004','character-027','character-037'] as const,first:0,dice:[6]};
const game=()=>createGame({...setup,characters:[...setup.characters]},1000);
let serial=0;
async function step(s:GameState,type:'end'|'tick',at=s.time+1){
 const cmd:Command={id:'patch-'+ ++serial,revision:s.revision,actor:s.active,type};
 const ts=dispatch(s,cmd,at);expect(await q('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).toEqual(ts);expect(ts.ok,ts.error).toBe(true);return ts.state;
}
it('creates a versioned classic patch with exact TS/SQL state, while preserving the old v0.1.4 profile',async()=>{
 const s=game();expect(await q('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify({...setup,characters:[...setup.characters]})])).toEqual(s);
 expect(s.classic).toMatchObject({caveEnds:[0,0,0,0],bombRound:0});expect(s.classic!.poison).toHaveLength(2);
 const old=createGame({...setup,ruleVersion:'web-v0.1.4',characters:[...setup.characters]},1000);expect(old.classic).not.toHaveProperty('caveEnds');
 expect(await q("select ml_private.runtime_data('web-v0.1.4','cards') v")).toEqual(runtimeForVersion('web-v0.1.4').cards);
});
it('grows poison to eleven eligible districts, never the three protected areas or the cave, and exhausts at round six',async()=>{
 const s=game();const regions=poisonRegions(s.version);expect(regions).toHaveLength(11);expect(regions).toContain('红素洋');
 expect(await q('select ml_private.patch_poison_regions($1) v',[s.version])).toEqual(regions);
 for(let round=2;round<=8;round++){
  s.round=round;const before=structuredClone(s);refreshClassicRound(s);
  expect(await q('select ml_private.classic_refresh($1::jsonb) v',[JSON.stringify(before)])).toEqual(s);
  expect(s.classic!.poison).toHaveLength(Math.min(11,round*2));
  expect(s.classic!.poison.some(r=>r==='山洞'||PROTECTED_REGIONS.some(x=>x===r))).toBe(false);
 }
 expect(poisonRegions('web-v0.1.4')).toHaveLength(8);
});
it('only unlocks protected bombing after all eleven poison regions, keeps prior outdoor candidates and excludes the cave',async()=>{
 const s=game();expect(bombingRegions(s)).toHaveLength(5);expect(bombingRegions(s)).not.toContain('操场');
 expect(await q('select ml_private.patch_bomb_regions($1::jsonb) v',[JSON.stringify(s)])).toEqual(bombingRegions(s));
 s.classic!.poison=poisonRegions(s.version);expect(bombingRegions(s)).toHaveLength(8);
 for(const r of PROTECTED_REGIONS)expect(bombingRegions(s)).toContain(r);
 s.round=6;s.random.bombs=['教学楼','办公室'];const before=structuredClone(s),hits=classicEnvironmentHits(s);
 const sql=await q('select ml_private.classic_environment($1::jsonb) v',[JSON.stringify(before)]);expect(sql._hits).toEqual(hits);delete sql._hits;expect(sql).toEqual(s);
 expect(s.classic!.bombs).toEqual(['教学楼','办公室']);expect(s.classic!.bombRound).toBe(6);
 const old=game();old.random.bombs=['操场','教学楼'];expect(()=>classicEnvironmentHits(old)).toThrow('注入轰炸');
 expect(bombingRegions(createGame({...setup,ruleVersion:'web-v0.1.4',characters:[...setup.characters]},1000))).toContain('操场');
});
it('retains the last bombing districts and round through next-round refresh without applying them again',async()=>{
 const s=game();s.random.bombs=['高唐农场','帝汶岛'];classicEnvironmentHits(s);expect(s.classic!.bombRound).toBe(1);
 s.round=2;const before=structuredClone(s);refreshClassicRound(s);expect(s.classic!.bombs).toEqual(['高唐农场','帝汶岛']);
 expect(await q('select ml_private.classic_refresh($1::jsonb) v',[JSON.stringify(before)])).toEqual(s);
});
it('cave counter fires on the third and sixth personal endings, clamps AP, permits shields, and never changes poison exposure',async()=>{
 let s=game();const a=3;s.players.forEach(p=>{p.hand=[];p.skillUsed=true;});s.discard=[];s.deck=[...runtimeForVersion(s.version).allCards];s.players[a].cell='r2c8';s.players[a].ap=1;s.players[a].shield=1;
 for(let i=1;i<=6;i++){
  s.active=a;s.cursor=0;s.order=[3,0,1,2];s.phase='action';s.choice=null;s.queue=[];s.clock={remaining:60000,since:s.time};
  s=await step(s,'end');expect(s.classic!.caveEnds![a]).toBe(i%3);
  if(i===3){expect(s.players[a].ap).toBe(0);expect(s.players[a].hp).toBe(5);expect(s.players[a].shield).toBe(0);}
 }
 expect(s.players[a].hp).toBe(4);expect(s.events.filter(e=>e.type==='cave')).toHaveLength(2);
 expect(s.classic!.exposure[a]).toEqual({region:null,streak:0});validateState(s);
});
it('leaving the cave resets residency immediately, returning starts over; no damage in old games',async()=>{
 const s=game();s.players[3].cell='r2c8';caveEnding(s,3);caveEnding(s,3);expect(s.classic!.caveEnds![3]).toBe(2);
 const before=structuredClone(s);relocated(s,3,'r2c8','r1c8');expect(s.classic!.caveEnds![3]).toBe(0);
 expect(await q("select ml_private.classic_relocated($1::jsonb,3,'r2c8','r1c8') v",[JSON.stringify(before)])).toEqual(s);
 s.players[3].cell='r2c8';expect(caveEnding(s,3)).toEqual([]);expect(s.classic!.caveEnds![3]).toBe(1);
 const old=createGame({...setup,ruleVersion:'web-v0.1.4',characters:[...setup.characters]},1000);old.players[3].cell='r2c8';for(let i=0;i<8;i++)expect(caveEnding(old,3)).toEqual([]);
});
it('timeout ending counts cave residency once and survives serialized reconnect/retry',async()=>{
 let s=game();s.players[0].cell='r2c8';s.players[3].cell='r1c3';s.players[0].hand=[];s.deck=runtimeForVersion(s.version).allCards.filter(id=>!s.players.some(p=>p.hand.includes(id)));s.classic!.caveEnds![0]=2;s.players[0].skillUsed=true;
 s=await step(s,'tick',61000);expect(s.events.filter(e=>e.type==='cave')).toHaveLength(1);expect(s.classic!.caveEnds![0]).toBe(0);
 const restored=JSON.parse(JSON.stringify(s));expect(await q('select ml_private.public_view($1::jsonb,0) v',[JSON.stringify(restored)])).toMatchObject({classic:{caveEnds:s.classic!.caveEnds}});
 const cmd:Command={id:s.seen.at(-1)!,revision:s.revision,actor:s.active,type:'end'};expect(dispatch(s,cmd,s.time).ok).toBe(false);
});
it('dodgeball offers no defense stance in the patch; ordinary attacks and historical games retain their response paths',async()=>{
 for(const version of ['web-v0.1.4','web-v0.1.5'] as const){
  const s=createGame({...setup,ruleVersion:version,characters:[...setup.characters]},1000),all=runtimeForVersion(version).allCards;
  const dodge=all.find(c=>c.startsWith('basic-009#'))!,defense=all.find(c=>c.startsWith('basic-001#'))!;
  s.players.forEach(p=>{p.hand=[];p.skillUsed=true;p.rewarded=[0,1,2,3];});s.players[0].hand=[dodge];s.players[1].hand=[defense];s.deck=all.filter(c=>c!==dodge&&c!==defense);s.players[0].cell='r3c1';s.players[1].cell='r3c2';s.players[2].cell='r1c3';s.players[3].cell='r1c4';
  const cmd:Command={id:'dodge-'+version,revision:0,actor:0,type:'play',card:dodge,targets:[1]},ts=dispatch(s,cmd,1001);
  expect(await q('select ml_private.dispatch($1::jsonb,$2::jsonb,1001) v',[JSON.stringify(s),JSON.stringify(cmd)])).toEqual(ts);expect(ts.ok,ts.error).toBe(true);
  expect(ts.state.choice?.kind).toBe(version==='web-v0.1.4'?'response':undefined);expect(ts.state.players[1].hand).toContain(defense);
 }
});
it('server-trusted random openings cover all four seats rather than a fixed S2',async()=>{
 const seen=new Set<number>();for(let i=0;i<48;i++){
  const input={mode:'ffa',seed:0,seats:[0,1,2,3],secure:true};const s=await q('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(input)]);seen.add(s.order[0]);expect(s.order[0]).toBe(s.active);expect(s.random.secure).toBe(true);
 }
 expect([...seen].sort()).toEqual([0,1,2,3]);
 const sql=await readFile('database/migrations/014_classic_feedback_patch.sql','utf8');expect(sql).toContain("'first',ml_private.entropy(4)");
});
it('runner skips common round AP, only refills below six on their own turn, and preserves high AP including campus ordering',async()=>{
 for(const version of ['web-v0.1.4','web-v0.1.5'] as const)for(const held of [1,6,9]){
  let s=createGame({...setup,ruleVersion:version,characters:['character-004','character-031','character-027','character-037']},1000);
  s.players.forEach((p,i)=>{p.hand=[];p.ap=i===1?held:1;p.cell=['r2c4','r2c3','r1c3','r4c4'][i];p.skillUsed=true;});s.deck=[...runtimeForVersion(version).allCards];
  s.active=3;s.cursor=3;s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};
  s=await step(s,'end');expect(s.round).toBe(2);expect(s.active).toBe(0);
  expect(s.players[1].ap).toBe(version==='web-v0.1.5'?held:held<5?held+3:held);
  expect(s.players[0].ap).toBe(4);
  s=await step(s,'end');expect(s.active).toBe(1);expect(s.players[1].ap).toBe(Math.max(6,held));
 }
 for(const held of [1,6,9]){
  let s=game();s.players[0].cell='r1c6';s.players[0].ap=held;s.round=2;s.queue=[{kind:'turn-start',actor:0}];s.phase='resolving';s.clock={remaining:60000,since:null};
  const sql=await q('select ml_private.pump($1::jsonb,1000) v',[JSON.stringify(s)]);
  expect(sql.players[0].ap).toBe(Math.max(6,held)+1);
 }
});
