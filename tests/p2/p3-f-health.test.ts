import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {resolveJellyTrueDamage} from '../../packages/game-core/src/p3-f';
import {runtimeForVersion} from '../../packages/game-data/src/index';
const db=await database(undefined,27);await db.exec(await readFile('database/engine/p3-f.sql','utf8'));afterAll(()=>db.close());
it('owner example and finite health boundaries agree across TS/SQL without imposing a resurrection policy',async()=>{
 const cases=[
  {hp:3,maxHp:4,amount:1,after:{hp:2,maxHp:3,hpLoss:1,maxHpLoss:1,dead:false}},
  {hp:1,maxHp:4,amount:2,after:{hp:0,maxHp:2,hpLoss:1,maxHpLoss:2,dead:true}},
  {hp:4,maxHp:4,amount:4,after:{hp:0,maxHp:0,hpLoss:4,maxHpLoss:4,dead:true}},
  {hp:3,maxHp:4,amount:10,after:{hp:0,maxHp:0,hpLoss:3,maxHpLoss:4,dead:true}},
  {hp:0,maxHp:0,amount:0,after:{hp:0,maxHp:0,hpLoss:0,maxHpLoss:0,dead:true}},
  {hp:3,maxHp:4,amount:0,after:{hp:3,maxHp:4,hpLoss:0,maxHpLoss:0,dead:false}},
  {hp:2,maxHp:9007199254740991,amount:1,after:{hp:1,maxHp:9007199254740990,hpLoss:1,maxHpLoss:1,dead:false}},
 ];
 for(const {hp,maxHp,amount,after} of cases){const before={hp,maxHp};expect(resolveJellyTrueDamage(before,amount)).toEqual(after);expect(before).toEqual({hp,maxHp});expect((await db.query<{v:unknown}>('select ml_private.p3f_jelly_health($1::numeric,$2::numeric,$3::numeric) v',[hp,maxHp,amount])).rows[0].v).toEqual(after);}
});
it('invalid or fractional health and damage are rejected identically',async()=>{
 for(const [hp,maxHp,amount] of [[-1,4,1],[5,4,1],[3,4,-1],[3.5,4,1],[3,4,0.5],[3,9007199254740992,1]]){expect(()=>resolveJellyTrueDamage({hp,maxHp},amount)).toThrow('水母真伤生命输入无效');await expect(db.query('select ml_private.p3f_jelly_health($1::numeric,$2::numeric,$3::numeric)',[hp,maxHp,amount])).rejects.toThrow('水母真伤生命输入无效');}
});
it('isolated SQL helper keeps the E database profile; local F reference remains separate',async()=>{
 const health=(await db.query<{v:any}>('select public.ml_health() v')).rows[0].v;expect(health).toMatchObject({ruleVersion:'web-v0.1.16',engineRevision:27,characterDefinitions:27});expect(runtimeForVersion('web-v0.1.16').characterIds).toHaveLength(27);expect(runtimeForVersion('web-v0.1.17').characterIds).toHaveLength(35);expect((await db.query<{v:number}>("select count(*)::int v from ml_private.catalog where key='ruleset:web-v0.1.17'")).rows[0].v).toBe(0);
});
