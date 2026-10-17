import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {createGame,dispatch,legalSteps,legalLocations,publicView,validateState} from '../../packages/game-core/src/index';
import {classicEnvironmentHits,refreshClassicRound,relocated,owesWater,nativeLandings} from '../../packages/game-core/src/classic';
import {runtimeForVersion,mapForVersion} from '../../packages/game-data/src/index';
import type {GameState,Command} from '../../packages/game-core/src/types';
const db=await database();afterAll(()=>db.close());
const q=async(sql:string,args:unknown[]=[])=>((await db.query<{v:any}>(sql,args)).rows[0].v);
const setup={mode:'ffa' as const,ruleVersion:'web-v0.1.4' as const,seed:42,seats:[0,1,2,3],characters:['character-031','character-004','character-027','character-037'] as const,first:0,dice:[6]};
function game(){return createGame({...setup,characters:[...setup.characters]},1000);}
function place(s:GameState,cells:string[]){s.players.forEach((p,i)=>p.cell=cells[i]);return s;}
function give(s:GameState,a:number,count=3){
 const all=runtimeForVersion(s.version).allCards;s.players.forEach(p=>p.hand=[]);s.deck=all.slice(count);s.discard=[];s.resolving=[];s.players[a].hand=all.slice(0,count);return s;
}
let serial=0;
async function step(s:GameState,intent:Omit<Command,'id'|'revision'|'actor'> & {actor?:number},at=s.time+1){
 const cmd={id:'classic-'+ ++serial,revision:s.revision,actor:intent.actor??s.active,...intent} as Command;
 const ts=dispatch(s,cmd,at),sql=await q('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at]);
 expect(sql).toEqual(ts);expect(ts.ok,ts.error).toBe(true);return ts.state;
}
async function decline(s:GameState){while(s.choice)s=await step(s,{type:'choose',choice:s.choice.id,actor:s.choice.actor,...(s.choice.kind==='discard'||s.choice.kind==='water-discard'?{cards:s.players[s.choice.actor].hand.slice(0,s.choice.count)}:{accept:false,cell:null,card:null})} as any);return s;}
it('creates a classic match with fixed-region empty spawns, permanent round-one poison, and private views',async()=>{
 const s=game();expect(await q('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify({...setup,characters:[...setup.characters]})])).toEqual(s);
 expect(s.classic!.poison).toHaveLength(2);expect(s.classic!.bombs).toEqual([]);expect(s.bomb).toBeNull();expect(s.forecast).toBeNull();
 expect(new Set(s.players.map(p=>p.cell)).size).toBe(4);expect(mapForVersion(s.version).map[s.players[1].cell].region).toBe('操场');expect(s.players[1].faction).toBe('帝汶家族');
 const view=await q('select ml_private.public_view($1::jsonb,0) v',[JSON.stringify(s)]);expect(view.classic).toEqual(publicView(s,0).classic);
 for(const key of ['deck','random','queue','seen'])expect(view).not.toHaveProperty(key);expect(view.players[1]).not.toHaveProperty('hand');
});
it('land-to-water pauses movement for ten-second discard; refresh/retry preserve the same window and timeout resumes once',async()=>{
 let s=give(place(game(),['r3c2','r2c4','r1c3','r2c8']),0);
 s=await step(s,{type:'move'});s=await step(s,{type:'step',path:['r3c3']} as any);
 expect(s.choice).toMatchObject({kind:'water-discard',actor:0,count:1,paused:true,deadline:s.time+10000});expect(s.players[0].ap).toBe(6);expect(s.movement!.remaining).toBe(1);
 const saved=structuredClone(s);expect(await q('select ml_private.public_view($1::jsonb,0) v',[JSON.stringify(s)])).toMatchObject({choice:{id:s.choice!.id,deadline:s.choice!.deadline}});
 s=await step(s,{type:'tick'},s.choice!.deadline);expect(s.choice).toBeNull();expect(s.phase).toBe('moving');expect(s.discard).toContain([...saved.players[0].hand].sort()[0]);
 s=await step(s,{type:'step',path:['r3c4']} as any);expect(s.phase).toBe('action');expect(s.players[0].ap).toBe(5);expect(s.discard).toHaveLength(1);
 const cmd:Command={id:s.seen.at(-1)!,revision:s.revision,actor:0,type:'stop'};expect(dispatch(s,cmd,s.time).ok).toBe(false);validateState(s);
 const limited=await step(give(game(),0,4),{type:'end'});expect(limited.choice).toMatchObject({kind:'discard',deadline:limited.time+20000});
});
it('continuous water movement discards once, re-entry discards again; empty hands and lemon pay no water card',async()=>{
 let s=give(place(game(),['r3c2','r2c4','r1c3','r2c8']),0);s=await step(s,{type:'move'});s.movement!.remaining=10;
 s=await step(s,{type:'step',path:['r3c3','r4c3']} as any);s=await decline(s);expect(s.players[0].cell).toBe('r4c3');expect(s.discard).toHaveLength(1);
 s=await step(s,{type:'step',path:['r4c2','r4c3']} as any);expect(s.choice?.kind).toBe('water-discard');s=await decline(s);expect(s.discard).toHaveLength(2);
 let empty=give(place(game(),['r3c2','r2c4','r1c3','r2c8']),0,0);empty=await step(empty,{type:'move'});empty=await step(empty,{type:'step',path:['r3c3']} as any);expect(empty.choice).toBeNull();
 const lemon=place(game(),['r1c1','r3c2','r1c3','r2c8']);expect(owesWater(lemon,1)).toBe(false);expect(nativeLandings(lemon,1)).toContain('r3c4');
});
it('native straight crossing costs one step, occupied bank offers only empty adjacent land, edges have no landing',async()=>{
 let s=place(game(),['r1c1','r3c2','r1c3','r2c8']);s.active=1;s.cursor=1;s.clock={remaining:60000,since:s.time};
 expect(await q('select ml_private.classic_landings($1::jsonb,1) v',[JSON.stringify(s)])).toEqual(nativeLandings(s,1));
 s=await step(s,{type:'move'});expect(legalSteps(s)).toContain('r3c4');s=await step(s,{type:'step',path:['r3c4']} as any);expect(s.movement!.remaining).toBe(2);expect(s.choice).toBeNull();
 s=place(game(),['r3c4','r3c2','r1c3','r2c8']);expect(nativeLandings(s,1)).not.toContain('r3c4');expect(nativeLandings(s,1)).toEqual(expect.arrayContaining(['r2c4','r4c4','r3c5']));expect(await q('select ml_private.classic_landings($1::jsonb,1) v',[JSON.stringify(s)])).toEqual(nativeLandings(s,1));
 s.players[1].cell='r3c6';expect(nativeLandings(s,1)).toEqual([]);
});
it('ship and commute validate own action/AP/empty landings, preserve movement usage, do not reset clock, and queue arrival water',async()=>{
 let s=give(place(game(),['r1c8','r2c4','r1c3','r2c8']),0);s.classic!.exposure[0]={region:'飞船',streak:3};const remaining=s.clock.remaining;
 s=await step(s,{type:'location',kind:'ship',cell:'r4c6'} as any);expect(s.players[0].ap).toBe(6);expect(s.players[0].moved).toBe(false);expect(s.clock.remaining).toBe(remaining-1);expect(s.choice?.kind).toBe('water-discard');expect(s.classic!.exposure[0].streak).toBe(0);
 s=await decline(s);expect(legalLocations(s,0).ship).toEqual([]);
 s=await step(s,{type:'location',kind:'commute',cell:'r4c8'} as any);expect(s.players[0].ap).toBe(0);expect(s.players[0].moved).toBe(false);expect(s.players[0].cell).toBe('r4c8');
 for(const intent of [{type:'location',kind:'ship',cell:'r2c4'},{type:'location',kind:'commute',cell:'r1c1'}]){const cmd={...intent,actor:0,id:'invalid',revision:s.revision} as Command;expect((await q('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),s.time+1])).ok).toBe(false);expect(dispatch(s,cmd,s.time+1).state).toBe(s);}
});
it('round water discard precedes AP refill and poison refresh, farm closes on round five, cave is exempt',async()=>{
 let s=give(place(game(),['r4c6','r2c4','r1c3','r2c8']),0);s.round=4;s.cursor=3;s.active=s.order[3];s.players[0].ap=0;s.classic!.poison=[];s.random.bombs=['高唐农场','樱花大道'];
 s=await step(s,{type:'end'});s=await decline(s); // decline all choice windows, including round-start water
 expect(s.round).toBe(5);expect(s.classic!.farmClosed).toBe(true);expect(s.classic!.poison).toHaveLength(2);expect(s.players[0].ap).toBe(6);expect(s.players[3].hp).toBe(s.players[3].maxHp);
 expect(legalLocations(s,s.active).commute).not.toContain('r1c1');
});
it('environment selects two distinct outdoor regions, poison exhausts at eight, damage doubles only after actual HP loss and resets on region changes',async()=>{
 let s=place(game(),['r1c2','r2c4','r1c3','r2c8']);s.classic!.poison=['教学楼'];s.random.bombs=['高唐农场','帝汶岛'];s.players[0].shield=1;
 for(const expected of [1,1,2,4]){
  const before=structuredClone(s),hits=classicEnvironmentHits(s),sql=await q('select ml_private.classic_environment($1::jsonb) v',[JSON.stringify(before)]);
  expect(sql).toEqual({...s,_hits:hits});expect(hits[0].amount).toBe(expected);s.players[0].shield=0;s.random.bombs=['高唐农场','帝汶岛'];
 }
 relocated(s,0,'r1c2','r1c4');relocated(s,0,'r1c4','r1c2');expect(s.classic!.exposure[0].streak).toBe(0);
 s=place(game(),['r1c1','r2c4','r1c3','r2c8']);s.classic!.poison=[];
 for(let round=1;round<=6;round++){s.round=round;const before=structuredClone(s);refreshClassicRound(s);expect(await q('select ml_private.classic_refresh($1::jsonb) v',[JSON.stringify(before)])).toEqual(s);expect(s.classic!.poison).toHaveLength(Math.min(8,round*2));}
 expect(new Set(s.classic!.poison).size).toBe(8);expect(s.classic!.poison).not.toContain('山洞');
});
it('continues beyond twelve rounds and resolves ordinary environment damage through shield, skills and natural victory',async()=>{
 let s=give(place(game(),['r1c1','r3c1','r3c8','r2c8']),0,0);s.classic!.poison=[];
 for(let round=1;round<=13;round++){
  for(let i=0;i<4;i++){s=await decline(s);s.players.forEach(p=>{p.hp=p.maxHp;p.shield=2;});s.random.bombs=['操场','淘安泽'];s=await step(s,{type:'end'});}
  s=await decline(s);expect(s.phase).not.toBe('over');expect(s.round).toBe(round+1);
 }
 expect(s.round).toBe(14);
});
it('rejects an invalid path tail before saving any water choice; occupied-water timeout returns and charges once',async()=>{
 let s=give(place(game(),['r3c2','r2c4','r1c3','r2c8']),0);s=await step(s,{type:'move'});
 const cmd:Command={id:'bad-tail',revision:s.revision,actor:0,type:'step',path:['r3c3','r1c1']};
 const ts=dispatch(s,cmd,s.time+1);expect(ts.ok).toBe(false);expect(ts.state).toBe(s);expect(await q('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),s.time+1])).toEqual(ts);
 s.players[1].cell='r3c3';s=await step(s,{type:'step',path:['r3c3']} as any);expect(s.choice?.kind).toBe('water-discard');s=await decline(s);
 expect(s.players[0].cell).toBe('r3c3');s=await step(s,{type:'tick'},s.clock.since!+s.clock.remaining);s=await decline(s);
 expect(s.players[0].cell).toBe('r3c2');expect(s.players[0].ap).toBe(5);expect(s.discard).toHaveLength(1);
});
it('playground movement is free at zero AP, cave entry stops and occupied cave never permits transit',async()=>{
 let s=give(place(game(),['r2c4','r3c2','r1c3','r2c8']),0,0);s.players[0].ap=0;s=await step(s,{type:'move'});s=await step(s,{type:'step',path:['r3c4']} as any);s=await step(s,{type:'stop'});expect(s.players[0].ap).toBe(0);
 s=give(place(game(),['r1c8','r3c2','r1c3','r2c7']),0,0);s=await step(s,{type:'move'});s=await step(s,{type:'step',path:['r2c8']} as any);expect(s.movement).toBeNull();expect(s.players[0].ap).toBe(5);
 s=give(place(game(),['r1c8','r3c2','r1c3','r2c8']),0,0);s=await step(s,{type:'move'});expect(legalSteps(s)).not.toContain('r2c8');expect(await q('select ml_private.legal_steps($1::jsonb) v',[JSON.stringify(s)])).toEqual(legalSteps(s));
});
it('closed farm rejects walking and all current teleports while its resident may stay and leave',async()=>{
 let s=give(place(game(),['r2c1','r2c4','r1c3','r2c8']),0,0);s.round=5;s.classic!.farmClosed=true;s=await step(s,{type:'move'});expect(legalSteps(s)).not.toContain('r1c1');expect(await q('select ml_private.legal_steps($1::jsonb) v',[JSON.stringify(s)])).toEqual(legalSteps(s));
 s=give(place(game(),['r1c1','r2c4','r1c3','r2c8']),0,0);s.round=5;s.classic!.farmClosed=true;s=await step(s,{type:'move'});s=await step(s,{type:'step',path:['r2c1']} as any);expect(s.players[0].cell).toBe('r2c1');
 s=give(place(game(),['r1c8','r2c4','r1c3','r2c8']),0,0);s.round=5;s.classic!.farmClosed=true;expect(legalLocations(s,0).ship).not.toContain('r1c1');
});
it('actual round-end environment uses shields, queues injury skills, and settles simultaneous team elimination naturally',async()=>{
 let s=give(place(game(),['r1c1','r2c4','r1c3','r2c8']),0,0);s.active=3;s.cursor=3;s.classic!.poison=[];s.random.bombs=['高唐农场','操场'];s.players[0].shield=1;
 s=await step(s,{type:'end'});expect(s.choice?.kind).toBe('lemon-support');expect(s.players[0].hp).toBe(3);expect(s.players[0].shield).toBe(0);expect(s.players[1].hp).toBe(s.players[1].maxHp-1);expect(s.classic!.exposure[0].streak).toBe(0);s=await decline(s);expect(s.round).toBe(2);
 s=give(place(game(),['r1c1','r2c4','r3c8','r2c8']),0,0);s.mode='team';s.players.forEach((p,i)=>p.team=i<2?'A':'B');s.players[0].hp=1;s.players[1].hp=1;s.active=3;s.cursor=3;s.classic!.poison=[];s.random.bombs=['高唐农场','操场'];
 s=await step(s,{type:'end'});expect(s.phase).toBe('over');expect(s.result?.reason).toBe('natural');expect(s.result?.winners).toEqual([2,3]);expect(s.players[0].eliminated).toBe(s.players[1].eliminated);
});
it('classic real card resolution applies XDF/character priority and inherits unlimited attacks plus immediate sixty-second reset',async()=>{
 let s=give(place(game(),['r2c1','r2c4','r1c3','r2c8']),0,0);
 const cards=runtimeForVersion(s.version).allCards,food=cards.find(c=>c.startsWith('basic-039#'))!,attacks=cards.filter(c=>c.startsWith('basic-003#')).slice(0,3);
 s.players[0].hand=[food,...attacks];s.deck=s.deck.filter(c=>!s.players[0].hand.includes(c));s.players[0].hp=1;s.players[0].attacks=2;
 s=await step(s,{type:'play',card:food,targets:[]} as any,s.time+100);expect(s.players[0].hp).toBe(3);expect(s.clock).toEqual({remaining:60000,since:s.time});
 for(const card of attacks){s=await step(s,{type:'play',card,targets:[1]} as any,s.time+100);expect(s.clock).toEqual({remaining:60000,since:s.time});}
 expect(s.players[0].attacks).toBe(5);expect(s.players[1].ap).toBe(2);
 s=give(place(game(),['r1c1','r2c4','r2c1','r2c8']),2,0);s.active=2;s.cursor=2;s.players[2].hp=1;s.players[2].hand=[food];s.deck=s.deck.filter(c=>c!==food);
 s=await step(s,{type:'play',card:food,targets:[]} as any);expect(s.players[2].hp).toBe(1);
});
