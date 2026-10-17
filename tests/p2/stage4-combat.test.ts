import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame,dispatch,validateState,legalTargets,legalSteps} from '../../packages/game-core/src/index';
import {STAGE4_CARDS} from '../../packages/game-data/src/stage4';
import * as resources from '../../packages/game-core/src/stage3-resources';
import type {GameState,Command} from '../../packages/game-core/src/types';
const db=await database(undefined,17);afterAll(()=>db.close());await db.exec(await readFile('database/engine/stage4-generated.sql','utf8'));
function fixture(characters:NonNullable<Parameters<typeof createGame>[0]['characters']>=['character-048','character-027','character-026','character-031']){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],characters,first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c1','r1c2','r2c4','r2c5'][p.seat];p.ap=50;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};return s;
}
function take(s:GameState,card:string){s.deck=s.deck.filter(c=>c!==card);s.discard=s.discard.filter(c=>c!==card);for(const p of s.players)p.hand=p.hand.filter(c=>c!==card);}
function hand(s:GameState,a:number,...cards:string[]){for(const card of cards){take(s,card);s.players[a].hand.push(card);}validateState(s);}
function gear(s:GameState,a:number,card:string,durability?:number){take(s,card);s.stage3!.equipment[a].push(card);s.stage3!.equipmentSources[card]={origin:'equipment',actor:a,faction:s.players[a].faction,roleModifiers:[]};if(durability!==undefined)s.stage4!.durability[card]=durability;validateState(s);}
function activate(s:GameState,a:number){s.active=a;s.cursor=s.order.indexOf(a);s.clock={remaining:60000,since:s.time};}
let serial=0;
async function command(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:'gear-'+(++serial),revision:s.revision,actor:s.active,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=(await db.query<{v:any}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);validateState(ts.state);return ts.state;
}
async function play(s:GameState,card:string,fields:Record<string,unknown>={}){
 const cost=STAGE4_CARDS[card.split('#')[0] as keyof typeof STAGE4_CARDS].cost;
 if(cost.kind==='die'||cost.kind==='tiers')s=await command(s,{type:'skill',kind:'quote-cost',card});
 return command(s,{type:'play',card,targets:[],...fields});
}
async function choose(s:GameState,fields:Record<string,unknown>={}){return command(s,{type:'choose',actor:s.choice!.actor,choice:s.choice!.id,accept:false,...fields});}
async function settle(s:GameState){let n=0;while(s.choice&&n++<100){const c=s.choice;s=await choose(s,c.kind==='discard'||c.kind==='water-discard'?{cards:[...s.players[c.actor].hand].sort().slice(0,c.count)}:{});}expect(n).toBeLessThan(100);return s;}
it('medical note bypasses shields but preserves glasses and potato caps',async()=>{
 for(const glasses of [false,true]){let s=fixture();gear(s,0,'basic-053#01');if(glasses)gear(s,1,'basic-059#01');s.players[1].shield=2;hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[1]});s=await settle(s);
  expect(s.players[1].shield).toBe(2);expect(s.players[1].hp).toBe(glasses?3:2);expect(s.events.find(e=>e.type==='damage')!.data).toMatchObject({trueDamage:true,blocked:0});
 }
 let s=fixture(['character-048','character-037','character-026','character-031']);gear(s,0,'basic-053#01');s.players[1].shield=2;const hp=s.players[1].hp;hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[1]});s=await settle(s);expect(s.players[1].hp).toBe(hp-1);expect(s.players[1].shield).toBe(2);
});
it('a foreign role modifier on an attack weapon invalidates the entire attack against Mei',async()=>{
 let s=fixture();gear(s,0,'basic-053#01');s.stage3!.equipmentSources['basic-053#01'].roleModifiers=[{actor:0,kind:'cost'}];s.players[2].cell='r2c1';const hp=s.players[2].hp;hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[2]});s=await settle(s);expect(s.players[2].hp).toBe(hp);
});
it('Wuyi blocks two normal hits without spending shield, breaks once, then allows damage',async()=>{
 let s=fixture();gear(s,1,'basic-070#01',2);s.players[1].shield=1;hand(s,0,'basic-007#01','basic-007#02','basic-006#01');
 for(const card of ['basic-007#01','basic-007#02']){s=await play(s,card,{targets:[1]});expect(s.players[1].hp).toBe(4);expect(s.players[1].shield).toBe(1);}
 expect(s.stage3!.equipment[1]).toEqual([]);expect(s.discard.filter(c=>c==='basic-070#01')).toHaveLength(1);s.random.dice=[5];s.players[0].cell='r1c3';s=await play(s,'basic-006#01',{targets:[1]});expect(s.players[1].shield).toBe(0);
});
it('true damage bypasses only shields and does not bypass Wuyi immunity or steal its HP',async()=>{
 let s=fixture();gear(s,0,'basic-053#01');gear(s,1,'basic-070#01',2);hand(s,0,'basic-007#01','basic-006#01');s=await play(s,'basic-007#01',{targets:[1]});expect(s.players[1].hp).toBe(4);expect(s.stage4!.durability['basic-070#01']).toBe(1);
 s.players[0].hp=1;s.random.dice=[5];s.players[0].cell='r1c3';s=await play(s,'basic-006#01',{targets:[1]});expect(s.players[1].hp).toBe(4);expect(s.players[0].hp).toBe(1);expect(s.discard).toContain('basic-070#01');
});
it('cloak runs only after a hit and an odd accepted roll cancels damage and its equipment descendants',async()=>{
 let s=fixture();gear(s,0,'basic-052#01');gear(s,1,'basic-049#01');hand(s,0,'basic-009#01');s.random.dice=[5,3];s=await play(s,'basic-009#01',{targets:[1]});expect(s.choice!.kind).toBe('gear-cloak');s=await choose(s,{accept:true});expect(s.players[1].hp).toBe(4);expect(s.choice).toBeNull();expect(s.events.filter(e=>e.type==='damage')).toHaveLength(0);
});
it('cloak cannot stop Gao Yutao; rolls1–5 hit and6 misses unless rice topping guarantees the hit',async()=>{
 for(const roll of [1,5,6]){let s=fixture();gear(s,0,'basic-056#01');gear(s,1,'basic-049#01');hand(s,0,'basic-009#01');s.random.dice=[roll];s=await play(s,'basic-009#01',{targets:[1]});expect(s.players[1].hp).toBe(roll===6?4:3);expect(s.choice).toBeNull();}
 let s=fixture();gear(s,0,'basic-056#01');gear(s,1,'basic-049#01');s.stage4!.dodge[0]=true;hand(s,0,'basic-009#01');s.random.dice=[6];s=await play(s,'basic-009#01',{targets:[1]});expect(s.players[1].hp).toBe(2);expect(s.random.dice).toEqual([6]);
});
it('cloak timeout skips the attempt without consuming a die and damage proceeds once',async()=>{
 let s=fixture();gear(s,1,'basic-049#01');hand(s,0,'basic-009#01');s.random.dice=[5,3];s=await play(s,'basic-009#01',{targets:[1]});s=await command(s,{type:'tick'},true,s.choice!.deadline);expect(s.players[1].hp).toBe(3);expect(s.random.dice).toEqual([3]);
});
it('reflection consumes exactly3 accepted triggers, breaks, and never recursively reflects',async()=>{
 let s=fixture(['character-037','character-027','character-026','character-031']);gear(s,0,'basic-051#01',3);gear(s,1,'basic-051#02',3);hand(s,0,'basic-010#01','basic-010#02','basic-009#01');const hp=s.players[0].hp;
 for(const card of ['basic-010#01','basic-010#02','basic-009#01']){s.random.dice=[5];s=await play(s,card,{targets:[1]});expect(s.choice!.kind).toBe('gear-reflect');s=await choose(s,{accept:true});s=await settle(s);}
 expect(s.players[0].hp).toBe(hp-3);expect(s.stage4!.durability['basic-051#01']).toBe(3);expect(s.stage3!.equipment[1]).not.toContain('basic-051#02');expect(s.discard.filter(c=>c==='basic-051#02')).toHaveLength(1);
});
it('shield-only hits create no reflection, chalk, plant or sugar trigger',async()=>{
 let s=fixture();gear(s,0,'basic-052#01');gear(s,0,'basic-055#01');gear(s,1,'basic-051#01',3);gear(s,0,'basic-061#01');s.players[1].shield=2;hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[1]});expect(s.choice).toBeNull();expect(s.players[1].ap).toBe(50);expect(s.stage4!.gearMarks).toEqual({});
});
it('chalk offers one paid extra hit per original card without retriggering its own offer',async()=>{
 let s=fixture();gear(s,0,'basic-052#01');hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[1]});expect(s.choice!.kind).toBe('gear-chalk');const ap=s.players[0].ap;s=await choose(s,{accept:true});expect(s.players[1].hp).toBe(1);expect(s.players[0].ap).toBe(ap-1);expect(s.choice).toBeNull();
});
it('sugar charges each actual opponent once per root even when chalk adds another injury',async()=>{
 let s=fixture();gear(s,0,'basic-052#01');gear(s,0,'basic-055#01');gear(s,1,'basic-055#02');hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[1]});expect(s.players[1].ap).toBe(49);expect(s.players[0].ap).toBe(47);s=await choose(s,{accept:true});expect(s.players[1].ap).toBe(49);expect(s.players[0].ap).toBe(46);
});
it('plant offers legal cloud or farm cells after actual injury and the forced teleport resolves water/terrain',async()=>{
 let s=fixture();gear(s,0,'basic-061#01');hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[1]});expect(s.choice!.kind).toBe('gear-plant');expect(s.choice!.cells).toContain('r4c8');s=await choose(s,{cell:'r4c8'});expect(s.players[1].cell).toBe('r4c8');expect(s.players[1].ap).toBe(50);expect(s.choice).toBeNull();
});
it('Tong blocks the next personal turn voluntary movement even without a mount, then expires',async()=>{
 let s=fixture();gear(s,0,'basic-062#01');hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[1]});s=await command(s,{type:'end'});s=await settle(s);expect(s.active).toBe(1);expect(resources.mountMovementBlocked(s as GameState&resources.ResourceState,1)).toBe(true);await command(s,{type:'move'},false);
 for(let i=0;i<4;i++){s=await command(s,{type:'end'});s=await settle(s);}expect(s.active).toBe(1);expect(resources.mountMovementBlocked(s as GameState&resources.ResourceState,1)).toBe(false);
});
it('range headgear adds exactly one region edge to card attacks without making global roles wider',async()=>{
 let s=fixture();s.players[0].cell='r1c1';s.players[1].cell='r2c4';s.players[2].cell='r4c8';hand(s,0,'basic-007#01');expect(legalTargets(s,0,'basic-007#01')).not.toContain(1);gear(s,0,'basic-058#01');expect(legalTargets(s,0,'basic-007#01')).toContain(1);expect(legalTargets(s,0,'basic-007#01')).not.toContain(2);s=await play(s,'basic-007#01',{targets:[1]});expect(s.players[1].hp).toBe(2);
});

it('explicit direct HP penalties bypass Wuyi without spending its durability, while oil remains normal damage',async()=>{
 for(const card of ['basic-011#01','basic-012#01','basic-014#01']){
  let s=fixture();gear(s,1,'basic-070#01',2);hand(s,0,card);
  s=await play(s,card);s=await settle(s);expect(s.players[1].hp).toBe(3);expect(s.stage4!.durability['basic-070#01']).toBe(2);
  expect(s.events.some(e=>e.type==='damage'&&(e.data as any).target===1&&(e.data as any).directHp===true)).toBe(true);
 }
 let s=fixture();gear(s,0,'basic-070#01',2);hand(s,0,'basic-048#01');s.random.dice=[6];const hp=s.players[0].hp;s=await play(s,'basic-048#01');s=await settle(s);expect(s.players[0].hp).toBe(hp);expect(s.stage4!.durability['basic-070#01']).toBe(1);
});
