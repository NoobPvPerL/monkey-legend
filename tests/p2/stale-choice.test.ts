import {expect,it} from 'vitest';
import {database} from './database';
import {commandError,prepareGameCommand} from '../../apps/client/src/interaction-guards';
import type {Snapshot,RoomReply} from '../../packages/online/src/protocol';
it('a real database timeout racing a skill click returns fresh state without executing or replaying the skill',async()=>{
 const db=await database(undefined,14);try{
  const initial=1_000_000;
  await db.exec(`create or replace function ml_private.now_ms() returns bigint language sql as $$ select ${initial}::bigint $$;`);
  const call=async(p:Record<string,unknown>)=>(await db.query<{v:RoomReply}>('select public.ml_room($1::jsonb) v',[JSON.stringify(p)])).rows[0].v;
  const people=Array.from({length:4},(_,i)=>({name:'选择竞争'+i,token:String(i+1).repeat(64),epoch:1}));
  const first=(await call({...people[0],op:'create',requestId:'create'})).snapshot!,roomId=first.roomId;
  for(const p of people.slice(1))expect((await call({...p,op:'join',code:first.code,requestId:'join'})).ok).toBe(true);
  for(const p of people){const s=(await call({...p,roomId,op:'view'})).snapshot!;expect((await call({...p,roomId,op:'ready',requestId:'ready',ready:true,roomRevision:s.roomRevision})).ok).toBe(true);}
  const ready=(await call({...people[0],roomId,op:'view'})).snapshot!;expect((await call({...people[0],roomId,op:'start',requestId:'start',roomRevision:ready.roomRevision})).ok).toBe(true);
  const state=(await db.query<any>('select game from ml_private.rooms where id=$1',[roomId])).rows[0].game;
  const actor=state.players.findIndex((p:any)=>p.character==='character-031');
  state.active=actor;state.cursor=state.order.indexOf(actor);state.phase='action';state.choice=null;state.queue=[{kind:'action',actor}];state.players[actor].ap=6;state.players[actor].skillUsed=false;
  const selected=(await db.query<any>("select ml_private.select_choice($1::jsonb,'runner-roll',$2,$3) v",[JSON.stringify(state),actor,initial])).rows[0].v;
  await db.query('update ml_private.rooms set game=$1::jsonb where id=$2',[JSON.stringify(selected),roomId]);
  const view=(await call({...people[actor],roomId,op:'view'})).snapshot! as Snapshot;
  const command=prepareGameCommand(view,view,{type:'choose',choice:view.game!.choice!.id,accept:true},'expired-skill',initial+1).command!;
  await db.exec(`create or replace function ml_private.now_ms() returns bigint language sql as $$ select ${initial+10001}::bigint $$;`);
  const request={...people[actor],roomId,...command};
  const reply=await call(request);expect(reply.ok).toBe(false);expect(reply.error).toBe('命令版本过期');expect(reply.snapshot!.game!.revision).toBeGreaterThan(view.game!.revision);
  expect(commandError(command,reply)).toContain('原选择窗口已结束');expect(reply.snapshot!.game!.players[actor].skillUsed).toBe(false);expect(reply.snapshot!.game!.players[actor].ap).toBe(6);
  const again=await call(request);expect(again.duplicate).toBe(true);expect(again.ok).toBe(false);expect(again.snapshot!.game!.revision).toBe(reply.snapshot!.game!.revision);
 }finally{await db.close();}
},30000);
