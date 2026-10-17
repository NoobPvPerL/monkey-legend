import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame,dispatch,validateState} from '../../packages/game-core/src/index';
import type {GameState,Command} from '../../packages/game-core/src/types';
const db=await database(undefined,17);afterAll(()=>db.close());await db.exec(await readFile('database/engine/stage4-generated.sql','utf8'));
function fixture(characters:NonNullable<Parameters<typeof createGame>[0]['characters']>=['character-048','character-027','character-026','character-031']){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],characters,first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=20;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};return s;
}
function hand(s:GameState,a:number,...cards:string[]){for(const card of cards){s.deck=s.deck.filter(c=>c!==card);s.discard=s.discard.filter(c=>c!==card);for(const p of s.players)p.hand=p.hand.filter(c=>c!==card);s.players[a].hand.push(card);}validateState(s);}
let serial=0;
async function command(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:'counter-'+(++serial),revision:s.revision,actor:s.active,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=(await db.query<{v:any}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);if(!ok)expect(ts.state).toEqual(s);return ts.state;
}
const choose=(s:GameState,card?:string)=>command(s,{type:'choose',actor:s.choice!.actor,choice:s.choice!.id,card:card??null,accept:false});
const quote=(s:GameState,card:string)=>command(s,{type:'skill',actor:s.choice!.actor,kind:'quote-cost',card});
async function settle(s:GameState){let guard=0;while(s.choice&&guard++<40)s=await choose(s);expect(guard).toBeLessThan(40);return s;}

it('third hand cancels the whole tactic after a private off-turn quote, retaining all paid fees and both entities',async()=>{
 let s=fixture();hand(s,0,'basic-015#01');hand(s,1,'basic-027#01');s.random.dice=[6];
 s=await command(s,{type:'play',card:'basic-015#01',targets:[]});expect(s.choice).toMatchObject({kind:'card-counter',actor:1});
 s=await quote(s,'basic-027#01');s=await choose(s,'basic-027#01');s=await settle(s);
 expect(s.players[0].ap).toBe(20);expect(s.players[1].ap).toBe(18);expect(s.discard).toEqual(['basic-027#01','basic-015#01']);expect(s.cardStack!.stack).toEqual([]);
});
it('countering a counter resumes the original coffee exactly once with three conserved stack entities',async()=>{
 let s=fixture();hand(s,0,'basic-015#01','basic-027#02');hand(s,1,'basic-027#01');s.random.dice=[6,1];
 s=await command(s,{type:'play',card:'basic-015#01',targets:[]});expect(s.choice!.actor).toBe(0);s=await choose(s);
 s=await quote(s,'basic-027#01');s=await choose(s,'basic-027#01');expect(s.choice!.actor).toBe(0);
 s=await quote(s,'basic-027#02');s=await choose(s,'basic-027#02');s=await settle(s);
 expect(s.players[0].ap).toBe(28);expect(s.players[1].ap).toBe(18);expect(s.discard).toEqual(['basic-027#02','basic-027#01','basic-015#01']);
 expect(s.events.filter(e=>e.type==='ap'&&e.text.includes('咖啡'))).toHaveLength(1);validateState(s);
});
it('judge at negative fee grants1AP, cancels the Jianmin card and damages its user',async()=>{
 let s=fixture();hand(s,0,'basic-019#01');hand(s,1,'basic-028#01');s.random.dice=[1];
 s=await command(s,{type:'play',card:'basic-019#01',targets:[2]});s=await quote(s,'basic-028#01');s=await choose(s,'basic-028#01');s=await settle(s);
 expect(s.players[0].ap).toBe(20);expect(s.players[2].ap).toBe(20);expect(s.players[1].ap).toBe(21);expect(s.players[0].hp).toBe(4);
});
it('aloe cancels all food effects and heals the responder, preserving student food immunity',async()=>{
 for(const actor of [1,3]){let s=fixture();s.players[0].hp=1;s.players[actor].hp=1;hand(s,0,'basic-047#01');hand(s,actor,'basic-038#01');
  s=await command(s,{type:'play',card:'basic-047#01',targets:[]});expect(s.choice!.actor).toBe(actor);s=await choose(s,'basic-038#01');s=await settle(s);
  expect(s.players[0].hp).toBe(1);expect(s.players[0].hand).toHaveLength(0);expect(s.players[actor].hp).toBe(actor===1?1:2);
 }
});
it('a role-discounted counter cannot affect Mei, so the original ordinary coffee still resolves',async()=>{
 let s=fixture(['character-026','character-003','character-027','character-031']);hand(s,0,'basic-015#01');hand(s,1,'basic-027#01');s.stage3!.jjFree[1]=true;s.random.dice=[6];
 s=await command(s,{type:'play',card:'basic-015#01',targets:[]});s=await quote(s,'basic-027#01');s=await choose(s,'basic-027#01');s=await settle(s);
 expect(s.players[0].ap).toBe(28);expect(s.players[1].ap).toBe(20);expect(s.cardStack!.stack).toEqual([]);
});
it('all players deliver the requested type without playing it, spending its fee or recording its combo',async()=>{
 let s=fixture();hand(s,0,'basic-011#01','basic-009#01');hand(s,2,'basic-005#01');
 s=await command(s,{type:'play',card:'basic-011#01',targets:[]});expect(s.choice).toMatchObject({kind:'forced-card',actor:0});
 s=await choose(s,'basic-009#01');expect(s.choice).toMatchObject({kind:'forced-card',actor:2});s=await choose(s,'basic-005#01');s=await settle(s);
 expect(s.players.map(p=>p.hp)).toEqual([5,3,4,2]);expect(s.players[0].ap).toBe(18);expect(s.players[2].ap).toBe(20);expect(s.players[0].attacks).toBe(0);
 expect(s.discard).toContain('basic-009#01');expect(s.discard).toContain('basic-005#01');validateState(s);
});
it('a one-card student is excluded at global targeting and keeps the card without taking damage',async()=>{
 let s=fixture();hand(s,0,'basic-011#01');hand(s,1,'basic-007#01');s=await command(s,{type:'play',card:'basic-011#01',targets:[]});s=await settle(s);
 expect(s.players[1].hp).toBe(4);expect(s.players[1].hand).toEqual(['basic-007#01']);
});
it('delivery validates the original tag, refusal and timeout cause damage without normal play effects',async()=>{
 for(const card of ['basic-012#01','basic-014#01']){let s=fixture();hand(s,0,card,'basic-039#01','basic-008#01','basic-046#01');
  s=await command(s,{type:'play',card,targets:[]});expect(s.choice!.kind).toBe('forced-card');
  const wrong=card.startsWith('basic-012')?'basic-039#01':'basic-046#01';await command(s,{type:'choose',actor:s.choice!.actor,choice:s.choice!.id,card:wrong},false);
  const deadline=s.choice!.deadline;s=await command(s,{type:'tick'},true,deadline);s=await settle(s);expect(s.players[0].hp).toBe(4);
 }
});
it('random quotes neither extend response deadlines nor consume additional randomness on retries',async()=>{
 let s=fixture();hand(s,0,'basic-015#01');hand(s,1,'basic-027#01');s.random.dice=[5,1];s=await command(s,{type:'play',card:'basic-015#01',targets:[]});const deadline=s.choice!.deadline;
 s=await quote(s,'basic-027#01');s=await quote(s,'basic-027#01');expect(s.choice!.deadline).toBe(deadline);expect(s.random.dice).toEqual([1]);
 s=await command(s,{type:'tick'},true,deadline);expect(s.players[0].ap).toBe(28);expect(s.players[1].ap).toBe(20);expect(s.choice).toBeNull();
});
it('a responder cannot pay a random price without quoting and other seats cannot steal the response window',async()=>{
 let s=fixture();hand(s,0,'basic-015#01');hand(s,1,'basic-027#01');s=await command(s,{type:'play',card:'basic-015#01',targets:[]});
 await command(s,{type:'choose',actor:1,choice:s.choice!.id,card:'basic-027#01'},false);
 await command(s,{type:'skill',actor:2,kind:'quote-cost',card:'basic-027#01'},false);
 await command(s,{type:'choose',actor:0,choice:s.choice!.id,card:'basic-027#01'},false);
});
