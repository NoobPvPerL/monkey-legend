import {expect,it} from 'vitest';
import {gFixture,gRun,gDrain} from './p3-g-fixture';
import {fixture,give,equip} from './p3-fixture';
import {publicView} from '../../packages/game-core/src/index';
import {refreshClassicRound,classicEnvironmentHits,bombingRegions,poisonRegions} from '../../packages/game-core/src/classic';
import {integer} from '../../packages/game-core/src/random';
import {gCardTargetAllowed} from '../../packages/game-core/src/p3-g-observer';
import {stage3AttackTargets,stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Targets} from '../../packages/game-core/src/stage4-engine';
import {stage4TeaTargets} from '../../packages/game-core/src/stage4-view';
import {gDogTargets} from '../../packages/game-core/src/p3-g-skills';
import {stage4CounterCards} from '../../packages/game-core/src/stage4-counter';
const observer=()=>gFixture(['character-012','character-048','character-025','character-031']);
function hidden(){const s=gFixture(['character-048','character-012','character-025','character-031']);s.stage3!.g!.invisible[1]=true;s.players[0].cell='r1c2';s.players[1].cell='r2c2';s.players[2].cell='r2c3';return s;}
it('reserves after poison update, keeps the forecast private, and reuses the exact result after later RNG',()=>{
 const s=observer(),events=structuredClone(publicView(s,0).events);refreshClassicRound(s);const plan=structuredClone(s.stage3!.g!.forecast)!;expect(plan.round).toBe(s.round);expect(plan.regions).toHaveLength(2);expect(new Set(plan.regions).size).toBe(2);expect(plan.regions.every(r=>bombingRegions(s).includes(r))).toBe(true);
 for(const a of [-1,0,1,2,3]){const v=publicView(s,a);if(a<=0)expect(v.stage3!.g!.forecast).toEqual(plan);else expect(v.stage3!.g).not.toHaveProperty('forecast');expect(v).not.toHaveProperty('random');expect(v.stage3!.g).not.toHaveProperty('dice');expect(v.events).toEqual(events);}
 for(let n=0;n<12;n++)integer(s.random,6);const rng=structuredClone(s.random);classicEnvironmentHits(s);expect(s.classic!.bombs).toEqual(plan.regions);expect(s.random).toEqual(rng);expect(s.classic!.bombRound).toBe(s.round);
});
it('temporary absence keeps later-round forecasts, death stops new forecasts and revival resumes at the next round',()=>{
 const s=observer();s.stage4!.offMap[0]={reason:'test'} as any;refreshClassicRound(s);expect(s.stage3!.g!.forecast?.round).toBe(1);
 const plan=structuredClone(s.stage3!.g!.forecast)!;s.players[0].hp=0;s.players[0].eliminated=1;classicEnvironmentHits(s);expect(s.classic!.bombs).toEqual(plan.regions);
 s.round++;refreshClassicRound(s);expect(s.stage3!.g!.forecast).toBeNull();s.players[0].hp=1;s.players[0].eliminated=null;expect(s.stage3!.g!.forecast).toBeNull();s.round++;refreshClassicRound(s);expect(s.stage3!.g!.forecast?.round).toBe(s.round);
});
it('forecast pool includes protected regions only after all poisonable regions have become poisoned',()=>{
 const s=observer();s.classic!.poison=poisonRegions(s.version);s.random.bombs=['教学楼','操场'];refreshClassicRound(s);expect(s.stage3!.g!.forecast?.regions).toEqual(['教学楼','操场']);const seed=s.random.seed;classicEnvironmentHits(s);expect(s.classic!.bombs).toEqual(['教学楼','操场']);expect(s.random.seed).toBe(seed);
});
it('games without a living observer and saved v17 keep the original poison/bomb RNG flow',()=>{
 for(const dead of [false,true]){const s=dead?observer():gFixture();if(dead)s.players[0].hp=0;const legacy=structuredClone(s);legacy.version='web-v0.1.17';refreshClassicRound(s);refreshClassicRound(legacy);expect(s.stage3!.g!.forecast).toBeNull();expect(s.random).toEqual(legacy.random);const hits=classicEnvironmentHits(s),old=classicEnvironmentHits(legacy);expect(hits).toEqual(old);expect(s.classic).toEqual(legacy.classic);expect(s.random).toEqual(legacy.random);}
 const old=fixture('web-v0.1.17');refreshClassicRound(old);expect(old.stage3).not.toHaveProperty('g');
});
it('own end offers a free30s optional invisibility roll without renewing60s; success expires at own next start',()=>{
 let s=observer();s.random.dice=[4];const ap=s.players[0].ap;s=gRun(s,{type:'end'},true,s.time+1500);expect(s.choice).toMatchObject({kind:'g-invisible',actor:0});expect(s.choice!.deadline-s.time).toBe(30000);expect(s.clock.remaining).toBe(58500);s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.stage3!.g!.invisible[0]).toBe(true);expect(s.players[0].ap).toBe(ap);expect(s.active).toBe(1);
 for(let n=0;n<3;n++)s=gDrain(gRun(s,{type:'end'}));expect(s.active).toBe(0);expect(s.stage3!.g!.invisible[0]).toBe(false);
});
it('decline, failed roll and timeout never grant invisibility or spend AP; timeout does not roll',()=>{
 for(const mode of ['decline','fail','timeout']){let s=observer();s.random.dice=[3];const ap=s.players[0].ap;s=gRun(s,{type:'end'});s=mode==='timeout'?gRun(s,{type:'tick'},true,s.choice!.deadline):gRun(s,{type:'choose',choice:s.choice!.id,accept:mode==='fail'});expect(s.stage3!.g!.invisible[0]).toBe(false);expect(s.players[0].ap).toBe(ap);expect(s.random.dice).toEqual(mode==='fail'?[]:[3]);}
});
it('programming can modify the invisibility die without repeating the end window or consuming AP',()=>{
 let s=gFixture(['character-012','character-033','character-025','character-031']);s.random.dice=[2,6];s=gRun(s,{type:'end'});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toMatchObject({kind:'g-program',actor:1});expect(s.stage3!.g!.invisible[0]).toBe(false);s=JSON.parse(JSON.stringify(s));s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.stage3!.g!.invisible[0]).toBe(true);expect(s.active).toBe(1);expect(s.events.filter(e=>e.type==='choice'&&e.text.includes('g-invisible'))).toHaveLength(1);
});
it('single attack, tactic, swap and tea menus and direct submissions all exclude invisible others',()=>{
 for(const card of ['basic-006#01','basic-009#01','basic-016#01','basic-019#01','basic-021#01','basic-024#01']){const s=hidden();give(s,0,card);expect(stage3Actions(s,0).cards[card]?.targets??stage4Targets(s,0,card)).not.toContain(1);gRun(s,{type:'play',card,targets:[1]},false);expect(stage3AttackTargets(s,0,card)).not.toContain(1);expect(stage4Targets(s,0,card)).not.toContain(1);}
 const tea=hidden();tea.stage4!.tea[0]=true;give(tea,0,'basic-002#01');expect(stage4TeaTargets(tea,0)).not.toContain(1);gRun(tea,{type:'play',card:'basic-002#01',targets:[1],direction:'left'},false);
});
it('actual group identity stays group with only one target, while self cards and role targeting still work',()=>{
 let s=hidden();s.players[1].ap=0;give(s,0,'basic-005#01');const hp=s.players[1].hp;expect(stage3AttackTargets(s,0,'basic-005#01')).toContain(1);s=gDrain(gRun(s,{type:'play',card:'basic-005#01',targets:[1]}));expect(s.players[1].hp).toBe(hp-3);
 s=hidden();s.active=1;s.players[1].hp=1;give(s,1,'basic-039#01');s=gDrain(gRun(s,{type:'play',card:'basic-039#01',targets:[]}));expect(s.players[1].hp).toBe(2);
 s=hidden();s.players[0].character='character-022';expect(gDogTargets(s,0)).toContain(1);expect(gCardTargetAllowed(s,0,1,'basic-005')).toBe(true);expect(gCardTargetAllowed(s,1,1,'basic-006')).toBe(true);
});
it('invisible casters block enemy single response/counter cards, but self defense and group responses remain legal',()=>{
 let s=observer();s.stage3!.g!.invisible[0]=true;s.players[0].cell='r1c2';s.players[1].cell='r2c2';s.players[2].cell='r2c3';give(s,0,'basic-008#01');give(s,1,'basic-001#01');give(s,1,'basic-002#01');s=gRun(s,{type:'play',card:'basic-008#01',targets:[1]});expect(s.choice).toMatchObject({kind:'response',actor:1,cards:['basic-001#01']});gRun(s,{type:'choose',choice:s.choice!.id,card:'basic-002#01'},false);s=gDrain(s);
 s=observer();s.stage3!.g!.invisible[0]=true;give(s,0,'basic-003#01');give(s,1,'basic-004#01');s=gRun(s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.choice?.cards).toContain('basic-004#01');
 s=observer();s.stage3!.g!.invisible[0]=true;give(s,0,'basic-039#01');give(s,1,'basic-038#01');const c={actor:0,definition:'basic-039'} as any;expect(stage4CounterCards(s,1,c)).toEqual([]);s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice).toBeNull();
});
it('environment hazards keep damaging invisible observers and old versions ignore the G targeting flag',()=>{
 const s=hidden();refreshClassicRound(s);s.classic!.poison.push('教学楼');expect(classicEnvironmentHits(s).find(h=>h.target===1)?.amount).toBeGreaterThan(0);s.version='web-v0.1.17';expect(gCardTargetAllowed(s,0,1,'basic-006')).toBe(true);
});
it('equipment reflection still damages an invisible caster without treating the gear as a single card',()=>{
 let s=observer();s.stage3!.g!.invisible[0]=true;equip(s,1,'basic-051#01');give(s,0,'basic-007#01');const hp=s.players[0].hp;
 s=gRun(s,{type:'play',card:'basic-007#01',targets:[1]});expect(s.choice).toMatchObject({kind:'gear-reflect',actor:1});s=gRun(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0].hp).toBe(hp-1);expect(s.stage3!.g!.invisible[0]).toBe(true);
});
