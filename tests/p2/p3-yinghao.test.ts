import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {fixture,give,run,drain} from './p3-fixture';
import {legalTargets,legalSteps} from '../../packages/game-core/src/index';
import {cardEffectAllowed} from '../../packages/game-core/src/stage3-roles';
const db=await database(undefined,23);afterAll(()=>db.close());
for(const version of ['web-v0.1.10','web-v0.1.11','web-v0.1.12'] as const)it(`${version} retains its own Yinghao immunity in targets, validation and effect fallback`,async()=>{
 let s=fixture(version,['character-048','character-045','character-027','character-026']);give(s,0,'basic-010#01');s.random.dice=[1,5];
 expect(legalTargets(s,0,'basic-010#01').includes(1)).toBe(version==='web-v0.1.10');
 const effect={origin:'card' as const,actor:0,faction:s.players[0].faction,roleModifiers:[]};
 expect(cardEffectAllowed(s as any,1,'basic-010',effect)).toBe(version==='web-v0.1.10');
 expect((await db.query<{v:boolean}>('select ml_private.stage3_card_allowed($1::jsonb,1,$2,$3::jsonb) v',[JSON.stringify(s),'basic-010',JSON.stringify(effect)])).rows[0].v).toBe(version==='web-v0.1.10');
 if(version==='web-v0.1.10'){s=await run(db,s,{type:'play',card:'basic-010#01',targets:[1]});expect(s.players[1].hp).toBe(3);}
 else{await run(db,s,{type:'play',card:'basic-010#01',targets:[1,2]},false);s=await drain(db,await run(db,s,{type:'play',card:'basic-010#01',targets:[2,3]}));expect(s.players[1].hp).toBe(4);expect(s.players[2].hp).toBe(3);expect(s.players[3].hp).toBe(3);expect(s.random.dice).toEqual([]);}
});
it('ordinary damage to Yinghao remains and his own monkey-game location/range exception remains',async()=>{
 let s=fixture('web-v0.1.12',['character-048','character-045','character-027','character-026']);give(s,0,'basic-009#01');s.random.dice=[6];s=await drain(db,await run(db,s,{type:'play',card:'basic-009#01',targets:[1]}));expect(s.players[1].hp).toBe(3);
 s=fixture('web-v0.1.12',['character-045','character-048','character-027','character-026']);s.players[0].cell='r1c4';s.players[1].cell='r4c8';give(s,0,'basic-010#01');s.random.dice=[1];s=await drain(db,await run(db,s,{type:'play',card:'basic-010#01',targets:[1]}));expect(s.players[1].hp).toBe(4);expect(s.players[0].ap).toBe(18);
});
for(const kind of ['land','water','Mei','Xie','third','wall'])it(`collision baseline remains ${kind}`,async()=>{
 let s=fixture('web-v0.1.12',['character-045',kind==='water'?'character-004':kind==='Mei'?'character-026':kind==='Xie'?'character-044':'character-048','character-027','character-031']);
 const cells=kind==='water'?['r3c1','r3c2','r1c4','r1c5']:kind==='wall'?['r1c7','r1c8','r2c4','r2c5']:kind==='third'?['r1c2','r1c3','r1c5','r2c5']:['r1c2','r1c3','r2c4','r2c5'];s.players.forEach((p,i)=>p.cell=cells[i]);s.random.dice=[6];s=await run(db,s,{type:'move'});
 const ok=!['Mei','wall'].includes(kind);expect(legalSteps(s).includes(cells[1])).toBe(ok);s=await run(db,s,{type:'step',path:[cells[1]]},ok);expect(new Set(s.players.map(p=>p.cell)).size).toBe(4);
 if(ok){expect(s.players[0].cell).toBe(cells[1]);expect(s.players[1].cell).toBe(kind==='water'?'r3c8':kind==='third'?'r1c4':'r1c8');}
});
