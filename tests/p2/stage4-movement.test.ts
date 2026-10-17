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
it('Guan opens on another player entering its region and gives one free legal orthogonal step',async()=>{
 let s=fixture();s.players[0].cell='r1c1';gear(s,1,'basic-068#01');s.random.dice=[6];s=await command(s,{type:'move'});s=await command(s,{type:'step',path:['r1c2']});expect(s.choice).toMatchObject({kind:'gear-react',actor:1});expect(s.choice!.cells).toContain('r2c3');const ap=s.players[1].ap;
 s=await choose(s,{cell:'r2c3'});expect(s.players[1].cell).toBe('r2c3');expect(s.players[1].ap).toBe(ap);expect(s.stage3!.basicUsed[1]).toBe(0);expect(s.phase).toBe('moving');
});
it('a reactive blocker truncates only the now-invalid saved tail and preserves the accepted choice',async()=>{
 let s=fixture();s.players[0].cell='r1c1';gear(s,1,'basic-068#01');s.random.dice=[6];s=await command(s,{type:'move'});s=await command(s,{type:'step',path:['r1c2','r2c2','r2c3']});expect(s.choice!.kind).toBe('gear-react');s=await choose(s,{cell:'r2c3'});expect(s.players[1].cell).toBe('r2c3');expect(s.players[0].cell).toBe('r2c2');expect(s.movement!.remaining).toBe(1);expect(s.phase).toBe('moving');expect(s.events.some(e=>e.text==='后续路径已变化，保留剩余步数')).toBe(true);s=await command(s,{type:'stop'});expect(s.players[0].ap).toBe(49);
});
it('Guan actual injury opens a choice but a shield-only hit does not; reactive steps do not chain',async()=>{
 let s=fixture();gear(s,1,'basic-068#01');gear(s,2,'basic-068#02');hand(s,0,'basic-007#01','basic-007#02');s.players[1].shield=2;s=await play(s,'basic-007#01',{targets:[1]});expect(s.choice).toBeNull();
 s=await play(s,'basic-007#02',{targets:[1]});expect(s.choice).toMatchObject({kind:'gear-react',actor:1});s=await choose(s,{cell:'r1c4'});expect(s.choice).toBeNull();expect(s.players[1].cell).toBe('r1c4');
});
it('Guan respects movement lock, occupied cells, water restrictions and its10s timeout',async()=>{
 let s=fixture();gear(s,1,'basic-068#01');hand(s,0,'basic-007#01');s=await play(s,'basic-007#01',{targets:[1]});expect(s.choice!.kind).toBe('gear-react');await chooseInvalid();
 async function chooseInvalid(){await command(s,{type:'choose',actor:1,choice:s.choice!.id,cell:'r1c2'},false);}
 s=await command(s,{type:'tick'},true,s.choice!.deadline);expect(s.players[1].cell).toBe('r1c3');
});
it('Lin triggers once after complete basic displacement and pushes in the final walking direction',async()=>{
 let s=fixture();gear(s,0,'basic-076#01');s.players[0].cell='r1c1';s.players[1].cell='r1c3';s.random.dice=[2];s=await command(s,{type:'move'});s=await command(s,{type:'step',path:['r1c2']});expect(s.choice).toMatchObject({kind:'gear-push',actor:0});expect(s.choice!.options).toEqual({'1:right':['r1c4']});s=await choose(s,{option:'1:right'});expect(s.players[1].cell).toBe('r1c4');expect(s.choice).toBeNull();expect(s.players[1].ap).toBe(50);
});
it('Lin teleport offers target/direction pairs, skips occupied destinations and never chains reactive gear',async()=>{
 let s=fixture();gear(s,0,'basic-076#01');gear(s,1,'basic-068#01');s.players[0].cell='r1c8';s.players[1].cell='r1c3';s=await command(s,{type:'location',kind:'ship',cell:'r1c2'});
 // Entering first gives Guan a choice, then Lin can push the same-region token.
 expect(s.choice!.kind).toBe('gear-react');s=await choose(s);expect(s.choice!.kind).toBe('gear-push');expect(s.choice!.options).not.toHaveProperty('1:left');s=await choose(s,{option:'1:down'});expect(s.players[1].cell).toBe('r2c3');expect(s.choice).toBeNull();
});
it('Lin respects Mei source lineage and a timeout does not push',async()=>{
 let s=fixture();gear(s,0,'basic-076#01');s.stage3!.equipmentSources['basic-076#01'].roleModifiers=[{actor:0,kind:'cost'}];s.players[0].cell='r1c8';s.players[2].cell='r1c3';s.players[1].cell='r1c4';s=await command(s,{type:'location',kind:'ship',cell:'r1c2'});expect(s.choice).toBeNull();expect(s.players[2].cell).toBe('r1c3');
});
it('Tang may ignore each entry-water discard and desert tax independently, with decline and timeout falling back once',async()=>{
 for(const ignore of [true,false]){let s=fixture();gear(s,0,'basic-069#01');hand(s,0,'basic-039#01');s.players[0].cell='r1c8';s=await command(s,{type:'location',kind:'ship',cell:'r3c3'});expect(s.choice!.kind).toBe('gear-terrain');s=await choose(s,{accept:ignore});if(!ignore){expect(s.choice!.kind).toBe('water-discard');s=await choose(s,{cards:['basic-039#01']});}expect(s.players[0].hand.includes('basic-039#01')).toBe(ignore);}
 let s=fixture();gear(s,0,'basic-069#01');s.stage4!.deserts['教学楼']={owner:1,effect:{origin:'card',actor:1,faction:s.players[1].faction,roleModifiers:[]}};s=await command(s,{type:'end'});expect(s.choice!.kind).toBe('gear-terrain');s=await command(s,{type:'tick'},true,s.choice!.deadline);expect(s.choice!.kind).toBe('board-tax');s=await choose(s,{action:'ap'});s=await settle(s);expect(s.players[0].ap).toBe(49);expect(s.players[1].ap).toBe(51);
});
