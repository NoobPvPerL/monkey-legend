import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {fixture,give,equip,run,drain} from './p3-fixture';
import {createGame,validateState,legalTargets,publicView} from '../../packages/game-core/src/index';
import {runtimeForVersion,mapForVersion,characterTraitsForVersion} from '../../packages/game-data/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
const db=await database(undefined,26);afterAll(()=>db.close());
const v='web-v0.1.15';
const dragon=()=>fixture(v,['character-029','character-048','character-025','character-047']);
const clan=(mode:'ffa'|'team'='team')=>fixture(v,['character-053','character-048','character-025','character-029'],mode);
const monkey=()=>fixture(v,['character-020','character-048','character-025','character-029'],'team');
it('23 roles, source catalog and initial priority match; v14 and saved versions keep their pool',async()=>{
 const setup={mode:'team' as const,ruleVersion:v as 'web-v0.1.15',seed:42,seats:[0,1,2,3],first:1,characters:['character-053','character-029','character-020','character-047'] as const};
 const s=createGame({...setup,characters:[...setup.characters]},1000),sql=(await db.query<{v:any}>('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).rows[0].v;
 expect(sql).toEqual(s);expect(s.active).toBe(2);expect(s.order).toEqual([2,3,0,1]);expect(runtimeForVersion(v).characterIds).toHaveLength(23);expect(runtimeForVersion('web-v0.1.14').characterIds).toHaveLength(20);for(const id of ['character-020','character-029','character-053'] as const){const c=runtimeForVersion(v).characters[id];expect(mapForVersion(v).map[c.spawn].region).toBe(characterTraitsForVersion(v,id).spawnRegion);expect(mapForVersion(v).map[s.players.find(p=>p.character===id)!.cell].region).toBe(characterTraitsForVersion(v,id).spawnRegion);}
 expect(()=>createGame({...setup,ruleVersion:'web-v0.1.14',characters:[...setup.characters]},1000)).toThrow();
 const {exercise,actions,...view}=(await db.query<{v:any}>('select ml_private.public_view($1::jsonb,2) v',[JSON.stringify(s)])).rows[0].v;expect(view).toEqual(publicView(s,2));
 expect((await db.query<{v:any}>('select ml_private.stage3_actions($1::jsonb,2) v',[JSON.stringify(s)])).rows[0].v).toEqual(stage3Actions(s,2));
});
it('native dragon ball skips only hit dice; active conversion uses ball identity and pays exactly2',async()=>{
 let s=dragon();give(s,0,'basic-009#01');s.random.dice=[1,6];s=await drain(db,await run(db,s,{type:'play',card:'basic-009#01',targets:[1]}));expect(s.players[1].hp).toBe(4);expect(s.random.dice).toEqual([1,6]);
 s=dragon();give(s,0,'basic-003#01');s.random.dice=[1];s=await drain(db,await run(db,s,{type:'play',card:'basic-003#01',targets:[1],as:'dodge'}));expect(s.players[0].ap).toBe(18);expect(s.players[1].hp).toBe(4);expect(s.random.dice).toEqual([1]);expect(s.discard).toContain('basic-003#01');expect(s.cardStack!.stack).toEqual([]);
});
it('ball immunities and active-source veto precede targeting; other players cannot convert',async()=>{
 let s=fixture(v,['character-029','character-044','character-026','character-048']);give(s,0,'basic-009#01');expect(legalTargets(s,0,'basic-009#01')).toContain(1);expect(legalTargets(s,0,'basic-009#01')).not.toContain(2);expect(stage3Actions(s,0).cards['basic-009#01'].convertTargets).toEqual([3]);await run(db,s,{type:'play',card:'basic-009#01',targets:[1],as:'dodge'},false);
 s=dragon();s.active=1;s.cursor=1;give(s,1,'basic-009#01');expect(legalTargets(s,1,'basic-009#01')).not.toContain(0);await run(db,s,{type:'play',card:'basic-009#01',targets:[0]},false);await run(db,s,{type:'play',card:'basic-009#01',targets:[2],as:'dodge'},false);
 s=dragon();s.players[0].cell='r1c2';give(s,0,'basic-039#01');await run(db,s,{type:'play',card:'basic-039#01',targets:[1],as:'dodge'},false);
});
it('cloak and shield still work with guaranteed balls; invalid conversion never consumes state',async()=>{
 let s=dragon();give(s,0,'basic-009#01');equip(s,1,'basic-049#01');s.random.dice=[1];s=await run(db,s,{type:'play',card:'basic-009#01',targets:[1]});expect(s.choice?.kind).toBe('gear-cloak');s=await drain(db,await run(db,s,{type:'choose',choice:s.choice!.id,accept:true}));expect(s.players[1].hp).toBe(5);expect(s.random.dice).toEqual([]);
 s=dragon();s.players[1].shield=1;give(s,0,'basic-009#01');s.random.dice=[1];s=await drain(db,await run(db,s,{type:'play',card:'basic-009#01',targets:[1]}));expect(s.players[1].hp).toBe(5);expect(s.players[1].shield).toBe(0);expect(s.random.dice).toEqual([1]);
});
it('encourage is optional once per actual hit, odd draw or even chosen discard with20s',async()=>{
 let s=monkey();s.active=1;s.cursor=1;s.players[2].cell='r1c4';s.players[2].ap=0;give(s,1,'basic-003#01');give(s,1,'basic-039#01');give(s,1,'basic-046#01');s.random.dice=[2];
 s=await run(db,s,{type:'play',card:'basic-003#01',targets:[2]});expect(s.choice).toMatchObject({kind:'encourage',actor:0});expect(s.choice!.deadline-s.time).toBe(30000);s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toMatchObject({kind:'encourage-discard',actor:1,count:2});expect(s.choice!.deadline-s.time).toBe(20000);await run(db,s,{type:'choose',choice:s.choice!.id,cards:['basic-039#01','basic-039#01']},false);s=await run(db,s,{type:'choose',choice:s.choice!.id,cards:['basic-039#01','basic-046#01']});expect(s.players[1].hand).toEqual([]);
 s=monkey();s.active=1;s.cursor=1;s.players[2].ap=0;s.players[2].hp=3;give(s,1,'basic-005#01');s.random.dice=[1];s=await run(db,s,{type:'play',card:'basic-005#01',targets:[2]});expect(s.players[2].hp).toBe(0);expect(s.choice?.kind).toBe('encourage');s=await drain(db,await run(db,s,{type:'choose',choice:s.choice!.id,accept:true}));expect(s.players[0].hand).toHaveLength(2);
});
it('clan has0AP cost, discards all, grants allies once, and preserves the action clock',async()=>{
 let s=clan();give(s,0,'basic-039#01');const clock=structuredClone(s.clock);s=await run(db,s,{type:'skill',kind:'clan'});expect(s.players[0].hand).toEqual([]);expect(s.players[0].ap).toBe(22);expect(s.players[2].ap).toBe(22);expect(s.players[1].ap).toBe(20);expect(s.clock).toEqual(clock);give(s,0,'basic-046#01');await run(db,s,{type:'skill',kind:'clan'},false);
 s=clan('ffa');await run(db,s,{type:'skill',kind:'clan'},false);give(s,0,'basic-039#01');s=await run(db,s,{type:'skill',kind:'clan'});expect(s.players[0].ap).toBe(22);expect(s.players[2].ap).toBe(20);
});
it('begging triggers only at positive voluntary payments and may repeat after AP is regained',async()=>{
 let s=clan();s.players[0].ap=1;give(s,0,'basic-039#01');s=await drain(db,await run(db,s,{type:'play',card:'basic-039#01',targets:[]}));expect(s.players[0].ap).toBe(0);expect(s.players[2].ap).toBe(22);
 give(s,0,'basic-046#01');s.players[0].ap=2;s=await drain(db,await run(db,s,{type:'play',card:'basic-046#01',targets:[]}));expect(s.players[2].ap).toBe(24);
 s=clan();s.active=1;s.cursor=1;s.players[0].ap=1;give(s,1,'basic-003#01');s=await drain(db,await run(db,s,{type:'play',card:'basic-003#01',targets:[0]}));expect(s.players[0].ap).toBe(0);expect(s.players[2].ap).toBe(20);
});
it('D state validates all four booleans and old versions reject new skills',async()=>{
 const s=clan();delete (s.stage3!.d as any).clanUsed;expect(()=>validateState(s)).toThrow('D批角色状态无效');await expect(db.query('select ml_private.validate($1::jsonb)',[JSON.stringify(s)])).rejects.toThrow('D批角色状态无效');
 await run(db,fixture('web-v0.1.14'),{type:'skill',kind:'clan'},false);
});
for(const roll of [1,2,3,4,5,6])it(`shake${roll} uses one die per actual injury and preserves AP/movement`,async()=>{
 let s=dragon();s.active=1;s.cursor=1;s.players[0].cell='r3c5';s.players[1].cell='r3c8';give(s,1,'basic-007#01');s.random.dice=[roll,6];const ap=s.players[0].ap;
 s=await drain(db,await run(db,s,{type:'play',card:'basic-007#01',targets:[0]}));expect(s.players[0].hp).toBe(2);expect(s.players[0].cell).toBe(({1:'r3c4',2:'r3c6',3:'r2c5',4:'r4c5',5:'r3c5',6:'r3c5'} as Record<number,string>)[roll]);expect(s.players[0].ap).toBe(ap);expect(s.players[0].moved).toBe(false);expect(s.random.dice).toEqual([6]);
});
it('shake cannot overlap, escape closed areas or move on lethal injury; water discard is preserved',async()=>{
 let s=dragon();s.active=1;s.cursor=1;s.players[1].cell='r3c8';s.players[0].cell='r3c5';s.players[2].cell='r3c4';give(s,1,'basic-007#01');s.random.dice=[1,6];s=await drain(db,await run(db,s,{type:'play',card:'basic-007#01',targets:[0]}));expect(s.players[0].cell).toBe('r3c5');
 s=dragon();s.active=1;s.cursor=1;s.players[0].hp=2;give(s,1,'basic-007#01');s.random.dice=[1,6];s=await drain(db,await run(db,s,{type:'play',card:'basic-007#01',targets:[0]}));expect(s.players[0].hp).toBe(0);expect(s.random.dice).toEqual([1,6]);
 s=dragon();s.active=1;s.cursor=1;s.players[1].cell='r3c8';s.players[0].cell='r3c4';give(s,0,'basic-039#01');give(s,1,'basic-007#01');s.stage4!.water['樱花大道']={owner:1,effect:{origin:'card',actor:1,faction:s.players[1].faction,roleModifiers:[]}} as any;s.random.dice=[2];s=await run(db,s,{type:'play',card:'basic-007#01',targets:[0]});expect(s.choice?.kind).toBe('water-discard');expect(s.choice!.actor).toBe(0);s=await drain(db,s);expect(s.players[0].ap).toBe(20);
});
it('environment encourages once per loss and cancellation/timeouts never consume dice',async()=>{
 for(const accept of [false,true]){let s=monkey();s.active=3;s.cursor=3;s.players[2].cell='r1c4';s.players[3].cell='r2c3';s.players[1].cell='r4c8';s.classic!.poison=['秀松苑'];s.random.bombs=['高唐农场','樱花大道'];s.random.dice=[2,6];s=await run(db,s,{type:'end'});expect(s.choice).toMatchObject({kind:'encourage',actor:0});
 s=accept?await run(db,s,{type:'choose',choice:s.choice!.id,accept:true}):await run(db,s,{type:'tick'},true,s.choice!.deadline);expect(s.choice).toBeNull();expect(s.random.dice).toEqual(accept?[6]:[2,6]);}
});
it('encourage never reacts to self damage or enemies and obeys active immunity on the source',async()=>{
 let s=monkey();s.active=1;s.cursor=1;s.players[0].ap=0;give(s,1,'basic-003#01');s.random.dice=[1];s=await drain(db,await run(db,s,{type:'play',card:'basic-003#01',targets:[0]}));expect(s.random.dice).toEqual([1]);
 s=fixture(v,['character-020','character-044','character-025','character-048'],'team');s.active=1;s.cursor=1;s.players[2].ap=0;give(s,1,'basic-003#01');give(s,1,'basic-039#01');s.random.dice=[2];s=await run(db,s,{type:'play',card:'basic-003#01',targets:[2]});s=await drain(db,await run(db,s,{type:'choose',choice:s.choice!.id,accept:true}));expect(s.players[1].hand).toContain('basic-039#01');
});
it('begging covers deferred movement, commute, bread and mount payments',async()=>{
 let s=clan();s.players[0].cell='r3c5';s.players[0].ap=1;s.random.dice=[6];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'step',path:['r3c4']});s=await drain(db,await run(db,s,{type:'stop'}));expect(s.players[2].ap).toBe(22);
 s=clan();s.players[0].ap=1;const cell=stage3Actions(s,0).locations.commute[0];expect(cell).toBeTruthy();s=await drain(db,await run(db,s,{type:'location',kind:'commute',cell}));expect(s.players[2].ap).toBe(22);
 s=clan();equip(s,0,'basic-054#01');s.players[0].ap=2;s=await run(db,s,{type:'skill',kind:'bread',target:1});expect(s.players[2].ap).toBe(22);
 s=clan();equip(s,0,'basic-074#01');s.players[0].ap=1;s=await drain(db,await run(db,s,{type:'skill',kind:'flight',cell:'r3c5'}));expect(s.players[2].ap).toBe(22);
});
it('response and interrupt payments trigger begging once; forced AP theft does not',async()=>{
 let s=clan();s.active=1;s.cursor=1;s.players[1].cell='r3c4';s.players[0].ap=1;give(s,0,'basic-001#01');give(s,1,'basic-006#01');s=await run(db,s,{type:'play',card:'basic-006#01',targets:[0]});expect(s.choice?.kind).toBe('response');s=await drain(db,await run(db,s,{type:'choose',choice:s.choice!.id,card:'basic-001#01'}));expect(s.players[2].ap).toBe(22);
 s=clan();give(s,0,'basic-017#01');s.players[0].ap=stage3Actions(s,0).cards['basic-017#01'].cost!;s=await drain(db,await run(db,s,{type:'play',card:'basic-017#01',targets:[]}));expect(s.events.filter(e=>e.text.includes('乞讨：'))).toHaveLength(1);
 s=clan();s.active=1;s.cursor=1;give(s,1,'basic-019#01');s.players[0].ap=1;s=await drain(db,await run(db,s,{type:'play',card:'basic-019#01',targets:[0]}));expect(s.players[2].ap).toBe(20);
});
it('clan keeps physical exercise ownership and Xiao siphon; active and locked immunities differ',async()=>{
 let s=fixture(v,['character-053','character-043','character-044','character-048'],'team');give(s,0,'basic-003#01');s.exercise!.owners['basic-003#01']=0;s.players[0].ap=7;s.players[2].ap=7;s=await run(db,s,{type:'skill',kind:'clan'});expect(s.players[0].ap).toBe(7);expect(s.players[1].ap).toBe(23);expect(s.players[2].ap).toBe(7);expect(s.discard).toContain('basic-003#01');
 s=fixture(v,['character-053','character-048','character-044','character-025'],'team');s.players[0].ap=1;give(s,0,'basic-039#01');s=await drain(db,await run(db,s,{type:'play',card:'basic-039#01',targets:[]}));expect(s.players[2].ap).toBe(22);
 s=clan();give(s,0,'basic-039#01');s=await run(db,s,{type:'skill',kind:'clan'});for(let i=0;i<4;i++)s=await drain(db,await run(db,s,{type:'end'}));expect(s.stage3!.d!.clanUsed[0]).toBe(false);give(s,0,'basic-046#01');s=await run(db,s,{type:'skill',kind:'clan'});expect(s.stage3!.d!.clanUsed[0]).toBe(true);
});
it('both clan-wide AP effects preserve the one-card group immunity of MeiLi',async()=>{
 let s=fixture(v,['character-053','character-048','character-027','character-025'],'team');give(s,0,'basic-039#01');give(s,2,'basic-046#01');expect(stage3Actions(s,0).clan?.targets).toEqual([0]);s=await run(db,s,{type:'skill',kind:'clan'});expect(s.players[2].ap).toBe(20);
 s=fixture(v,['character-053','character-048','character-027','character-025'],'team');give(s,0,'basic-039#01');give(s,2,'basic-046#01');s.players[0].ap=1;s=await drain(db,await run(db,s,{type:'play',card:'basic-039#01',targets:[]}));expect(s.players[2].ap).toBe(20);
});
