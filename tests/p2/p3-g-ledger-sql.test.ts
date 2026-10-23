import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {gFixture} from './p3-g-fixture';
import {gBeginPair,gDiscardEntries,gPiece} from '../../packages/game-core/src/p3-g-equipment';
import {gPrimeQuote} from '../../packages/game-core/src/p3-g-cards';
import type {EquipmentSource} from '../../packages/game-core/src/stage3-resources';
import {breadEquipment,useBread} from '../../packages/game-core/src/stage3-resources';
import {gearSnapshot} from '../../packages/game-core/src/stage4-equipment';
import {gRun,gDrain} from './p3-g-fixture';
import {gTurnStart} from '../../packages/game-core/src/p3-g-state';
import {give} from './p3-fixture';
const db=await database(undefined,28);afterAll(()=>db.close());await db.exec(await readFile('database/engine/p3-g.sql','utf8'));
it('each personal start refreshes programming and own-expiry G statuses identically in TS/SQL',async()=>{
 const s=gFixture();Object.assign(s.stage3!.g!,{programUsed:[true,false,true,false],counterUsed:[false,true,false,true],invisible:[true,true,true,true],marks:[0,1,2,0]});const before=structuredClone(s);gTurnStart(s as any,0);expect((await db.query<{v:any}>('select ml_private.p3g_start($1::jsonb,0) v',[JSON.stringify(before)])).rows[0].v).toEqual(s);expect(s.stage3!.g!.marks).toEqual([null,1,2,null]);
});
it('signed final costs and active skill lineage apply once after free effects identically in TS/SQL',async()=>{
 const s=gFixture();for(const a of [0,1])for(const cost of [-1,0,1,3,6]){
  const effect:EquipmentSource={origin:'card',actor:a,faction:s.players[a].faction,roleModifiers:[]},expected=gPrimeQuote(s,a,{cost,effect});
  let sql=(await db.query<{v:any}>('select ml_private.p3g_prime_quote($1::jsonb,$2,$3,$4::jsonb) v',[JSON.stringify(s),a,cost,JSON.stringify(effect)])).rows[0].v;expect(sql).toEqual(expected);
  sql=(await db.query<{v:any}>('select ml_private.p3g_prime_quote($1::jsonb,$2,$3::jsonb) v',[JSON.stringify(s),a,JSON.stringify(sql)])).rows[0].v;expect(sql).toEqual(expected);
 }
});
it('pair creation, cross-owner retention and final physical discard match whole TS/SQL ledger states',async()=>{
 const s=gFixture(),physical='basic-070#01',parts=[gPiece(physical,1),gPiece(physical,2)];s.deck=s.deck.filter(c=>c!==physical);s.resolving.push(physical);let before=structuredClone(s);gBeginPair(s,physical);
 expect((await db.query<{v:any}>('select ml_private.p3g_begin_pair($1::jsonb,$2) v',[JSON.stringify(before),physical])).rows[0].v).toEqual(s);
 s.stage3!.equipment[0].push(parts[0]);s.stage3!.equipment[1].push(parts[1]);
 const run=async(card:string)=>{before=structuredClone(s);const entries=gDiscardEntries(s,card),sql=(await db.query<{v:any}>('select ml_private.p3g_discard_entries($1::jsonb,$2) v',[JSON.stringify(before),card])).rows[0].v;expect(sql._gDiscardEntries).toEqual(entries);delete sql._gDiscardEntries;expect(sql).toEqual(s);return entries;};
 expect(await run(physical)).toEqual([]);s.resolving=[];s.stage3!.equipment[0]=[];expect(await run(parts[0])).toEqual([]);s.stage3!.equipment[1]=[];expect(await run(parts[1])).toEqual([physical]);expect(s.stage3!.g!.pairs).toEqual({});
});
it('a first broken piece cannot discard the backing entity while its second logical install is still open',async()=>{
 const s=gFixture(),physical='basic-051#01',parts=[gPiece(physical,1),gPiece(physical,2)];gBeginPair(s,physical);let before=structuredClone(s);expect(gDiscardEntries(s,parts[0])).toEqual([]);let sql=(await db.query<{v:any}>('select ml_private.p3g_discard_entries($1::jsonb,$2) v',[JSON.stringify(before),parts[0]])).rows[0].v;expect(sql._gDiscardEntries).toEqual([]);delete sql._gDiscardEntries;expect(sql).toEqual(s);
 s.stage3!.equipment[0].push(parts[1]);before=structuredClone(s);expect(gDiscardEntries(s,physical)).toEqual([]);sql=(await db.query<{v:any}>('select ml_private.p3g_discard_entries($1::jsonb,$2) v',[JSON.stringify(before),physical])).rows[0].v;delete sql._gDiscardEntries;expect(sql).toEqual(s);
});
it('bread readiness, selected-piece use and source cooldown snapshot match TS/SQL with independent items',async()=>{
 let s=gFixture();give(s,0,'basic-054#01');s=gDrain(gRun(s,{type:'play',card:'basic-054#01',targets:[]}));const parts=s.stage3!.equipment[0];
 for(const card of parts.slice().reverse()){
  expect((await db.query<{v:string}>('select ml_private.p3g_bread_equipment($1::jsonb,0,$2) v',[JSON.stringify(s),card])).rows[0].v).toBe(breadEquipment(s as any,0,card));
  const before=structuredClone(s);useBread(s as any,0,1,card);expect((await db.query<{v:any}>('select ml_private.p3g_bread($1::jsonb,0,1,$2) v',[JSON.stringify(before),card])).rows[0].v).toEqual(s);
 }
 expect(breadEquipment(s as any,0)).toBeUndefined();expect((await db.query<{v:string|null}>('select ml_private.p3g_bread_equipment($1::jsonb,0) v',[JSON.stringify(s)])).rows[0].v).toBeNull();s.stage3!.starts[0]++;
 for(const card of parts)expect((await db.query<{v:any}>('select ml_private.p3g_gear_snapshot($1::jsonb,0,$2) v',[JSON.stringify(s),card])).rows[0].v).toEqual({...gearSnapshot(s,0,card),breadRemaining:1});
 const snapshot=gearSnapshot(s,0,parts[0]);s.stage3!.starts[1]=8;const sql=(await db.query<{v:any}>('select ml_private.p3g_bread_install($1::jsonb,1,$2::jsonb) v',[JSON.stringify(s),JSON.stringify(snapshot)])).rows[0].v;s.stage3!.g!.gearBreadReadyAt[parts[0]]=9;expect(sql).toEqual(s);
});
