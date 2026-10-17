import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame,dispatch,validateState} from '../../packages/game-core/src/index';
import type {GameState,Command} from '../../packages/game-core/src/types';
const db=await database(undefined,17);afterAll(()=>db.close());await db.exec(await readFile('database/engine/stage4-generated.sql','utf8'));
function fixture(characters:NonNullable<Parameters<typeof createGame>[0]['characters']>=['character-048','character-027','character-026','character-031']){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],characters,first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=50;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};return s;
}
function hand(s:GameState,a:number,...cards:string[]){for(const card of cards){s.deck=s.deck.filter(c=>c!==card);s.discard=s.discard.filter(c=>c!==card);for(const p of s.players)p.hand=p.hand.filter(c=>c!==card);s.players[a].hand.push(card);}validateState(s);}
let serial=0;
async function command(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:'interrupt-'+(++serial),revision:s.revision,actor:s.active,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=(await db.query<{v:any}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);return ts.state;
}
const choose=(s:GameState,card?:string)=>command(s,{type:'choose',actor:s.choice!.actor,choice:s.choice!.id,card:card??null,accept:false,...(s.choice!.kind==='discard'||s.choice!.kind==='water-discard'?{cards:[...s.players[s.choice!.actor].hand].sort().slice(0,s.choice!.count)}:{})});
async function settle(s:GameState){let n=0;while(s.choice&&n++<40)s=await choose(s);expect(n).toBeLessThan(40);return s;}
it('self interrupt ends the old personal turn once, advances one round and never settles the skipped old environment',async()=>{
 let s=fixture();hand(s,0,'basic-017#01');s=await command(s,{type:'play',card:'basic-017#01',targets:[]});s=await settle(s);
 expect(s.round).toBe(2);expect(s.active).toBe(0);expect(s.stage3!.starts[0]).toBe(2);expect(s.stage3!.ends[0]).toBe(1);expect(s.classic!.bombRound).toBe(0);expect(s.stage4!.interruptTurn).toBeNull();expect(s.stage4!.interrupts).toEqual([]);expect(s.players[0].ap).toBe(48);expect(s.players[0].hand).toHaveLength(2);
});
it('an intent submitted during final discard never starts the next old-round player or repeats end choices',async()=>{
 let s=fixture();hand(s,0,'basic-001#01','basic-001#02','basic-003#01','basic-004#01','basic-005#01','basic-039#01');hand(s,2,'basic-017#01');s=await command(s,{type:'end'});expect(s.choice).toMatchObject({kind:'discard',actor:0,count:1});
 s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});s=await choose(s);s=await settle(s);expect(s.round).toBe(2);expect(s.active).toBe(2);expect(s.stage3!.ends[0]).toBe(1);expect(s.stage3!.starts[1]).toBe(0);expect(s.events.filter(e=>e.type==='choice'&&e.text.endsWith('discard'))).toHaveLength(1);
});
it('a countered intent during closing discard resumes the original handoff rather than reopening the old action',async()=>{
 let s=fixture();hand(s,0,'basic-001#01','basic-001#02','basic-003#01','basic-004#01','basic-005#01','basic-039#01');hand(s,2,'basic-017#01');hand(s,1,'basic-027#01');s=await command(s,{type:'end'});s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});s=await choose(s);expect(s.choice).toMatchObject({kind:'card-counter',actor:1});s.random.dice=[1];s=await command(s,{type:'skill',kind:'quote-cost',actor:1,card:'basic-027#01'});s=await choose(s,'basic-027#01');s=await settle(s);expect(s.round).toBe(1);expect(s.active).toBe(1);expect(s.stage3!.ends[0]).toBe(1);expect(s.stage3!.starts[1]).toBe(1);
});
it('end-draw interruption completes that old end exactly once and skips unstarted old turns',async()=>{
 let s=fixture(['character-027','character-048','character-026','character-031']);hand(s,2,'basic-017#01');s=await command(s,{type:'end'});expect(s.choice).toMatchObject({kind:'draw-end',actor:0});s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});s=await choose(s);s=await settle(s);expect(s.active).toBe(2);expect(s.round).toBe(2);expect(s.stage3!.ends[0]).toBe(1);expect(s.stage3!.starts[1]).toBe(0);expect(s.events.filter(e=>e.type==='choice'&&e.text.endsWith('draw-end'))).toHaveLength(1);
});
it('a late intent in an already executing environment chain does not settle the last personal end twice',async()=>{
 let s=fixture();s.active=3;s.cursor=3;s.stage3!.starts[3]=1;s.players[3].cell='r1c1';s.random.bombs=['高唐农场','帝汶岛'];hand(s,2,'basic-017#01');s=await command(s,{type:'end'});expect(s.choice).toMatchObject({kind:'runner-roll',actor:3});expect(s.stage3!.ends[3]).toBe(1);s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});s=await choose(s);s=await settle(s);expect(s.active).toBe(2);expect(s.round).toBe(2);expect(s.stage3!.ends[3]).toBe(1);expect(s.classic!.bombRound).toBe(1);expect(s.stage4!.interruptSkipEnd).toBe(false);
});
it('another player interrupts a walked movement with exactly one final movement payment and a rotated first player',async()=>{
 let s=fixture();hand(s,2,'basic-017#01');s.random.dice=[6];s=await command(s,{type:'move'});s=await command(s,{type:'step',path:['r2c2']});
 s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});s=await settle(s);
 expect(s.round).toBe(2);expect(s.active).toBe(2);expect(s.order).toEqual([2,3,0,1]);expect(s.movement).toBeNull();expect(s.players[0].ap).toBe(49);expect(s.events.filter(e=>e.type==='cost'&&e.text.includes('移动结束支付'))).toHaveLength(1);
});
it('reserves during an outstanding defense without resetting its deadline, then starts after the complete parent chain',async()=>{
 let s=fixture();hand(s,0,'basic-007#01');hand(s,1,'basic-001#01');hand(s,2,'basic-017#01');s=await command(s,{type:'play',card:'basic-007#01',targets:[1]});const choice=structuredClone(s.choice);
 s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});expect(s.choice).toEqual(choice);expect(s.stage4!.interrupts).toHaveLength(1);expect(s.cardStack!.stack[0].definition).toBe('basic-007');
 s=await choose(s,'basic-001#01');s=await settle(s);expect(s.players[1].hp).toBe(4);expect(s.round).toBe(2);expect(s.active).toBe(2);expect(s.discard.indexOf('basic-007#01')).toBeLessThan(s.discard.indexOf('basic-017#01'));
});
it('a countered interrupt restores the unfinished movement and its original clock instead of opening a new round',async()=>{
 let s=fixture();hand(s,2,'basic-017#01');hand(s,1,'basic-027#01');s.random.dice=[6,1];s=await command(s,{type:'move'});s=await command(s,{type:'step',path:['r2c2']});
 s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});expect(s.choice!.kind).toBe('card-counter');
 s=await command(s,{type:'skill',actor:1,kind:'quote-cost',card:'basic-027#01'});s=await choose(s,'basic-027#01');s=await settle(s);
 expect(s.round).toBe(1);expect(s.active).toBe(0);expect(s.phase).toBe('moving');expect(s.movement!.path).toEqual(['r1c2','r2c2']);expect(s.clock.remaining).toBeLessThan(60000);expect(s.players[2].ap).toBe(48);
 s=await command(s,{type:'stop'});expect(s.players[0].ap).toBe(49);
});
it('two queued intents retain transaction order, each makes exactly one new round and no old environment',async()=>{
 let s=fixture();hand(s,0,'basic-007#01');hand(s,1,'basic-001#01');hand(s,2,'basic-017#01');hand(s,3,'basic-017#02');s=await command(s,{type:'play',card:'basic-007#01',targets:[1]});
 s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});s=await command(s,{type:'play',actor:3,card:'basic-017#02',targets:[]});expect(s.stage4!.interrupts.map(i=>i.actor)).toEqual([2,3]);
 s=await choose(s,'basic-001#01');s=await settle(s);expect(s.round).toBe(3);expect(s.active).toBe(3);expect(s.classic!.poison).toHaveLength(6);expect(s.classic!.bombRound).toBe(0);expect(s.stage3!.ends[2]).toBe(1);validateState(s);
});
it('an owner killed by the parent chain cannot activate its reserved intent and its entity is discarded exactly once',async()=>{
 let s=fixture();s.players[2].hp=2;hand(s,0,'basic-007#01');hand(s,2,'basic-001#01','basic-017#01');s=await command(s,{type:'play',card:'basic-007#01',targets:[2]});s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});
 s=await choose(s);s=await settle(s);expect(s.players[2].hp).toBe(0);expect(s.round).toBe(1);expect(s.stage4!.interrupts).toEqual([]);expect(s.discard.filter(c=>c==='basic-017#01')).toHaveLength(1);expect(s.events.some(e=>e.type==='interrupt-expired')).toBe(true);
});
it('the active player cannot spend the AP reserved for a walked movement on an interrupt',async()=>{
 let s=fixture();hand(s,0,'basic-017#01');s.players[0].ap=2;s.random.dice=[6];s=await command(s,{type:'move'});s=await command(s,{type:'step',path:['r2c2']});await command(s,{type:'play',card:'basic-017#01',targets:[]},false);
 expect(s.players[0].ap).toBe(2);expect(s.players[0].hand).toContain('basic-017#01');
});
it('a last-AP response during movement cannot leave the game stuck when the interrupt is countered',async()=>{
 let s=fixture();s.players[0].ap=1;hand(s,0,'basic-027#01');hand(s,2,'basic-017#01');s.random.dice=[6,3];s=await command(s,{type:'move'});s=await command(s,{type:'step',path:['r2c2']});
 s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});s=await command(s,{type:'skill',kind:'quote-cost',card:'basic-027#01'});s=await choose(s,'basic-027#01');s=await settle(s);expect(s.phase).toBe('moving');expect(s.players[0].ap).toBe(0);
 s=await command(s,{type:'stop'});expect(s.phase).toBe('action');expect(s.players[0].ap).toBe(0);expect(s.events.some(e=>e.text.includes('移动结束支付0AP'))).toBe(true);
});
it('a defense deadline processes the queued intent once and starts the fresh turn with its own budget',async()=>{
 let s=fixture();hand(s,0,'basic-007#01');hand(s,1,'basic-001#01');hand(s,2,'basic-017#01');s=await command(s,{type:'play',card:'basic-007#01',targets:[1]});s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});
 s=await command(s,{type:'tick'},true,s.choice!.deadline);s=await settle(s);expect(s.round).toBe(2);expect(s.active).toBe(2);expect(s.clock.remaining).toBe(60000);expect(s.events.filter(e=>e.type==='interrupt')).toHaveLength(1);
});
it('natural victory after the parent chain discards all queued intents instead of keeping an unplayable resolving card',async()=>{
 let s=fixture();for(const a of [1,3])Object.assign(s.players[a],{hp:0,ap:0,shield:0,eliminated:1});s.players[2].hp=2;
 hand(s,0,'basic-007#01');hand(s,2,'basic-001#01','basic-017#01');s=await command(s,{type:'play',card:'basic-007#01',targets:[2]});s=await command(s,{type:'play',actor:2,card:'basic-017#01',targets:[]});s=await choose(s);
 expect(s.phase).toBe('over');expect(s.result!.winners).toEqual([0]);expect(s.stage4!.interrupts).toEqual([]);expect(s.resolving).toEqual([]);expect(s.discard.filter(c=>c==='basic-017#01')).toHaveLength(1);validateState(s);
});
