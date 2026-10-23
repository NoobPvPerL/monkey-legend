import {afterAll,beforeAll,expect,it} from 'vitest';
import {database} from './database';
import {hProfile} from './p3-h-fixture';
import {hDevelopmentSQL} from '../../tools/p3-h-runtime-patch.mjs';
import {createGame,dispatch,validateState} from '../../packages/game-core/src/index';
import {createDraft,dispatchDraft} from '../../packages/game-core/src/draft';
import {runtimeForVersion} from '../../packages/game-data/src/index';
import type {GameState,Setup,Command} from '../../packages/game-core/src/types';

const db=await database(undefined,29);
afterAll(()=>db.close());
const query=async<T>(sql:string,args:unknown[]=[])=>((await db.query<{v:T}>(sql,args)).rows[0].v);
const characters=['character-013','character-047','character-031','character-043'] as Setup['characters'];
const setup=(mode:'ffa'|'team',first:number):Setup=>({mode,first,seed:42,seats:[0,1,2,3],ruleVersion:'web-v0.1.14',characters});
const saved:GameState[]=[],baselineErrors:string[]=[];
beforeAll(async()=>{
 // Keep the frozen predecessor's deterministic failure as evidence; no validate bypass.
 for(const first of [0,1,2,3]){
  try{await query('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup('ffa',first))]);baselineErrors.push('unexpected success');}
  catch(e){baselineErrors.push((e as Error).message);}
 }
 for(let n=1;n<=18;n++)saved.push(await query<GameState>('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify({mode:'ffa',first:0,seed:42,seats:[0,1,2,3],ruleVersion:`web-v0.1.${n}`})]));
 const profile=await query<any>("select value v from ml_private.catalog where key='ruleset:web-v0.1.18'");
 await db.exec(await hDevelopmentSQL(hProfile(profile)));
});

it('immutable000-029 reproduce all four v14 opening overflows before the private repair',()=>{
 expect(baselineErrors).toEqual(Array(4).fill('C批角色状态无效'));
});

let serial=0;
async function run(s:GameState,body:Record<string,unknown>,at=s.time+1){
 const cmd={id:`h-compat-${++serial}`,revision:s.revision,actor:s.choice?.actor??s.active,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=await query<ReturnType<typeof dispatch>>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3::double precision) v',[JSON.stringify(s),JSON.stringify(cmd),at]);
 expect(ts.ok,ts.error).toBe(true);expect(sql).toEqual(ts);validateState(ts.state);return ts.state;
}

for(const mode of ['ffa','team'] as const)for(const first of [0,1,2,3])it(`v14 ${mode} first${first} initializes C before opening overflow and resumes once`,async()=>{
 let s=createGame(setup(mode,first),1000);
 expect(await query('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup(mode,first))])).toEqual(s);
 expect(s.version).toBe('web-v0.1.14');expect(s.choice?.kind).toBe('xiao-overflow');expect(s.stage3!.starts).toEqual([0,0,0,0]);
 expect(s.stage3!.c).toEqual({feather:[false,false,false,false],blocked:[false,false,false,false],used:[false,false,false,false],sleep:[false,false,false,false]});
 // A persisted choice is resumed without resetting role flags or changing saved version.
 s=JSON.parse(JSON.stringify(s));let guard=0;
 while(s.choice&&guard++<12)s=await run(s,{type:'choose',choice:s.choice.id,cards:s.choice.cards?.slice(0,s.choice.count)});
 expect(s.choice).toBeNull();expect(s.phase).toBe('action');expect(s.stage3!.starts[first]).toBe(1);expect(s.stage3!.starts.reduce((a,b)=>a+b,0)).toBe(1);
 expect(s.stage3!.d).toBeUndefined();expect(s.stage3!.g).toBeUndefined();expect(s.stage3!.h).toBeUndefined();
});

for(let n=1;n<=18;n++)it(`saved v${n} state from frozen029 executes unchanged after the private repair`,async()=>{
 const s=JSON.parse(JSON.stringify(saved[n-1])) as GameState,before=structuredClone(s);
 const expected=createGame({mode:'ffa',first:0,seed:42,seats:[0,1,2,3],ruleVersion:s.version},1000);
 expect(expected).toEqual(s);
 const next=await run(s,{type:'tick'});expect(s).toEqual(before);expect(next.version).toBe(s.version);expect(next.stage3?.h).toBeUndefined();
});

it('a genuine completed saved v14 draft keeps its catalog and opens through the room completion function',async()=>{
 const all=runtimeForVersion('web-v0.1.14').characterIds,fillers=all.filter(id=>!characters!.includes(id)),teams=['S1','S2','S3','S4'];
 let d=createDraft({mode:'ffa',catalogVersion:'web-v0.1.14',order:[0,1,2,3],teams,pools:Object.fromEntries(teams.map((t,a)=>[t,[characters![a],...fillers.slice(a*2,a*2+2)]])),random:{seed:42,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false}},1000);
 for(let a=0;a<4;a++){
  const cmd={id:`h-old-draft-${a}`,type:'pick' as const,revision:d.revision,actor:a,offer:d.offer!.id,character:characters![a]};
  const ts=dispatchDraft(d,cmd,1001+a);expect(ts.ok).toBe(true);
  expect(await query('select ml_private.dispatch_draft($1::jsonb,$2::jsonb,$3::double precision) v',[JSON.stringify(d),JSON.stringify(cmd),1001+a])).toEqual(ts);d=ts.state;
 }
 expect(d.status).toBe('complete');d=JSON.parse(JSON.stringify(d));
 const row={mode:'ffa',status:'drafting',revision:7,draft:d};
 const completed=await query<any>('select to_jsonb(ml_private.stage3_complete_draft(jsonb_populate_record(null::ml_private.rooms,$1::jsonb),1100)) v',[JSON.stringify(row)]);
 const expected=createGame({mode:'ffa',first:0,seed:d.random.seed,seats:[0,1,2,3],ruleVersion:'web-v0.1.14',characters:d.selected as Setup['characters']},1004);
 expect(completed.game).toEqual(expected);expect(completed.game.version).toBe('web-v0.1.14');expect(completed.game.choice.kind).toBe('xiao-overflow');expect(completed.revision).toBe(8);expect(completed.status).toBe('playing');
});

it('valid stored C flags are preserved, and malformed state still fails validation',async()=>{
 let s=JSON.parse(JSON.stringify(saved[13])) as GameState;
 s.stage3!.c!.sleep[1]=true;s.stage3!.c!.used[2]=true;s.stage3!.c!.blocked[3]=true;
 const flags=structuredClone(s.stage3!.c);s=await run(s,{type:'tick'});expect(s.stage3!.c).toEqual(flags);
 const broken=structuredClone(s);delete broken.stage3!.c;expect(()=>validateState(broken)).toThrow('C批角色状态无效');
});
