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
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=50;}
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
it('flight pays normal plus1AP, consumes one basic move and never rolls or resets the action clock',async()=>{
 let s=fixture();gear(s,0,'basic-074#01');s.random.dice=[6];const since=s.clock.since;s=await command(s,{type:'skill',kind:'flight',cell:'r4c8'});expect(s.players[0].cell).toBe('r4c8');expect(s.players[0].ap).toBe(48);expect(s.random.dice).toEqual([6]);expect(s.players[0].moved).toBe(true);expect(s.stage3!.basicUsed[0]).toBe(1);expect(s.clock.since).toBe(since);await command(s,{type:'skill',kind:'flight',cell:'r1c1'},false);
});
it('flight from playground still pays1 extra, rejects occupied/closed cells and insufficient AP',async()=>{
 let s=fixture();gear(s,0,'basic-074#01');s.players[0].cell='r3c4';s.players[0].ap=0;await command(s,{type:'skill',kind:'flight',cell:'r1c1'},false);s.players[0].ap=1;
 await command(s,{type:'skill',kind:'flight',cell:s.players[1].cell},false);s.classic!.farmClosed=true;await command(s,{type:'skill',kind:'flight',cell:'r1c1'},false);s.classic!.farmClosed=false;
 s=await command(s,{type:'skill',kind:'flight',cell:'r1c1'});expect(s.players[0].ap).toBe(0);expect(s.players[0].cell).toBe('r1c1');
});
it('flight water arrival keeps entry discard and Bob can use the copied ability',async()=>{
 let s=fixture();gear(s,1,'basic-074#01');hand(s,0,'basic-073#01','basic-039#01');s=await play(s,'basic-073#01',{copy:'basic-074#01'});s=await command(s,{type:'skill',kind:'flight',cell:'r3c3'});expect(s.choice).toMatchObject({kind:'water-discard',actor:0});s=await choose(s,{cards:['basic-039#01']});expect(s.players[0].cell).toBe('r3c3');expect(s.discard).toContain('basic-039#01');
});
it('watch records only equipped starts, returns to the preceding start and is once per personal turn',async()=>{
 let s=fixture();hand(s,0,'basic-060#01');s=await play(s,'basic-060#01');await command(s,{type:'skill',kind:'watch'},false);
 for(let turn=0;turn<8;turn++){s=await command(s,{type:'end'});s=await settle(s);if(turn===3){expect(s.active).toBe(0);s.players[0].cell='r1c4';}}
 expect(s.active).toBe(0);expect(s.stage4!.watches['basic-060#01']).toMatchObject({current:'r1c4',previous:'r1c2'});
 const ap=s.players[0].ap;s=await command(s,{type:'skill',kind:'watch'});expect(s.players[0].cell).toBe('r1c2');expect(s.players[0].ap).toBe(ap);await command(s,{type:'skill',kind:'watch'},false);
});
it('watch cannot enter an occupied old start or ignore a movement prohibition',async()=>{
 let s=fixture();gear(s,0,'basic-060#01');s.stage4!.watches['basic-060#01']={current:'r1c2',previous:'r1c3',usedTurn:null};await command(s,{type:'skill',kind:'watch'},false);
 s.stage4!.watches['basic-060#01'].previous='r1c1';s.stage4!.tongBlocked[0]={origin:'equipment',actor:1,faction:s.players[1].faction,roleModifiers:[]};await command(s,{type:'skill',kind:'watch'},false);
});
it('gift transfers an exact selected set at0AP without resetting60 seconds or consuming movement',async()=>{
 let s=fixture();gear(s,0,'basic-075#01');hand(s,0,'basic-039#01','basic-007#01','basic-045#01');s.players[0].ap=0;const clock={...s.clock};s=await command(s,{type:'skill',kind:'gift',target:1,cards:['basic-039#01','basic-007#01']});expect(s.players[1].hand).toEqual(['basic-039#01','basic-007#01']);expect(s.players[0].hand).toEqual(['basic-045#01']);expect(s.clock).toEqual(clock);expect(s.players[0].moved).toBe(false);
 s=await command(s,{type:'skill',kind:'gift',target:2,cards:['basic-045#01']});expect(s.players[2].hand).toEqual(['basic-045#01']);
});
it('gift is permitted during a movement lock and promptly opens Xiao overflow',async()=>{
 let s=fixture(['character-048','character-027','character-043','character-031']);gear(s,0,'basic-075#01');s.stage4!.tongBlocked[0]={origin:'equipment',actor:1,faction:s.players[1].faction,roleModifiers:[]};s.players[1].hp=1;hand(s,0,'basic-039#01','basic-007#01');s=await command(s,{type:'skill',kind:'gift',target:1,cards:['basic-039#01','basic-007#01']});expect(s.choice).toMatchObject({kind:'xiao-overflow',actor:1,count:1});s=await choose(s,{cards:['basic-039#01']});expect(s.players[2].hand).toContain('basic-039#01');
});
it('gift rejects duplicate, nonhand, self, offmap and malformed commands without mutations',async()=>{
 let s=fixture();gear(s,0,'basic-075#01');hand(s,0,'basic-039#01');
 for(const fields of [{target:1,cards:[]},{target:1,cards:['basic-039#01','basic-039#01']},{target:1,cards:['basic-075#01']},{target:0,cards:['basic-039#01']},{target:1,cards:'basic-039#01'},{target:1,cards:['basic-039#01'],cell:{}}])await command(s,{type:'skill',kind:'gift',...fields},false);
 s.stage4!.offMap[1]=true;await command(s,{type:'skill',kind:'gift',target:1,cards:['basic-039#01']},false);
});
