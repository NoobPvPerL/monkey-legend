import {afterAll,expect,it,vi} from 'vitest';
import {database,literal,scalar} from './database';
import type {Command,GameState,Setup,DispatchResult} from '../../packages/game-core/src/types';
const db=await database();afterAll(()=>db.close());
let compared=0;
vi.doMock('../../packages/game-core/src/index',async(importOriginal)=>{
 const core=await importOriginal<typeof import('../../packages/game-core/src/index')>();
 return {...core,
  createGame(setup:Setup,now:number){const expected=core.createGame(setup,now);const actual=scalar(db,`select ml_private.create_game(${literal(setup)},${now})`);expect(actual).toEqual(expected);compared++;return expected;},
  dispatch(previous:GameState,cmd:Command,now:number){const expected=core.dispatch(previous,cmd,now);const actual=scalar<DispatchResult>(db,`select ml_private.dispatch(${literal(previous)},${literal(cmd)},${now})`);expect(actual.ok,actual.error).toBe(expected.ok);expect(actual.state).toEqual(expected.state);compared++;return expected;},
  legalTargets(s:GameState,a:number,c:string){const expected=core.legalTargets(s,a,c);expect(scalar(db,`select ml_private.targets(${literal(s)},${a},'${c}')`)).toEqual(expected);return expected;},
  legalSteps(s:GameState){const expected=core.legalSteps(s);expect(scalar(db,`select ml_private.legal_steps(${literal(s)})`)).toEqual(expected);return expected;},
  teleportCells(s:GameState,a:number){const expected=core.teleportCells(s,a);expect(scalar(db,`select ml_private.teleport_cells(${literal(s)},${a})`)).toEqual(expected);return expected;},
 };
});
// Reuse all original C-001..C-046 and both complete T cases, including their
// assertions and legal state construction. This is not a new copy of the oracle.
await import('../rules.test');
await import('../input-view.test');
await import('../ui-fixtures.test');
it('P2 SQL comparison actually executed hundreds of independent transitions',()=>{expect(compared).toBeGreaterThan(300);});
