import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import {CHARACTER_IDS,ALL_CARDS} from '../../packages/game-data/src/index';
import type {GameState,Command} from '../../packages/game-core/src/types';
const db=await database();afterAll(()=>db.close());
async function setup(version:'web-v0.1.1'|'web-v0.1.2'='web-v0.1.2'){
 const input={mode:'ffa' as const,seed:5,seats:[0,1,2,3],characters:[...CHARACTER_IDS],first:0,dice:[6],deck:[...ALL_CARDS],ruleVersion:version};
 const state=createGame(input,1000);const sql=(await db.query<{v:GameState}>('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(input)])).rows[0].v;expect(sql).toEqual(state);return state;
}
async function step(state:GameState,input:Record<string,unknown>,time=1100){
 const cmd={id:`move-${state.revision}`,actor:0,revision:state.revision,...input} as Command;
 const expected=dispatch(state,cmd,time),actual=(await db.query<{v:ReturnType<typeof dispatch>}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(state),JSON.stringify(cmd),time])).rows[0].v;
 expect(actual.ok,actual.error).toBe(expected.ok);expect(actual.state).toEqual(expected.state);expect(expected.ok,expected.error).toBe(true);return expected.state;
}
it('new movement reserves a use, cancels without fee, and cannot reroll',async()=>{
 let s=await step(await setup(),{type:'move'});expect(s.players[0].ap).toBe(5);expect(s.players[0].moved).toBe(true);
 s=await step(s,{type:'stop'});expect(s.players[0].ap).toBe(5);
 expect(dispatch(s,{id:'reroll',actor:0,revision:s.revision,type:'move'},1200).ok).toBe(false);
});
it('walking and stopping, including returning to origin, charges exactly once',async()=>{
 let s=await step(await setup(),{type:'move'});s=await step(s,{type:'step',path:['r4c2','r4c1']});expect(s.players[0].ap).toBe(5);
 s=await step(s,{type:'stop'});expect(s.players[0].ap).toBe(4);
 expect(dispatch(s,{id:'repeat-stop',actor:0,revision:s.revision,type:'stop'},1200).ok).toBe(false);
});
it('exhausting the allowance settles immediately; ending a moved turn also settles',async()=>{
 let s=await step(await setup(),{type:'move'});s=await step(s,{type:'step',path:['r3c1','r3c2','r3c3']});expect(s.movement).toBeNull();expect(s.players[0].ap).toBe(4);
 let t=await step(await setup(),{type:'move'});t=await step(t,{type:'step',path:['r4c2']});t=await step(t,{type:'end'});expect(t.players[0].ap).toBe(4);
});
it('timeout without a step is free; timeout in an occupied cell returns to last empty and charges',async()=>{
 let s=await step(await setup(),{type:'move'});s=await step(s,{type:'tick'},61000);expect(s.players[0].ap).toBe(5);
 let t=await setup();t.players[1].cell='r4c2';t=await step(t,{type:'move'});t=await step(t,{type:'step',path:['r4c2']});t=await step(t,{type:'tick'},61000);
 expect(t.players[0].cell).toBe('r4c1');expect(t.players[0].ap).toBe(4);
});
it('old matches keep their original upfront fee and receive no retroactive refund',async()=>{
 let s=await step(await setup('web-v0.1.1'),{type:'move'});expect(s.players[0].ap).toBe(4);expect(s.movement).not.toHaveProperty('costDue');
 s=await step(s,{type:'stop'});expect(s.players[0].ap).toBe(4);
});
