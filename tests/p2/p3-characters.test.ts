import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {fixture,give,equip,run,drain} from './p3-fixture';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import {runtimeForVersion,sourceCatalogForVersion,characterTraitsForVersion} from '../../packages/game-data/src/index';
import {createStage3Draft} from '../../packages/game-core/src/draft';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
const db=await database(undefined,23);afterAll(()=>db.close());
it('only v12 has18 complete characters, proper traits, faction pools and the same authoritative initialization',async()=>{
 expect(runtimeForVersion('web-v0.1.11').characterIds).toHaveLength(16);expect(runtimeForVersion('web-v0.1.12').characterIds).toHaveLength(18);expect(sourceCatalogForVersion('web-v0.1.10').characters).not.toHaveProperty('character-013');
 for(const id of ['character-013','character-025'])expect(characterTraitsForVersion('web-v0.1.12',id)).toMatchObject({waterNative:false,spawnRegion:'教学楼',revivalRegion:'教学楼'});
 for(const mode of ['ffa','team'] as const){const setup={mode,ruleVersion:'web-v0.1.12' as const,seed:42,seats:[0,1,2,3],first:0,characters:['character-013','character-025','character-043','character-044'] as any};const ts=createGame(setup,1000);expect((await db.query<{v:unknown}>('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).rows[0].v).toEqual(ts);}
 const random={seed:42,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false};const draft=createStage3Draft('team',random,1000,'web-v0.1.12');expect(draft.pools['机械猴子']).toHaveLength(14);expect(draft.pools['帝汶家族']).toHaveLength(16);
 expect((await db.query<{v:unknown}>('select ml_private.stage4_create_draft($1,$2::jsonb,1000) v',['team',JSON.stringify(random)])).rows[0].v).toEqual(draft);
});
for(const protection of ['none','shield','glasses','potato','mount','Mei','Xie'])it(`Monkey Eight external damage keeps ${protection} protection and lineage`,async()=>{
 const victim=protection==='Mei'?'character-026':protection==='Xie'?'character-044':protection==='potato'?'character-037':'character-048';let s=fixture('web-v0.1.12',['character-013',victim,'character-025','character-027']);give(s,0,'basic-009#01');s.random.dice=[6];
 if(protection==='shield')s.players[1].shield=1;if(protection==='glasses')equip(s,1,'basic-059#01');if(protection==='mount')equip(s,1,'basic-070#01');
 const before=s.players[1].hp;s=await drain(db,await run(db,s,{type:'play',card:'basic-009#01',targets:[1]}));
 const loss=['Mei','mount'].includes(protection)?0:['shield','glasses','potato'].includes(protection)?1:2;expect(s.players[1].hp).toBe(before-loss);if(protection==='Mei')expect(s.random.dice).toEqual([6]);
});
it('Monkey Eight boosts each monkey-game participant, skips Mei dice and increases oil self-damage but not ordinary attacks',async()=>{
 let s=fixture();give(s,0,'basic-010#01');s.random.dice=[1,1,6];s=await drain(db,await run(db,s,{type:'play',card:'basic-010#01',targets:[1,2,3]}));expect(s.players.map(p=>p.hp)).toEqual([4,3,3,4]);expect(s.random.dice).toEqual([6]);
 s=fixture();give(s,0,'basic-048#01');s.random.dice=[6];s=await run(db,s,{type:'skill',kind:'quote-cost',card:'basic-048#01'});s=await drain(db,await run(db,s,{type:'play',card:'basic-048#01',targets:[]}));expect(s.players[0].hp).toBe(2);
 s=fixture();give(s,0,'basic-003#01');s.players[1].ap=0;s=await drain(db,await run(db,s,{type:'play',card:'basic-003#01',targets:[1]}));expect(s.players[1].hp).toBe(4);
});
it('Mayi targets current nearby teammates, spends3 AP, can repeat and never refreshes the main clock or consumes an entity',async()=>{
 let s=fixture('web-v0.1.12',['character-025','character-048','character-027','character-026'],'team');s.players[0].hp=2;s.players[2].hp=2;s.players[1].hp=2;s.clock={remaining:23000,since:1000};const deck=[...s.deck],before=structuredClone(s);
 expect(stage3Actions(s,0).mayi?.targets).toEqual([0,2]);s=await run(db,s,{type:'skill',kind:'mayi'});expect(s.players.map(p=>p.hp)).toEqual([3,2,3,4]);expect(s.players[0].ap).toBe(17);expect(s.clock).toEqual(before.clock);expect(s.deck).toEqual(deck);expect(s.discard).toEqual([]);
 s=await run(db,s,{type:'skill',kind:'mayi'});expect(s.players[0].hp).toBe(4);expect(s.players[0].ap).toBe(14);
});
for(const teammate of ['character-026','character-044','character-027'])it(`Mayi respects ${teammate} immunity/food boundaries and full-heal mount`,async()=>{
 let s=fixture('web-v0.1.12',['character-025','character-048',teammate,'character-031'],'team');s.players[2].hp=1;equip(s,2,'basic-072#01');s=await run(db,s,{type:'skill',kind:'mayi'});expect(s.players[2].hp).toBe(teammate==='character-027'?4:1);
});
it('Mayi FFA is self only; wrong role, old version, insufficient AP, movement and expired requests are atomic',async()=>{
 let s=fixture('web-v0.1.12',['character-025','character-048','character-027','character-026']);s.players[0].hp=2;expect(stage3Actions(s,0).mayi?.targets).toEqual([0]);s=await run(db,s,{type:'skill',kind:'mayi'});expect(s.players[0].hp).toBe(3);
 s.players[0].ap=2;await run(db,s,{type:'skill',kind:'mayi'},false);s.players[0].ap=20;s=await run(db,s,{type:'move'});await run(db,s,{type:'skill',kind:'mayi'},false);
 await run(db,fixture(),{type:'skill',kind:'mayi'},false);await run(db,fixture('web-v0.1.11',['character-048','character-045','character-027','character-026']),{type:'skill',kind:'mayi'},false);
 const old=fixture();expect(dispatch(old,{id:'late',revision:old.revision,actor:0,type:'skill',kind:'mayi'},61000).ok).toBe(false);
});
