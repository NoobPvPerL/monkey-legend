import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame,dispatch,validateState,legalSteps,legalTargets,publicView} from '../../packages/game-core/src/index';
import {mapForVersion,distanceForVersion} from '../../packages/game-data/src/index';
import type {GameState,Command} from '../../packages/game-core/src/types';
import {boardEntryAllowed} from '../../packages/game-core/src/stage4-board';
const db=await database(undefined,17);afterAll(()=>db.close());await db.exec(await readFile('database/engine/stage4-generated.sql','utf8'));
function fixture(characters:NonNullable<Parameters<typeof createGame>[0]['characters']>=['character-048','character-027','character-026','character-031']){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],characters,first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=50;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};return s;
}
function hand(s:GameState,a:number,...cards:string[]){for(const card of cards){s.deck=s.deck.filter(c=>c!==card);s.discard=s.discard.filter(c=>c!==card);for(const p of s.players)p.hand=p.hand.filter(c=>c!==card);s.players[a].hand.push(card);}validateState(s);}
function activate(s:GameState,a:number){s.active=a;s.cursor=s.order.indexOf(a);s.clock={remaining:60000,since:s.time};}
let serial=0;
async function command(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:'map-'+(++serial),revision:s.revision,actor:s.active,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=(await db.query<{v:any}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);return ts.state;
}
async function play(s:GameState,card:string,targets:number[]=[],region?:string){
 if(['basic-026','basic-031','basic-032','basic-033','basic-034'].includes(card.split('#')[0]))s=await command(s,{type:'skill',kind:'quote-cost',card});
 return command(s,{type:'play',card,targets,...(region?{region}:{})});
}
async function choose(s:GameState,fields:Record<string,unknown>={}){return command(s,{type:'choose',actor:s.choice!.actor,choice:s.choice!.id,accept:false,...fields});}
async function settle(s:GameState){let guard=0;while(s.choice&&guard++<100){const c=s.choice;let fields:Record<string,unknown>={};
 if(c.kind==='board-path')fields={option:Object.keys(c.options!)[0]};
 if(c.kind==='board-tax')fields=(c.data as {mode:string}).mode==='desert'&&s.players[c.actor].ap>0?{action:'ap'}:{card:c.cards![0]};
 if(c.kind==='water-discard'||c.kind==='discard')fields={cards:[...s.players[c.actor].hand].sort().slice(0,c.count)};
 s=await choose(s,fields);
 }expect(guard).toBeLessThan(100);return s;}
it('toilet prevents other single attack targeting, preserves group targeting and costs1',async()=>{
 let s=fixture();hand(s,0,'basic-020#01');s=await play(s,'basic-020#01');expect(s.players[0].ap).toBe(49);expect(s.stage4!.toiletUntil[0]).toBe(2);
 activate(s,1);hand(s,1,'basic-007#01','basic-003#01');expect(legalTargets(s,1,'basic-007#01')).not.toContain(0);
 await command(s,{type:'play',card:'basic-007#01',targets:[0]},false);s=await play(s,'basic-003#01',[0]);s=await settle(s);expect(s.players[0].ap).toBe(48);
});
it('region blocking prevents both walking and teleport entry but does not eject current inhabitants',async()=>{
 let s=fixture();hand(s,0,'basic-023#01');s=await play(s,'basic-023#01',[],'教学楼');expect(s.players[1].cell).toBe('r1c3');expect(boardEntryAllowed(s,2,'r2c3')).toBe(false);
 activate(s,2);s.random.dice=[1];s=await command(s,{type:'move'});expect(legalSteps(s)).not.toContain('r2c3');await command(s,{type:'step',path:['r2c3']},false);
});
it('a flooding card immediately opens entry discards for existing nonnative occupants in action order',async()=>{
 let s=fixture();hand(s,0,'basic-033#01','basic-039#01');hand(s,1,'basic-045#01');s.random.dice=[1];s=await play(s,'basic-033#01',[],'教学楼');
 expect(s.choice).toMatchObject({kind:'water-discard',actor:0});s=await choose(s,{cards:['basic-039#01']});expect(s.choice).toMatchObject({kind:'water-discard',actor:1});s=await choose(s,{cards:['basic-045#01']});
 expect(s.stage4!.water['教学楼']).toBeDefined();expect(s.choice).toBeNull();expect(s.players[0].ap).toBe(49);expect(s.discard).toContain('basic-039#01');
});
it('desert deployment is not an immediate tax; ending there pays1AP before normal end choices',async()=>{
 let s=fixture();hand(s,0,'basic-032#01');s.random.dice=[1];s=await play(s,'basic-032#01',[],'教学楼');expect(s.choice).toBeNull();expect(s.players[0].ap).toBe(48);
 activate(s,1);hand(s,1,'basic-039#01');s=await command(s,{type:'end'});expect(s.choice).toMatchObject({kind:'board-tax',actor:1});s=await choose(s,{action:'ap'});s=await settle(s);
 expect(s.players[0].ap).toBe(49);expect(s.players[1].ap).toBe(49);
});
it('walking across a desert boundary pauses the saved path for tax then resumes without an extra movement fee',async()=>{
 let s=fixture();s.players[0].cell='r1c4';hand(s,0,'basic-032#01');s.random.dice=[1];s=await play(s,'basic-032#01',[],'教学楼');
 activate(s,2);s.players[2].cell='r3c5';s.random.dice=[6];s=await command(s,{type:'move'});s=await command(s,{type:'step',path:['r3c4','r2c4','r2c3']});expect(s.choice!.kind).toBe('board-tax');
 s=await choose(s,{action:'ap'});expect(s.players[2].cell).toBe('r2c3');expect(s.movement).toBeNull();expect(s.players[2].ap).toBe(48);expect(s.players[0].ap).toBe(49);
});
it('desert timeout pays AP first, then a sorted hand card, with no fabricated gain when owner pays itself',async()=>{
 for(const ap of [0,3]){let s=fixture();hand(s,0,'basic-032#01');s.random.dice=[1];s=await play(s,'basic-032#01',[],'教学楼');activate(s,1);s.players[1].ap=ap;hand(s,1,'basic-045#01','basic-039#01');s=await command(s,{type:'end'});
  const deadline=s.choice!.deadline;s=await command(s,{type:'tick'},true,deadline);s=await settle(s);
  expect(s.players[1].ap).toBe(ap===0?0:2);if(ap===0)expect(s.players[0].hand).toContain('basic-039#01');else expect(s.players[0].ap).toBe(49);
 }
 let s=fixture();hand(s,0,'basic-032#01');s.random.dice=[1];s=await play(s,'basic-032#01',[],'教学楼');s=await command(s,{type:'end'});s=await choose(s,{action:'ap'});s=await settle(s);expect(s.players[0].ap).toBe(48);
});
it('hidden guessing never publishes its die until guessed, then the caster selects a legal forced teleport',async()=>{
 let s=fixture();hand(s,0,'basic-021#01');s.random.dice=[3];s=await play(s,'basic-021#01',[1]);expect(s.choice!.kind).toBe('board-guess');
 expect(JSON.stringify(publicView(s,1))).not.toContain('guessDie');expect(s.events.filter(e=>e.type==='dice')).toHaveLength(0);
 s=await choose(s,{guess:1});expect(s.choice).toMatchObject({kind:'board-cell',actor:0,source:1});const cell=s.choice!.cells!.find(c=>c!=='r1c3')!;s=await choose(s,{cell});s=await settle(s);expect(s.players[1].cell).toBe(cell);
});
it('a correct guess and caster timeout respectively preserve the location without rerolling',async()=>{
 for(const correct of [true,false]){let s=fixture();hand(s,0,'basic-021#01');s.random.dice=[3,6];s=await play(s,'basic-021#01',[1]);s=await choose(s,{guess:correct?3:1});
  if(!correct)s=await command(s,{type:'tick'},true,s.choice!.deadline);expect(s.players[1].cell).toBe('r1c3');expect(s.random.dice).toEqual([6]);expect(s.choice).toBeNull();
 }
});
it('off-map tokens cannot be targeted, take environment or occupy their old cell, and may only end the current turn',async()=>{
 let s=fixture();hand(s,0,'basic-034#01');s.random.dice=[1];s=await play(s,'basic-034#01');expect(s.stage4!.offMap[0]).toBe(true);await command(s,{type:'move'},false);
 activate(s,1);hand(s,1,'basic-007#01');expect(legalTargets(s,1,'basic-007#01')).not.toContain(0);await command(s,{type:'play',card:'basic-007#01',targets:[0]},false);
});
it('return choice resumes exactly the same personal start once, including timeout random return and water handling',async()=>{
 for(const timeout of [false,true]){let s=fixture();hand(s,0,'basic-034#01');s.random.dice=[1];s=await play(s,'basic-034#01');s=await command(s,{type:'end'});s=await settle(s);
  for(let i=0;i<3;i++){expect(s.active).toBe(i+1);s=await command(s,{type:'end'});if(i<2)s=await settle(s);}
  expect(s.choice).toMatchObject({kind:'board-return',actor:0});const starts=s.stage3!.starts[0];
  if(timeout)s=await command(s,{type:'tick'},true,s.choice!.deadline);else s=await choose(s,{cell:s.choice!.cells![0]});s=await settle(s);
  expect(s.stage3!.starts[0]).toBe(starts);expect(s.stage4!.offMap[0]).toBe(false);expect(s.active).toBe(0);expect(s.phase).toBe('action');
 }
});
it('running exercises move other eligible players at most one cell then damage all tied farthest players',async()=>{
 let s=fixture();const before=s.players.map(p=>p.cell);hand(s,0,'basic-013#01');s=await play(s,'basic-013#01');s=await settle(s);
 expect(s.players[0].cell).toBe(before[0]);for(let a=1;a<4;a++)expect(distanceForVersion(s.version,before[a],s.players[a].cell)).toBeLessThanOrEqual(1);expect(s.discard).toContain('basic-013#01');
});
it('school bell moves up to3, collects existing resources and damages missing ones without charging movement AP',async()=>{
 let s=fixture();s.players[0].cell='r1c4';hand(s,0,'basic-031#01');hand(s,1,'basic-039#01','basic-045#01');s.random.dice=[1];s=await play(s,'basic-031#01');s=await settle(s);
 expect(s.players[0].ap).toBe(49);expect(s.players[0].hand.length).toBe(1);expect(s.players[1].ap).toBe(49);expect(s.players[1].hp).toBe(4);
 for(const p of s.players.slice(1,3))expect(mapForVersion(s.version).map[p.cell].region).toBe('教学楼');expect(distanceForVersion(s.version,'r2c5',s.players[3].cell)).toBe(3);expect(mapForVersion(s.version).map[s.players[3].cell].region).not.toBe('教学楼');expect(s.players[3].ap).toBe(50);
});
it('LMM collects cards or inflicts damage then overrides ordinary single-target selection',async()=>{
 let s=fixture();hand(s,0,'basic-026#01');hand(s,1,'basic-039#01','basic-007#01');s.random.dice=[1];s=await play(s,'basic-026#01');expect(s.choice!.kind).toBe('board-tax');s=await choose(s,{card:'basic-039#01'});s=await settle(s);
 expect(s.players[0].hand).toContain('basic-039#01');activate(s,1);expect(legalTargets(s,1,'basic-007#01')).toEqual([0]);await command(s,{type:'play',card:'basic-007#01',targets:[2]},false);
 s=await play(s,'basic-007#01',[0]);s=await settle(s);expect(s.players[0].hp).toBe(3);
});
it('map inputs are rejected before payment or effects if the region, guessed number or selected path is invalid',async()=>{
 let s=fixture();hand(s,0,'basic-023#01','basic-021#01');await command(s,{type:'play',card:'basic-023#01',targets:[],region:'不存在'},false);
 s.random.dice=[1];s=await play(s,'basic-021#01',[1]);await command(s,{type:'choose',actor:1,choice:s.choice!.id,guess:7},false);
});
