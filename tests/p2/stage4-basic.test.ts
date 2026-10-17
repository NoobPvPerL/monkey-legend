import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame,dispatch,validateState,publicView} from '../../packages/game-core/src/index';
import type {GameState,Command} from '../../packages/game-core/src/types';
import {mapForVersion} from '../../packages/game-data/src/index';
const db=await database(undefined,17);afterAll(()=>db.close());
await db.exec(await readFile('database/engine/stage4-generated.sql','utf8'));
async function scalar(sql:string,args:unknown[]=[]){return (await db.query<{v:any}>(sql,args)).rows[0].v;}
function fixture(characters:NonNullable<Parameters<typeof createGame>[0]['characters']>=['character-048','character-027','character-026','character-031']):GameState{
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],characters,first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=20;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};validateState(s);return s;
}
function hand(s:GameState,a:number,...cards:string[]){
 for(const card of cards){s.deck=s.deck.filter(c=>c!==card);s.discard=s.discard.filter(c=>c!==card);for(const p of s.players)p.hand=p.hand.filter(c=>c!==card);s.players[a].hand.push(card);}validateState(s);
}
let serial=0;
async function command(s:GameState,body:Record<string,unknown>,ok=true){
 const cmd={id:'stage4-test-'+(++serial),revision:s.revision,actor:s.active,...body} as Command,now=s.time+1;
 const ts=dispatch(s,cmd,now),sql=await scalar('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),now]);
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);
 if(!ok)expect(ts.state).toEqual(s);return ts.state;
}
async function drain(s:GameState){let n=0;while(s.choice&&n++<30){const c=s.choice;s=await command(s,{type:'choose',actor:c.actor,choice:c.id,accept:false,...(c.kind==='discard'||c.kind==='water-discard'?{cards:[...s.players[c.actor].hand].sort().slice(0,c.count)}:{})});}expect(n).toBeLessThan(30);return s;}

it('creates the real191-entity development game identically in TS and SQL, keeping health at16',async()=>{
 const setup={mode:'ffa',ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],characters:['character-048','character-027','character-026','character-031'],first:0} as const;
 const ts=createGame({...setup,seats:[...setup.seats],characters:[...setup.characters]},1000);
 expect(await scalar('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).toEqual(ts);
 expect((await scalar('select public.ml_health() v')).engineRevision).toBe(16);
 expect(ts.deck.length+ts.players.reduce((n,p)=>n+p.hand.length,0)).toBe(191);
});
it('dismemberment pays2, takes a defense window, damages2, then resolves all original survivor triggers',async()=>{
 let s=fixture();hand(s,0,'basic-007#01');s=await command(s,{type:'play',card:'basic-007#01',targets:[1]});s=await drain(s);
 expect(s.players[1].hp).toBe(2);expect(s.players[0].ap).toBe(18);expect(s.discard).toContain('basic-007#01');
});
it('rock bonus is evaluated before the approved potato damage cap and shield absorption',async()=>{
 let s=fixture(['character-048','character-037','character-026','character-031']);s.players[1].shield=1;hand(s,0,'basic-007#01');s=await command(s,{type:'play',card:'basic-007#01',targets:[1]});s=await drain(s);
 expect(s.players[1].hp).toBe(5);expect(s.players[1].shield).toBe(0);
});
it('taking AP uses the available minimum, leaves zero instead of converting the shortfall to damage',async()=>{
 let s=fixture();s.players[1].ap=1;hand(s,0,'basic-019#01');s=await command(s,{type:'play',card:'basic-019#01',targets:[1]});
 expect(s.players[1].ap).toBe(0);expect(s.players[1].hp).toBe(4);expect(s.players[0].ap).toBe(21);
});
it('X pays actual resources even while JJ is free and the entity is consumed exactly once',async()=>{
 let s=fixture(['character-003','character-027','character-026','character-031']);hand(s,0,'basic-025#01');s.stage3!.jjFree[0]=true;
 s=await command(s,{type:'play',card:'basic-025#01',targets:[],x:3});expect(s.players[0].ap).toBe(17);expect(s.players[0].hand).toHaveLength(3);expect(s.discard).toContain('basic-025#01');
 await command(s,{type:'play',card:'basic-025#01',targets:[],x:3},false);
});
it('a quoted random price consumes exactly one private die and remains fixed on retry without public leakage',async()=>{
 let s=fixture();hand(s,0,'basic-029#01');s.random.dice=[6,1];const events=s.events.length;
 s=await command(s,{type:'skill',kind:'quote-cost',card:'basic-029#01'});expect(s.random.dice).toEqual([1]);expect(s.events).toHaveLength(events);
 s=await command(s,{type:'skill',kind:'quote-cost',card:'basic-029#01'});expect(s.random.dice).toEqual([1]);expect(s.stage4!.costs.locks['basic-029#01'].cost).toBe(6);
 expect(JSON.stringify(publicView(s,1))).not.toContain('basic-029#01');
});
it('rumor skips only proactive cards in the next personal turn and permits movement',async()=>{
 let s=fixture();hand(s,0,'basic-022#01');s=await command(s,{type:'play',card:'basic-022#01',targets:[1]});expect(s.stage3!.breadPending[1]).toBe(true);
 s=await command(s,{type:'end'});s=await drain(s);expect(s.active).toBe(1);expect(s.stage3!.breadBlocked[1]).toBe(true);
 hand(s,1,'basic-039#01');await command(s,{type:'play',card:'basic-039#01',targets:[]},false);
 s.random.dice=[1];s=await command(s,{type:'move'});expect(s.phase).toBe('moving');
});
it('cutting utilities suppresses the target next start draw including student extra but not later card draw',async()=>{
 let s=fixture();s.round=2;hand(s,0,'basic-018#01');s=await command(s,{type:'play',card:'basic-018#01',targets:[1]});
 s=await command(s,{type:'end'});s=await drain(s);expect(s.active).toBe(1);expect(s.phase).toBe('action');expect(s.players[1].hand).toHaveLength(0);expect(s.stage4!.drawBlocked[1]).toBe(true);
 hand(s,1,'basic-047#01');s=await command(s,{type:'play',card:'basic-047#01',targets:[]});expect(s.players[1].hand).toHaveLength(2);
});
it('iced tea survives student healing immunity and grants an ordinary free elbow without character conversion',async()=>{
 let s=fixture();s.players[0].hp=3;hand(s,0,'basic-042#01','basic-002#01');
 s=await command(s,{type:'play',card:'basic-042#01',targets:[]});expect(s.stage4!.tea[0]).toBe(true);expect(s.players[0].hp).toBe(4);
 s=await command(s,{type:'play',card:'basic-002#01',targets:[1],direction:'right'});s=await drain(s);
 expect(s.players[0].ap).toBe(18);expect(s.players[1].hp).toBe(3);expect(s.players[1].cell).toBe('r1c4');expect(s.players[0].cell).toBe('r1c3');expect(s.stage4!.tea[0]).toBe(false);
});
it('rice topping makes exactly the next dodge hit for2 without consuming a hit die',async()=>{
 let s=fixture();s.players[0].cell='r1c1';hand(s,0,'basic-043#01','basic-009#01');s.random.dice=[1];
 s=await command(s,{type:'play',card:'basic-043#01',targets:[]});s=await command(s,{type:'play',card:'basic-009#01',targets:[1]});s=await drain(s);
 expect(s.players[1].hp).toBe(2);expect(s.random.dice).toEqual([1]);expect(s.stage4!.dodge[0]).toBe(false);
});
it('exercise food stores independent attack-free and AP-protection charges, with accurate zero-cost logging',async()=>{
 let s=fixture();hand(s,0,'basic-044#01','basic-005#01');
 s=await command(s,{type:'play',card:'basic-044#01',targets:[]});s.players[1].ap=2;
 s=await command(s,{type:'play',card:'basic-005#01',targets:[1]});s=await drain(s);
 expect(s.players[0].ap).toBe(18);expect(s.stage4!.exerciseFree[0]).toBe(false);expect(s.stage4!.exerciseGuard[0]).toBe(true);
 expect(s.events.some(e=>e.type==='play'&&e.text.includes('搏击操')&&e.text.includes('支付0AP'))).toBe(true);
 s.active=1;s.players[1].ap=1;s.clock.since=s.time;hand(s,1,'basic-003#01');s=await command(s,{type:'play',card:'basic-003#01',targets:[0]});s=await drain(s);expect(s.players[0].ap).toBe(18);expect(s.stage4!.exerciseGuard[0]).toBe(false);
});
it('oil-pour branches both execute through ordinary healing, shield and injury-trigger paths',async()=>{
 for(const die of [1,5,6]){let s=fixture();s.players[0].hp=2;hand(s,0,'basic-048#01');s.random.dice=[die];s=await command(s,{type:'play',card:'basic-048#01',targets:[]});s=await drain(s);expect(s.players[0].hp).toBe(die===6?1:5);}
});
it('family healing includes current Dimon members, fully heals West and retains North immunity',async()=>{
 let s=fixture(['character-004','character-040','character-006','character-026']);s.players[0].hp=2;s.players[1].hp=1;s.players[2].hp=1;hand(s,0,'basic-040#01');
 s=await command(s,{type:'play',card:'basic-040#01',targets:[]});s=await drain(s);expect(s.players.map(p=>p.hp)).toEqual([3,5,1,4]);
});
it('office immunity, invalid targets, invalid X and invalid equipment targets never spend AP or entities',async()=>{
 let s=fixture();s.players[1].cell=mapForVersion(s.version).cells.find(c=>c.region==='办公室')!.id;
 hand(s,0,'basic-018#01','basic-025#01','basic-064#01');
 s=await command(s,{type:'play',card:'basic-018#01',targets:[1]});expect(s.stage4!.downPending[1]).toBe(false);
 await command(s,{type:'play',card:'basic-025#01',targets:[],x:0},false);
 await command(s,{type:'play',card:'basic-025#01',targets:[],x:100},false);
 await command(s,{type:'play',card:'basic-064#01',targets:[1]},false);
});
it('ongoing food buffs preserve the original foreign role lineage without tainting unrelated drawn cards',async()=>{
 for(const [food,card] of [['basic-042#01','basic-002#01'],['basic-043#01','basic-009#01'],['basic-044#01','basic-003#01']]){
  let s=fixture(['character-003','character-027','character-026','character-031']);s.players[0].cell='r1c2';s.players[2].cell='r2c3';hand(s,0,food,card);s=await command(s,{type:'skill',kind:'jj'});s=await command(s,{type:'play',card:food,targets:[]});s=await drain(s);s.stage3!.jjFree[0]=false;
  if(card==='basic-009#01')s.players[0].cell='r1c1';const before={hp:s.players[2].hp,ap:s.players[2].ap};s.random.dice=[5];s=await command(s,{type:'play',card,targets:[2],...(card==='basic-002#01'?{direction:'down'}:{})});s=await drain(s);expect({hp:s.players[2].hp,ap:s.players[2].ap}).toEqual(before);
 }
});
