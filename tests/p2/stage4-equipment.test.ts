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
it('enforces all five slots, two hands and explicit replacement before charging or committing',async()=>{
 let s=fixture();hand(s,0,'basic-049#01','basic-050#01','basic-052#01','basic-053#01','basic-055#01','basic-058#01','basic-060#01');
 s=await play(s,'basic-049#01');s=await play(s,'basic-052#01');s=await play(s,'basic-053#01');s=await play(s,'basic-058#01');s=await play(s,'basic-060#01');
 expect(s.stage3!.equipment[0]).toHaveLength(5);await command(s,{type:'play',card:'basic-050#01',targets:[]},false);
 await command(s,{type:'play',card:'basic-055#01',targets:[],replacement:'basic-049#01'},false);
 s=await play(s,'basic-055#01',{replacement:'basic-053#01'});expect(s.discard).toContain('basic-053#01');expect(s.stage3!.equipment[0]).toHaveLength(5);
});
it('locks random equipment fees and installs the exact same physical card',async()=>{
 let s=fixture();hand(s,0,'basic-051#01');await command(s,{type:'play',card:'basic-051#01',targets:[]},false);s.random.dice=[6];
 s=await play(s,'basic-051#01');expect(s.stage4!.durability['basic-051#01']).toBe(3);expect(s.stage3!.equipment[0]).toContain('basic-051#01');expect(s.resolving).toEqual([]);
});
it('random theft takes min(2, current hand) without paying or executing the stolen cards',async()=>{
 for(const count of [0,1,3]){let s=fixture();hand(s,0,'basic-024#01');hand(s,1,...['basic-007#01','basic-039#01','basic-045#01'].slice(0,count));s.random.dice=[1];
  s=await play(s,'basic-024#01',{targets:[1],take:'hand'});expect(s.players[0].hand).toHaveLength(Math.min(2,count));expect(s.players[1].hand).toHaveLength(Math.max(0,count-2));expect(s.players[1].ap).toBe(50);expect(s.players[1].hp).toBe(4);expect(s.events.filter(e=>e.type==='play')).toHaveLength(1);
 }
});
it('rejects missing or forged public item selection and replacement before spending',async()=>{
 let s=fixture();gear(s,1,'basic-059#01');hand(s,0,'basic-024#01');s.random.dice=[1];s=await command(s,{type:'skill',kind:'quote-cost',card:'basic-024#01'});
 for(const fields of [{},{take:'equipment',item:'basic-052#01'},{take:'hand',item:'basic-059#01'}])await command(s,{type:'play',card:'basic-024#01',targets:[1],...fields},false);
});
it('steals gear only after the former owner resolves its loss, preserving physical identity',async()=>{
 let s=fixture();gear(s,1,'basic-054#01');s.players[1].hp=1;hand(s,0,'basic-024#01');s.random.dice=[1];s=await play(s,'basic-024#01',{targets:[1],take:'equipment',item:'basic-054#01'});
 expect(s.choice).toMatchObject({kind:'gear-loss',actor:1});expect(s.resolving).toContain('basic-054#01');expect(s.stage3!.equipment[0]).not.toContain('basic-054#01');
 s=await choose(s,{accept:true});expect(s.players[1].hp).toBe(3);expect(s.stage3!.equipment[0]).toContain('basic-054#01');expect(s.stage3!.equipmentSources['basic-054#01'].actor).toBe(0);expect(s.discard).not.toContain('basic-054#01');
});
it('requires explicit slot replacement for theft and runs both old owners loss choices in order',async()=>{
 let s=fixture();gear(s,1,'basic-059#01');gear(s,0,'basic-058#01');s.players[1].hp=2;hand(s,0,'basic-024#01');s.random.dice=[1];s=await command(s,{type:'skill',kind:'quote-cost',card:'basic-024#01'});
 await command(s,{type:'play',card:'basic-024#01',targets:[1],take:'equipment',item:'basic-059#01'},false);
 s=await command(s,{type:'play',card:'basic-024#01',targets:[1],take:'equipment',item:'basic-059#01',replacement:'basic-058#01'});s=await choose(s,{accept:true});
 expect(s.players[1].hp).toBe(3);expect(s.discard).toContain('basic-058#01');expect(s.stage3!.equipment[0]).toContain('basic-059#01');
});
it('puts duplicate stolen equipment into hand rather than discarding it',async()=>{
 let s=fixture();gear(s,0,'basic-065#01');gear(s,1,'basic-065#02');hand(s,0,'basic-024#01');s.random.dice=[1];s=await play(s,'basic-024#01',{targets:[1],take:'equipment',item:'basic-065#02'});
 expect(s.players[0].hand).toContain('basic-065#02');expect(s.stage3!.equipment[0]).toEqual(['basic-065#01']);
});
it('a chalk loss can kill the thief before installation; the reserved entity is discarded exactly once',async()=>{
 let s=fixture();gear(s,1,'basic-052#01');s.players[0].hp=1;hand(s,0,'basic-024#01');s.random.dice=[1];s=await play(s,'basic-024#01',{targets:[1],take:'equipment',item:'basic-052#01'});
 expect(s.choice!.kind).toBe('gear-loss');s=await choose(s,{target:0});s=await settle(s);expect(s.players[0].hp).toBe(0);expect(s.discard.filter(c=>c==='basic-052#01')).toHaveLength(1);expect(s.resolving).toEqual([]);
});
it('equipment loss times out once without healing and cannot replay an expired choice',async()=>{
 let s=fixture();gear(s,1,'basic-059#01');s.players[1].hp=1;hand(s,0,'basic-024#01');s.random.dice=[1];s=await play(s,'basic-024#01',{targets:[1],take:'equipment',item:'basic-059#01'});
 const choice=s.choice!;s=await command(s,{type:'tick'},true,choice.deadline);expect(s.players[1].hp).toBe(1);expect(s.stage3!.equipment[0]).toContain('basic-059#01');await command(s,{type:'choose',actor:1,choice:choice.id,accept:true},false);
});
it('glasses cap each incoming hit before shields and heal1 only on nondeath loss',async()=>{
 let s=fixture();gear(s,1,'basic-059#01');s.players[1].shield=1;hand(s,0,'basic-007#01','basic-007#02');s=await play(s,'basic-007#01',{targets:[1]});expect(s.players[1].hp).toBe(4);expect(s.players[1].shield).toBe(0);
 s=await play(s,'basic-007#02',{targets:[1]});expect(s.players[1].hp).toBe(3);
});
it('repellent prevents vampire targeting while preserving other attacks',async()=>{
 let s=fixture();gear(s,1,'basic-057#01');hand(s,0,'basic-006#01','basic-007#01');expect(legalTargets(s,0,'basic-006#01')).not.toContain(1);expect(legalTargets(s,0,'basic-007#01')).toContain(1);await command(s,{type:'play',card:'basic-006#01',targets:[1]},false);
});
it('Chenghan exempts AP income from Xiao collection without making card costs free',async()=>{
 let s=fixture(['character-048','character-043','character-026','character-031']);gear(s,0,'basic-065#01');hand(s,0,'basic-015#01','basic-007#01');const before=s.players[0].ap;
 s=await play(s,'basic-015#01');expect(s.players[0].ap).toBe(before+8);expect(s.players[1].ap).toBe(50);s=await play(s,'basic-007#01',{targets:[1]});s=await settle(s);expect(s.players[0].ap).toBe(before+6);
});
it('Bob snapshots an existing mount with fresh durability, keeps its own identity and cannot copy Bob',async()=>{
 let s=fixture();gear(s,1,'basic-070#01',1);hand(s,0,'basic-073#01');s=await play(s,'basic-073#01',{copy:'basic-070#01'});
 expect(s.stage4!.copies['basic-073#01']).toBe('basic-070');expect(s.stage4!.durability['basic-073#01']).toBe(2);expect(s.stage4!.durability['basic-070#01']).toBe(1);expect(s.stage3!.equipment[0]).toEqual(['basic-073#01']);
 activate(s,2);hand(s,2,'basic-073#02');await command(s,{type:'play',card:'basic-073#02',targets:[],copy:'basic-073#01'},false);
});
it('stolen equipment preserves remaining durability and Bob ability',async()=>{
 let s=fixture();gear(s,1,'basic-073#01',1);s.stage4!.copies['basic-073#01']='basic-070';hand(s,0,'basic-024#01');s.random.dice=[1];s=await play(s,'basic-024#01',{targets:[1],take:'equipment',item:'basic-073#01'});
 expect(s.stage4!.copies['basic-073#01']).toBe('basic-070');expect(s.stage4!.durability['basic-073#01']).toBe(1);expect(s.stage3!.equipment[0]).toEqual(['basic-073#01']);
});
it('same-name uniqueness uses the physical printed identity rather than Bobs copied ability',async()=>{
 let s=fixture();gear(s,1,'basic-070#01',1);hand(s,0,'basic-073#01','basic-073#02','basic-070#02');s.random.dice=[1];s=await play(s,'basic-073#01',{copy:'basic-070#01'});
 await command(s,{type:'play',card:'basic-073#02',targets:[],copy:'basic-070#01',replacement:'basic-073#01'},false);
 s=await play(s,'basic-070#02',{replacement:'basic-073#01'});expect(s.stage3!.equipment[0]).toEqual(['basic-070#02']);expect(s.stage4!.copies['basic-073#01']).toBeUndefined();
});
it('water entry checks apply to a copied van, including forced destinations',async()=>{
 let s=fixture();gear(s,1,'basic-064#01');s.players[0].cell='r3c4';hand(s,0,'basic-073#01');s=await play(s,'basic-073#01',{copy:'basic-064#01'});expect(resources.canEnterWithMount(s as GameState&resources.ResourceState,0,'r3c3')).toBe(false);
 s.random.dice=[6];s=await command(s,{type:'move'});expect(legalSteps(s)).not.toContain('r3c3');
});
it('uniform ends damage only same-region enemies, outside the teaching building',async()=>{
 for(const classroom of [false,true]){let s=fixture();s.players[0].cell=classroom?'r1c2':'r1c4';s.players[1].cell=classroom?'r1c3':'r1c5';gear(s,0,'basic-050#01');s=await command(s,{type:'end'});s=await settle(s);expect(s.players[1].hp).toBe(classroom?4:3);}
});
it('van end damage hits row or column once, skips Hakimi and respects teams',async()=>{
 let s=fixture();gear(s,0,'basic-064#01');gear(s,1,'basic-063#01');s.players[2].cell='r2c2';const hp=s.players[2].hp,runnerHp=s.players[3].hp;s=await command(s,{type:'end'});s=await settle(s);expect(s.players[1].hp).toBe(4);expect(s.players[2].hp).toBe(hp-1);expect(s.players[3].hp).toBe(runnerHp);
});
it('Mei ignores a loss effect tied to another roles discount and death never invokes loss healing',async()=>{
 let s=fixture(['character-048','character-026','character-027','character-031']);gear(s,1,'basic-059#01');s.stage3!.equipmentSources['basic-059#01'].roleModifiers=[{actor:0,kind:'cost'}];s.players[1].hp=2;hand(s,0,'basic-024#01');s.random.dice=[1];s=await play(s,'basic-024#01',{targets:[1],take:'equipment',item:'basic-059#01'});expect(s.choice).toBeNull();expect(s.players[1].hp).toBe(2);
 activate(s,2);hand(s,2,'basic-007#01');s.players[0].hp=1;gear(s,0,'basic-059#02');s=await play(s,'basic-007#01',{targets:[0]});s=await settle(s);expect(s.players[0].hp).toBe(0);expect(s.discard).toContain('basic-059#02');
});
