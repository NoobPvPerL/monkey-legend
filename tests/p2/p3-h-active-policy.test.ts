import {afterAll,beforeAll,expect,it} from 'vitest';
import {database} from './database';
import {hDevelopmentSQL} from '../../tools/p3-h-runtime-patch.mjs';
import {hFixture,hProfile} from './p3-h-fixture';
import {hActiveBlocker} from '../../packages/game-core/src/p3-h-active';
import type {HActiveBoard} from '../../packages/game-core/src/p3-h-active';
const db=await database(undefined,29);afterAll(()=>db.close());
beforeAll(async()=>{const previous=(await db.query<{v:any}>("select value v from ml_private.catalog where key='ruleset:web-v0.1.18'")).rows[0].v;await db.exec(await hDevelopmentSQL(hProfile(previous)));});
const cases:[string,(s:HActiveBoard)=>void,number|null][]=[
 ['same region enemy',()=>{},1],
 ['different square in same region',s=>{s.players[1].cell='r2c3';},1],
 ['neighbor region',s=>{s.players[1].cell='r1c4';},null],
 ['different region',s=>{s.players[1].cell='r4c8';},null],
 ['FFA keeps distinct opponents even when team strings match',s=>{s.players[1].team=s.players[0].team;},1],
 ['team ally',s=>{s.mode='team';s.players[1].team=s.players[0].team;},null],
 ['team enemy',s=>{s.mode='team';s.players[1].team='other';},1],
 ['Mei locked-role immunity',s=>{s.players[0].character='character-026';},null],
 ['Xie active immunity does not stop locked suppression',s=>{s.players[0].character='character-044';},1],
 ['dead source',s=>{s.players[1].hp=0;},null],
 ['off-map source',s=>{s.stage4!.offMap[1]=true;},null],
 ['off-map target',s=>{s.stage4!.offMap[0]=true;},null],
 ['dead target',s=>{s.players[0].hp=0;},null],
 ['old saved G version is untouched',s=>{s.version='web-v0.1.18';},null],
 ['source cannot silence itself',s=>{s.players[0].character='character-011';s.players[1].character='character-048';},null],
];
for(const [label,change,expected] of cases)it('011 policy foundation: '+label,async()=>{
 const s:HActiveBoard=hFixture();s.players[0].cell='r1c2';s.players[1].cell='r1c3';s.players[1].character='character-011';change(s);
 expect(hActiveBlocker(s,0)).toBe(expected);
 expect((await db.query<{v:number|null}>('select ml_private.p3h_active_blocker($1::jsonb,0) v',[JSON.stringify(s)])).rows[0].v).toBe(expected);
});
it('011 private integration keeps normal factories and public RPC closed',async()=>{
 const normal=(await db.query<{v:any}>('select public.ml_health() v')).rows[0].v;expect(normal.characterDefinitions).toBe(43);
 const profile=(await db.query<{v:any}>("select value v from ml_private.catalog where key='ruleset:web-v0.1.19'")).rows[0].v;expect(profile.runtimeData.characterIds).toContain('character-011');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query('select ml_private.p3h_active_blocker($1::jsonb,0)',[JSON.stringify(hFixture())])).rejects.toThrow(/permission denied/);await db.exec('reset role');}
});
