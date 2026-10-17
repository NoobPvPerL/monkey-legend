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
it('Tang preference can change off-turn during a choice without resetting either deadline',async()=>{
 let s=fixture(['character-048','character-002','character-026','character-031']);gear(s,1,'basic-069#01');hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[1]});const deadline=s.choice!.deadline,clock={...s.clock};
 s=await command(s,{type:'skill',kind:'terrain',actor:1,accept:true});expect(s.choice!.deadline).toBe(deadline);expect(s.clock).toEqual(clock);expect(s.stage4!.terrainIgnore[1]).toBe(true);await command(s,{type:'skill',kind:'terrain',actor:0,accept:true},false);s=await choose(s);expect(s.players[1].hp).toBe(2);
});
it('Tang ignores classroom card bans only when explicitly selected and can restore them',async()=>{
 let s=fixture();gear(s,0,'basic-069#01');hand(s,0,'basic-009#01','basic-009#02');await command(s,{type:'play',card:'basic-009#01',targets:[1]},false);s=await command(s,{type:'skill',kind:'terrain',accept:true});s.random.dice=[5];s=await play(s,'basic-009#01',{targets:[1]});expect(s.players[1].hp).toBe(3);s=await command(s,{type:'skill',kind:'terrain',accept:false});await command(s,{type:'play',card:'basic-009#02',targets:[1]},false);
});
it('ignoring playground free movement costs1 and water costs one step with no discard',async()=>{
 let s=fixture();gear(s,0,'basic-069#01');s.players[0].cell='r3c4';hand(s,0,'basic-039#01');s=await command(s,{type:'skill',kind:'terrain',accept:true});s.random.dice=[2];s=await command(s,{type:'move'});expect(s.movement!.costDue).toBe(true);s=await command(s,{type:'step',path:['r3c3']});expect(s.phase).toBe('action');expect(s.players[0].ap).toBe(49);expect(s.players[0].hand).toContain('basic-039#01');expect(s.choice).toBeNull();
});
it('Tang can walk through the cave without its stopping effect, but not through occupancy or a closed farm',async()=>{
 let s=fixture();gear(s,0,'basic-069#01');s.players[0].cell='r2c7';s=await command(s,{type:'skill',kind:'terrain',accept:true});s.random.dice=[4];s=await command(s,{type:'move'});s=await command(s,{type:'step',path:['r2c8','r1c8']});expect(s.players[0].cell).toBe('r1c8');expect(s.phase).toBe('action');
 s.players[0].moved=false;s.stage3!.basicUsed[0]=0;s.classic!.farmClosed=true;s.players[0].cell='r1c2';s.random.dice=[2];s=await command(s,{type:'move'});await command(s,{type:'step',path:['r1c1']},false);
});
it('ignoring cave location skips its third-end wildman cost while resetting the3-turn counter',async()=>{
 let s=fixture();gear(s,0,'basic-069#01');s.players[0].cell='r2c8';s.classic!.caveEnds![0]=2;const hp=s.players[0].hp;s=await command(s,{type:'skill',kind:'terrain',accept:true});s=await command(s,{type:'end'});s=await settle(s);expect(s.players[0].hp).toBe(hp);expect(s.players[0].ap).toBe(50);expect(s.classic!.caveEnds![0]).toBe(0);
});
it('Tang can decline farm extra draw and campus AP without removing the runner role minimum',async()=>{
 for(const ignore of [true,false]){let s=fixture();gear(s,0,'basic-069#01');s.players[0].cell='r1c1';s=await command(s,{type:'skill',kind:'terrain',accept:ignore});activate(s,3);s=await command(s,{type:'end'});s=await settle(s);expect(s.active).toBe(0);expect(s.players[0].hand).toHaveLength(ignore?2:3);}
 for(const ignore of [true,false]){let s=fixture(['character-031','character-027','character-026','character-048']);gear(s,0,'basic-069#01');s.players[0].cell='r1c6';s.players[0].ap=2;s=await command(s,{type:'skill',kind:'terrain',accept:ignore});activate(s,3);s=await command(s,{type:'end'});s=await settle(s);expect(s.players[0].ap).toBe(ignore?6:7);}
});
it('ignoring XDF removes only its food bonus and never the character food-healing restriction',async()=>{
 for(const ignore of [true,false]){let s=fixture();gear(s,0,'basic-069#01');s.players[0].cell='r2c1';s.players[0].hp=1;hand(s,0,'basic-039#01');s=await command(s,{type:'skill',kind:'terrain',accept:ignore});s=await play(s,'basic-039#01');expect(s.players[0].hp).toBe(ignore?2:3);}
 let s=fixture();gear(s,1,'basic-069#01');s.players[1].cell='r2c1';s.players[1].hp=1;activate(s,1);hand(s,1,'basic-039#01');s=await command(s,{type:'skill',kind:'terrain',accept:true});s=await play(s,'basic-039#01');expect(s.players[1].hp).toBe(1);
});
it('office exemption is snapshotted at card commit even if Tang toggles while the card waits',async()=>{
 let s=fixture(['character-048','character-002','character-026','character-031']);gear(s,1,'basic-069#01');s.players[1].cell='r4c4';hand(s,0,'basic-018#01','basic-018#02');s=await play(s,'basic-018#01',{targets:[1]});s=await command(s,{type:'skill',kind:'terrain',actor:1,accept:true});s=await choose(s);expect(s.stage4!.downPending[1]).toBe(false);
 s=await play(s,'basic-018#02',{targets:[1]});s=await choose(s);expect(s.stage4!.downPending[1]).toBe(true);
});
it('a role-modified Tang ignore effect does not bypass Meis highest immunity',async()=>{
 let s=fixture();gear(s,0,'basic-069#01');s.stage3!.equipmentSources['basic-069#01'].roleModifiers=[{actor:0,kind:'cost'}];s.players[2].cell='r2c3';hand(s,0,'basic-009#01');s=await command(s,{type:'skill',kind:'terrain',accept:true});const hp=s.players[2].hp;s.random.dice=[5];s=await play(s,'basic-009#01',{targets:[2]});expect(s.players[2].hp).toBe(hp);expect(s.random.dice).toEqual([5]);
});
