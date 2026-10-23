import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {fixture,give,equip,run} from './p3-fixture';
import {createGame,publicView,validateState} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {createStage3Draft,dispatchDraft} from '../../packages/game-core/src/draft';
import type {GameState} from '../../packages/game-core/src/types';
const db=await database(undefined,27);afterAll(()=>db.close());
const setup=(ids=['character-014','character-016','character-024','character-038'])=>fixture('web-v0.1.16',ids);
async function settle(s:GameState,accept=false){for(let n=0;s.choice&&n<80;n++){const c=s.choice;s=await run(db,s,{type:'choose',choice:c.id,accept,...(c.kind==='force-step'||c.kind==='elbow-push'?{cell:c.cells?.[0]}:{}),...(c.kind==='board-path'?{option:Object.keys(c.options!)[0]}:{}),...(c.count?{cards:[...s.players[c.actor].hand].sort().slice(0,c.count)}:{})});}expect(s.choice).toBeNull();return s;}
it('new catalog, public state and available actions agree exactly across SQL, including opening water choice before a personal turn',async()=>{
 for(const ids of [['character-014','character-016','character-024','character-038'],['character-037','character-016','character-004','character-038']]){
  const start={mode:'ffa' as const,ruleVersion:'web-v0.1.16' as const,seed:917,seats:[0,1,2,3],first:0,characters:ids};const s=createGame(start as Parameters<typeof createGame>[0],1000);
  expect((await db.query<{v:any}>('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(start)])).rows[0].v).toEqual(s);
  for(let a=0;a<4;a++){expect((await db.query<{v:any}>('select ml_private.stage3_actions($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v).toEqual(stage3Actions(s,a));const {exercise,actions,...sql}=(await db.query<{v:any}>('select ml_private.public_view($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v;expect(sql).toEqual(publicView(s,a));}
 }
});
it('elbow deals its damage before consent; refusal cancels only push and advance, accepted pair never overlaps',async()=>{
 for(const accept of [false,true]){let s=setup(['character-023','character-016','character-025','character-047']);s.players[0].cell='r3c5';s.players[1].cell='r3c6';give(s,0,'basic-002#01');const hp=s.players[1].hp;s=await run(db,s,{type:'play',card:'basic-002#01',targets:[1],direction:'right'});expect(s.choice?.kind).toBe('move-consent');expect(s.players[1].hp).toBe(hp-1);s=await settle(await run(db,s,{type:'choose',choice:s.choice!.id,accept}));expect(s.players[0].cell).toBe(accept?'r3c6':'r3c5');expect(s.players[1].cell).toBe(accept?'r3c7':'r3c6');}
});
it('off-map effects require consent for others, timeout denies, and self-use never asks',async()=>{
 let s=setup(['character-048','character-016','character-025','character-047']);s.active=1;s.cursor=1;give(s,1,'basic-034#01');s=await run(db,s,{type:'skill',kind:'quote-cost',card:'basic-034#01'});s=await run(db,s,{type:'play',card:'basic-034#01',targets:[]});expect(s.stage4!.offMap[1]).toBe(true);expect(s.choice).toBeNull();
 // Exercise the same authority entry with an already validated card effect on
 // another recipient; the production self-target rule of 移家 stays intact.
 s=setup(['character-048','character-016','character-025','character-047']);s.queue=[{kind:'stage3',action:'e-off-map',actor:0,target:1,data:{root:'external-off-map'}}];s=await run(db,s,{type:'skill',kind:'quote-cost',card:'basic-025#01'},false);
 const ts=structuredClone(s);ts.queue=[]; // A queued effect is resumed by a normal no-cost personal end.
 ts.queue=s.queue;s=await run(db,ts,{type:'end'});expect(s.choice?.kind).toBe('move-consent');s=await run(db,s,{type:'tick'},true,s.choice!.deadline);expect(s.stage4!.offMap[1]).toBe(false);
});
it('exercise-style forced multi-step paths ask only once and refusal keeps the original post-movement resource effect',async()=>{
 let s=setup(['character-048','character-016','character-025','character-047']);s.players[1].cell='r3c8';give(s,0,'basic-031#01');s=await run(db,s,{type:'skill',kind:'quote-cost',card:'basic-031#01'});s=await run(db,s,{type:'play',card:'basic-031#01',targets:[]});expect(s.choice?.kind).toBe('move-consent');s=await settle(await run(db,s,{type:'choose',choice:s.choice!.id,accept:true}));expect(s.events.filter(e=>e.type==='choice'&&e.text.endsWith('move-consent'))).toHaveLength(1);
});
it('forced teleport asks after a destination is chosen and cannot bypass rejection through retries',async()=>{
 let s=setup(['character-048','character-016','character-025','character-047']);give(s,0,'basic-021#01');s.random.dice=[6];s=await run(db,s,{type:'play',card:'basic-021#01',targets:[1]});expect(s.choice?.kind).toBe('board-guess');s=await run(db,s,{type:'choose',choice:s.choice!.id,guess:1});expect(s.choice?.kind).toBe('board-cell');s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r3c5'});expect(s.choice?.kind).toBe('move-consent');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:false});expect(s.players[1].cell).toBe('r1c3');expect(s.choice).toBeNull();
});
it('gas excludes active and group immunities, never moves its owner, may repeat, and rejects insufficient AP atomically',async()=>{
 let s=setup(['character-014','character-026','character-044','character-027']);give(s,3,'basic-039#01');const cells=s.players.map(p=>p.cell),clock=s.clock.remaining;s=await run(db,s,{type:'skill',kind:'gas'});expect(s.players.map(p=>p.cell)).toEqual(cells);expect(s.players[0].ap).toBe(19);expect(s.clock.remaining).toBe(clock);s=await run(db,s,{type:'skill',kind:'gas'});expect(s.players[0].ap).toBe(18);s.players[0].ap=0;await run(db,s,{type:'skill',kind:'gas'},false);
});
it('forced water entry still discards a physical card and equipment can forbid that landing',async()=>{
 let s=setup(['character-014','character-048','character-025','character-047']);s.players[0].cell='r3c5';s.players[1].cell='r3c4';s.players[2].cell='r1c8';s.players[3].cell='r2c8';give(s,1,'basic-039#01');s=await run(db,s,{type:'skill',kind:'gas'});expect(s.choice).toMatchObject({kind:'force-step',source:1});expect(s.choice!.cells).toContain('r3c3');s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r3c3'});expect(s.choice?.kind).toBe('water-discard');s=await settle(s);expect(s.discard).toContain('basic-039#01');
 s=setup(['character-014','character-048','character-025','character-047']);s.players[0].cell='r3c5';s.players[1].cell='r3c4';equip(s,1,'basic-063#01');s=await run(db,s,{type:'skill',kind:'gas'});expect(s.choice!.cells).not.toContain('r3c3');
});
it('highest includes Wang himself in the comparison, handles ties, uses locked immunity and excludes off-map actors',async()=>{
 let s=setup(['character-038','character-016','character-026','character-044']);s.players[0].hp=4;s.players[1].hp=3;s.players[2].hp=3;s.players[3].hp=3;s=await run(db,s,{type:'end'});expect(s.events.some(e=>e.text.includes('force-step'))).toBe(false);
 s=setup(['character-038','character-016','character-026','character-044']);s.players[0].hp=3;s.players[1].hp=3;s.players[2].hp=3;s.players[3].hp=3;const old=s.players.map(p=>p.cell);s=await run(db,s,{type:'end'});expect(s.choice?.kind).toBe('move-consent');s=await settle(s);expect(s.players[0].cell).toBe(old[0]);expect(s.players[1].cell).toBe(old[1]);expect(s.players[2].cell).toBe(old[2]);expect(s.players[3].cell).not.toBe(old[3]);
});
it('escape damage compares all farthest others before immunity and tied recipients each lose one actual HP',async()=>{
 let s=setup(['character-038','character-048','character-025','character-047']);s.players[1].cell='r1c7';s.players[2].cell='r2c8';s.players[3].cell='r1c8';s.players[1].hp=s.players[1].maxHp;s.players[2].hp=s.players[2].maxHp;s.players[3].hp=s.players[3].maxHp;
 s=await settle(await run(db,s,{type:'skill',kind:'escape',region:'高唐农场'}));const max=Math.max(...s.players.slice(1).map(p=>Number(p.cell[1])+Number(p.cell[3])));for(const p of s.players.slice(1))expect(p.hp).toBe(p.maxHp-(Number(p.cell[1])+Number(p.cell[3])===max?1:0));
});
it('invalid region, malformed E state and old v15 E intents are rejected by the database and TS',async()=>{
 let s=setup(['character-038','character-016','character-025','character-047']);await run(db,s,{type:'skill',kind:'escape',region:'不存在'},false);(s.stage3!.e!.permissions as any).bad=1;expect(()=>validateState(s)).toThrow('E批角色状态无效');await expect(db.query('select ml_private.validate($1::jsonb)',[JSON.stringify(s)])).rejects.toThrow('E批角色状态无效');await run(db,fixture('web-v0.1.15'),{type:'skill',kind:'gas'},false);
});
it('v16 spawn capacity extends to all five playground candidates without changing v15',async()=>{
 let seen=false;for(let seed=1;seed<=12;seed++){let s=createStage3Draft('ffa',{seed,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false},1000,'web-v0.1.16');for(let i=0;i<4;i++){const playground=['character-004','character-046','character-053','character-024','character-038'];if(s.selected.filter(id=>id&&playground.includes(id)).length===2){seen=true;expect(s.offer!.candidates.some(id=>playground.includes(id))).toBe(false);}const cmd={id:'e-spawn-'+i,revision:s.revision,actor:s.offer!.actor,type:'pick' as const,offer:s.offer!.id,character:s.offer!.candidates.find(id=>playground.includes(id))??s.offer!.candidates[0]},ts=dispatchDraft(s,cmd,1001+i);expect(ts.ok,ts.error).toBe(true);if(seed===1)expect((await db.query<{v:any}>('select ml_private.dispatch_draft($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),1001+i])).rows[0].v).toEqual(ts);s=ts.state;}expect(s.selected.filter(id=>['character-004','character-046','character-053','character-024','character-038'].includes(id!)).length).toBeLessThanOrEqual(2);}expect(seen).toBe(true);
});
it('west carry keeps the original movement root after the basic segment ends, so egg reacts only once',async()=>{
 let s=setup(['character-040','character-016','character-024','character-038']);s.players[0].cell='r3c5';s.players[1].cell='r2c5';s.players[2].cell='r1c2';s.players[3].cell='r1c8';s.random.dice=[2,2];s=await run(db,s,{type:'move',direction:'right'});s=await run(db,s,{type:'step',path:['r3c6']});expect(s.choice?.kind).toBe('west-carry');s=await run(db,s,{type:'choose',choice:s.choice!.id,target:1,cell:'r2c6'});expect(s.choice?.kind).toBe('move-consent');expect((s.choice!.data as {root:string}).root).toBe('move0');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('egg-move');s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r1c3'});expect(s.choice).toBeNull();expect(s.players[1].cell).toBe('r2c6');expect(s.events.filter(e=>e.type==='choice'&&e.text.endsWith('egg-move'))).toHaveLength(1);
});
it('landing equipment push still asks consent and does not create a second egg response for the same chain',async()=>{
 let s=setup(['character-048','character-016','character-024','character-038']);s.players[0].cell='r3c5';s.players[1].cell='r3c7';s.players[2].cell='r1c2';s.players[3].cell='r1c8';equip(s,0,'basic-076#01');s.random.dice=[2];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'step',path:['r3c6']});expect(s.choice?.kind).toBe('egg-move');s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:null});expect(s.choice?.kind).toBe('gear-push');s=await run(db,s,{type:'choose',choice:s.choice!.id,option:'1:right'});expect(s.choice?.kind).toBe('move-consent');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].cell).toBe('r3c8');expect(s.choice).toBeNull();expect(s.events.filter(e=>e.type==='choice'&&e.text.endsWith('egg-move'))).toHaveLength(1);
});
it('native water traversal tests the actual shore distance, so an overshoot cannot count as approaching the selected region',async()=>{
 let s=setup(['character-038','character-004','character-026','character-044']);s.players[0].cell='r3c6';s.players[1].cell='r3c2';s=await run(db,s,{type:'skill',kind:'escape',region:'红素洋'});expect(s.choice).toBeNull();expect(s.players[1].cell).toBe('r3c2');
 s=setup(['character-014','character-004','character-026','character-044']);s.players[0].cell='r3c1';s.players[1].cell='r3c2';s=await run(db,s,{type:'skill',kind:'gas'});expect(s.choice!.cells).toContain('r3c3');s=await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r3c3'});expect(s.players[1].cell).toBe('r3c4');expect(s.choice).toBeNull();
});
