import {afterAll,beforeAll,expect,it} from 'vitest';
import {hDevelopmentSQL} from '../../tools/p3-h-runtime-patch.mjs';
import {database} from './database';
import {hFixture,hProfile} from './p3-h-fixture';
import {give,equip} from './p3-fixture';
import {hObserveHp} from '../../packages/game-core/src/p3-h-state';
import {createGame,createHDevelopmentGame,publicView,dispatch,validateState} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {isActiveRuleVersion,runtimeForVersion} from '../../packages/game-data/src/index';
import {hRerollKey,hCanReroll} from '../../packages/game-core/src/p3-h-dice';
import {createDraft,createStage3Draft} from '../../packages/game-core/src/draft';
const db=await database(undefined,29);afterAll(()=>db.close());
beforeAll(async()=>{const previous=(await db.query<{v:any}>("select value v from ml_private.catalog where key='ruleset:web-v0.1.18'")).rows[0].v;await db.exec(await hDevelopmentSQL(hProfile(previous)));});
let serial=0;
async function run(db:any,s:any,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:'h-'+(++serial),revision:s.revision,actor:s.choice?.actor??s.active,...body} as any,ts=dispatch(s,cmd,at),sql=(await db.query('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);
 const paths:string[]=[];function diff(a:any,b:any,p=''){if(a===undefined&&b===undefined)return;if(a===null||b===null||typeof a!=='object'||typeof b!=='object'){if(JSON.stringify(a)!==JSON.stringify(b))paths.push(p+': TS='+JSON.stringify(a)+' SQL='+JSON.stringify(b));return;}for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],p+'.'+k);}
 diff(JSON.parse(JSON.stringify(ts.state)),sql.state);if(paths.length)throw Error(paths.slice(0,14).join('\n'));if(ok)validateState(ts.state);else expect(ts.state).toEqual(s);return ts.state;
}
async function drain(s:ReturnType<typeof hFixture>){for(let i=0;s.choice&&i<80;i++){const c=s.choice;s=await run(db,s,{type:'choose',choice:c.id,accept:false,...(c.cells?.length?{cell:c.cells[0]}:{}),...(c.count?{cards:s.players[c.actor].hand.slice(0,c.count)}:{})});}expect(s.choice).toBeNull();return s;}
it('H local TS candidate is playable while the isolated SQL installer keeps normal factories and health on G',async()=>{
 expect(isActiveRuleVersion('web-v0.1.19')).toBe(true);expect(runtimeForVersion('web-v0.1.19').characterIds).toHaveLength(52);
 const setup={mode:'ffa' as const,seed:42,seats:[0,1,2,3],first:0,ruleVersion:'web-v0.1.19' as const,characters:['character-039','character-015','character-025','character-031'] as any};expect(createGame(setup,1000).version).toBe('web-v0.1.19');await expect(db.query('select ml_private.create_game($1::jsonb,1000)',[JSON.stringify(setup)])).rejects.toThrow('H批尚未完整启用');
 expect((await db.query<{v:any}>('select public.ml_health() v')).rows[0].v).toMatchObject({engineRevision:29,ruleVersion:'web-v0.1.18',characterDefinitions:43});
 const ts=createHDevelopmentGame(setup,1000),sql=(await db.query<{v:any}>('select ml_private.p3h_create_development($1::jsonb,1000) v',[JSON.stringify(setup)])).rows[0].v;expect(sql).toEqual(ts);
});
it('freezes next turn once, keeps start draws and full end bookkeeping, with no round change',async()=>{
 let s=hFixture();s.round=2;s=await run(db,s,{type:'skill',kind:'freeze',target:1});expect(s.players[0].ap).toBe(18);expect(s.stage3!.h!.frozenBy[1]).toBe(0);
 s=await run(db,s,{type:'end'});expect(s.active).toBe(2);expect(s.round).toBe(2);expect(s.players[1].hand).toHaveLength(2);expect(s.stage3!.starts[1]).toBe(1);expect(s.stage3!.ends[1]).toBe(1);expect(s.stage3!.h!.frozenBy[1]).toBeNull();
});
it('freeze cannot target self, an active-immune role, offmap/dead role, or spend without2AP',async()=>{
 for(const target of [0,1,2,3]){let s=hFixture(['character-039','character-044','character-025','character-031']);s.stage4!.offMap[2]=true;s.players[3].hp=0;s.players[3].eliminated=1;hObserveHp(s,true);await run(db,s,{type:'skill',kind:'freeze',target},false);}
 const s=hFixture();s.players[0].ap=1;await run(db,s,{type:'skill',kind:'freeze',target:1},false);
});
it('freeze cooldown counts exactly two own starts and does not stack the same pending target',async()=>{
 let s=hFixture();s=await run(db,s,{type:'skill',kind:'freeze',target:1});await run(db,s,{type:'skill',kind:'freeze',target:2},false);s.stage3!.starts[0]++;await run(db,s,{type:'skill',kind:'freeze',target:2},false);s.stage3!.starts[0]++;await run(db,s,{type:'skill',kind:'freeze',target:1},false);s=await run(db,s,{type:'skill',kind:'freeze',target:2});expect(s.players[0].ap).toBe(16);
});
it('skipped turn still performs turn-start place AP, end cave damage and hand limit',async()=>{
 let s=hFixture();s.players[1].cell='r2c8';s.classic!.caveEnds![1]=2;s=await run(db,s,{type:'skill',kind:'freeze',target:1});s=await run(db,s,{type:'end'});expect(s.players[1].hp).toBe(4);expect(s.stage3!.ends[1]).toBe(1);
});
it('6+6 start attraction uses sequential legal cells and preserves each original skill/movement gate',async()=>{
 let s=hFixture(['character-048','character-001','character-025','character-031']);s=await run(db,s,{type:'end'});expect(s.choice?.kind).toBe('h-attract');expect(s.choice!.deadline-s.time).toBe(30000);s=await drain(s);expect(s.active).toBe(1);expect(s.stage3!.basicUsed).toEqual([0,0,0,0]);
});
it('attraction consent rejection preserves monkey18 location and completes start exactly once',async()=>{
 let s=hFixture(['character-016','character-001','character-025','character-031']);s.players[0].cell='r2c4';const from=s.players[0].cell;s=await run(db,s,{type:'end'});expect(s.choice?.kind).toBe('move-consent');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:false});s=await drain(s);expect(s.players[0].cell).toBe(from);expect(s.stage3!.starts[1]).toBe(1);
});
it('final6 draws once after programming and math, survives JSON checkpoint and spends movement once',async()=>{
 let s=hFixture(['character-042','character-033','character-001','character-031']);s.random.dice=[6,2];s=await run(db,s,{type:'move'});expect(s.choice?.kind).toBe('g-program');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('g-math');s=await run(db,s,{type:'choose',choice:s.choice!.id,option:'6'});expect(s.choice?.kind).toBe('h-six');s=JSON.parse(JSON.stringify(s));s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[2].hand).toHaveLength(2);expect(s.movement?.remaining).toBe(3);expect(s.events.filter(e=>e.type==='draw'&&e.text==='S3 6+6 摸2张')).toHaveLength(1);s=await run(db,s,{type:'stop'});
});
it('overridden raw6 never triggers 6; final6 without programmers still permits optional draw',async()=>{
 let s=hFixture(['character-042','character-048','character-001','character-031']);s.random.dice=[6];s=await run(db,s,{type:'move'});s=await run(db,s,{type:'choose',choice:s.choice!.id,option:'2'});expect(s.choice).toBeNull();expect(s.players[2].hand).toEqual([]);
 s=hFixture(['character-048','character-001','character-025','character-031']);s.random.dice=[6];s=await run(db,s,{type:'move'});expect(s.choice?.kind).toBe('h-six');s=await run(db,s,{type:'tick'},true,s.choice!.deadline);expect(s.players[1].hand).toEqual([]);expect(s.movement?.remaining).toBe(3);
});
it('Monkey3 rerolls only its own original die after programmer, with no recursive 6 or duplicate draw',async()=>{
 let s=hFixture(['character-015','character-033','character-001','character-031']);s.random.dice=[6,2,6];s=await run(db,s,{type:'move'});expect(s.choice?.kind).toBe('g-program');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('h-reroll');expect(s.events.at(-1)?.text).toContain('等待选择：狂叫');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('h-six');expect(s.events.at(-1)?.text).toContain('等待选择：6：免费摸牌');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[2].hand).toHaveLength(2);expect(Object.values(s.stage3!.h!.rerollRoots)).toEqual([true]);expect(s.random.dice).toEqual([]);
});
it('Monkey3 crossing into tied lowest inserts one extra personal turn and resumes normal cursor',async()=>{
 let s=hFixture(['character-048','character-015','character-025','character-031']);s.players[1].hp=3;s.players[2].hp=2;hObserveHp(s,true);give(s,0,'basic-003#01');s.players[1].ap=0;s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});s=await drain(s);expect(s.active).toBe(1);expect(s.stage3!.h!.extraReturn).not.toBeNull();expect(s.round).toBe(1);s=await run(db,s,{type:'end'});expect(s.active).toBe(1);expect(s.stage3!.h!.extraReturn).toBeNull();expect(s.stage3!.starts[1]).toBe(2);
});
it('H actions/public projection agree without exposing private turn continuation or die transcripts',async()=>{
 const s=hFixture();for(const a of [0,1]){const result=(await db.query<{v:any}>('select ml_private.public_view($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v;delete result.actions;expect(result).toEqual(publicView(s,a));if(a>=0)expect((await db.query<{v:any}>('select ml_private.stage3_actions($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v).toEqual(stage3Actions(s,a));}
});
it('development installation is idempotent and leaves all18 saved catalogs and normal defaults intact',async()=>{
 const before=(await db.query<{key:string;value:any}>("select key,value from ml_private.catalog where key<>'ruleset:web-v0.1.19' order by key")).rows,previous=before.find((r:any)=>r.key==='ruleset:web-v0.1.18')!.value;
 const sql=await hDevelopmentSQL(hProfile(previous));await db.exec(sql);expect((await db.query<{key:string;value:any}>("select key,value from ml_private.catalog where key<>'ruleset:web-v0.1.19' order by key")).rows).toEqual(before);
 const setup={mode:'ffa',catalogVersion:'web-v0.1.19',order:[0,1,2,3],teams:['S1','S2','S3','S4'],pools:{},random:{seed:42,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false}};
 expect(()=>createDraft(setup as any,1000)).toThrow('角色阵营池尚未完整配置');await expect(db.query('select ml_private.create_draft($1::jsonb,1000)',[JSON.stringify(setup)])).rejects.toThrow('H批尚未完整启用');
 const random={seed:42,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false};expect((await db.query<{v:any}>("select ml_private.stage4_create_draft('ffa',$1::jsonb,1000) v",[JSON.stringify(random)])).rows[0].v).toEqual(createStage3Draft('ffa',random,1000,'web-v0.1.18'));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query('select ml_private.p3h_initial_state()')).rejects.toThrow('permission denied');await db.exec('reset role');}
});
it('all18 older saved games execute unchanged with the private H installation present',async()=>{
 for(let n=1;n<=18;n++){const s=createGame({mode:'ffa',seed:42,seats:[0,1,2,3],ruleVersion:`web-v0.1.${n}` as any},1000);const next=await run(db,s,{type:'tick'},true,1001);expect(next.stage3?.h).toBeUndefined();}
});
it('failed freeze validation is atomic on bad role, duplicate requests, invalid target and wrong active actor',async()=>{
 const s=hFixture();for(const fields of [{actor:1},{target:-1},{target:4},{target:1.5},{target:null},{target:undefined}])await run(db,s,{type:'skill',kind:'freeze',target:1,...fields},false);
 const g=createGame({mode:'ffa',seed:42,seats:[0,1,2,3],ruleVersion:'web-v0.1.18',characters:['character-021','character-010','character-003','character-037']},1000);await run(db,g,{type:'skill',kind:'freeze',target:1},false);
});
it('frozen draw choices and end visibility remain available before the normal next player',async()=>{
 let s=hFixture(['character-039','character-027','character-025','character-031']);s.round=2;s=await run(db,s,{type:'skill',kind:'freeze',target:1});s=await run(db,s,{type:'end'});expect(s.choice?.kind).toBe('draw-start');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('draw-end');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.active).toBe(2);expect(s.players[1].hand).toHaveLength(4);
 s=hFixture(['character-039','character-012','character-025','character-031']);s.random.dice=[6];s=await run(db,s,{type:'skill',kind:'freeze',target:1});s=await run(db,s,{type:'end'});expect(s.choice?.kind).toBe('g-invisible');s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.stage3!.g!.invisible[1]).toBe(true);expect(s.active).toBe(2);
});
it('attraction rejects illegal directions atomically and timeout selects a legal direction without clock reset',async()=>{
 let s=hFixture(['character-048','character-001','character-025','character-031']);s=await run(db,s,{type:'end'});expect(s.choice?.kind).toBe('h-attract');await run(db,s,{type:'choose',choice:s.choice!.id,cell:'r4c8'},false);await run(db,s,{type:'choose',choice:s.choice!.id,cell:null},false);const remaining=s.clock.remaining;s=await run(db,s,{type:'tick'},true,s.choice!.deadline);expect(s.clock.remaining).toBe(remaining);s=await drain(s);expect(s.clock.remaining).toBe(remaining);
});
it('attraction cannot move MeiMeiTao or a normal role into an occupied tile',async()=>{
 let s=hFixture(['character-026','character-001','character-025','character-031']);const from=s.players[0].cell;s=await run(db,s,{type:'end'});s=await drain(s);expect(s.players[0].cell).toBe(from);expect(new Set(s.players.filter(p=>p.hp>0).map(p=>p.cell)).size).toBe(4);
});
it('late timeout processes programmer, monkey reroll and final6 once with the paused budget intact',async()=>{
 let s=hFixture(['character-015','character-033','character-001','character-031']);s.random.dice=[6,2,1];s=await run(db,s,{type:'move'},true,1050);const rev=s.revision;s=await run(db,s,{type:'tick'},true,100000);expect(s.choice).toBeNull();expect(s.revision).toBe(rev+1);expect(s.players[2].hand).toEqual([]);expect(s.clock.remaining).toBe(59950);expect(s.movement?.remaining).toBe(3);expect(s.random.dice).toEqual([2,1]);
});
it('6 draw can reshuffle191 entities during a persisted checkpoint without random or owner duplication',async()=>{
 let s=hFixture(['character-048','character-001','character-025','character-031']);s.discard=s.deck;s.deck=[];s.random.dice=[6];s=await run(db,s,{type:'move'});s=JSON.parse(JSON.stringify(s));s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[1].hand).toHaveLength(2);expect(s.reshuffleCount).toBe(1);expect(s.deck).toHaveLength(189);expect(s.discard).toEqual([]);
});
it('non-role random draws do not trigger6 and wrong actors/final-result fields cannot resolve H windows',async()=>{
 let s=hFixture(['character-048','character-001','character-025','character-031']);give(s,0,'basic-039#01');s=await run(db,s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice).toBeNull();
 s=hFixture(['character-015','character-048','character-001','character-031']);s.random.dice=[6,2];s=await run(db,s,{type:'move'});expect(s.choice?.kind).toBe('h-reroll');for(const fields of [{actor:1},{choice:s.choice!.id+1},{accept:1},{revision:s.revision-1}])await run(db,s,{type:'choose',choice:s.choice!.id,...fields},false);s=await run(db,s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toBeNull();expect(s.random.dice).toEqual([]);
});
it('Monkey3 one-reroll allowance follows a movement chain across later step commands',()=>{
 const s=hFixture(['character-015','character-048','character-001','character-031']);s.stage3!.e!.current='revision42';const key=hRerollKey(s,0);s.stage3!.h!.rerollRoots[key]=true;s.movement={remaining:3,lastEmpty:s.players[0].cell,origin:s.players[0].cell,path:[s.players[0].cell],gearRoot:42};expect(hRerollKey(s,0)).toBe(key);expect(hCanReroll(s,0)).toBe(false);
});
it('Monkey3 already tied lowest and self-active injury never create repeated extra turns',async()=>{
 let s=hFixture(['character-048','character-015','character-025','character-031']);s.players[1].hp=2;s.players[2].hp=2;hObserveHp(s,true);s.players[1].ap=0;give(s,0,'basic-003#01');s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});s=await drain(s);expect(s.active).toBe(0);expect(s.stage3!.h!.pendingTurns).toEqual([]);
 s=hFixture(['character-015','character-048','character-025','character-031']);s.players[0].hp=3;s.players[2].hp=2;hObserveHp(s,true);s.players[0].hp=2;hObserveHp(s);expect(s.stage3!.h!.pendingTurns).toEqual([]);
});
it('Monkey3 extra turn can be frozen and still returns to the original normal start',async()=>{
 let s=hFixture(['character-039','character-015','character-025','character-031']);s.players[1].hp=3;s.players[2].hp=2;hObserveHp(s,true);s=await run(db,s,{type:'skill',kind:'freeze',target:1});s.players[1].ap=0;give(s,0,'basic-003#01');s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});s=await drain(s);expect(s.active).toBe(1);expect(s.stage3!.starts[1]).toBe(2);expect(s.stage3!.ends[1]).toBe(1);expect(s.stage3!.h!.extraReturn).toBeNull();
});

it('a successful interrupt during Monkey3 extra turn discards the old return cursor and keeps the new round order',async()=>{
 let s=hFixture(['character-048','character-015','character-025','character-031']);s.players[1].hp=3;s.players[2].hp=2;hObserveHp(s,true);give(s,0,'basic-003#01');s.players[1].ap=0;s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});s=await drain(s);expect(s.active).toBe(1);expect(s.stage3!.h!.extraReturn).not.toBeNull();give(s,3,'basic-017#01');s=await run(db,s,{type:'play',actor:3,card:'basic-017#01',targets:[]});s=await drain(s);expect(s.round).toBe(2);expect(s.order).toEqual([3,0,1,2]);expect(s.active).toBe(3);expect(s.stage3!.h!.extraReturn).toBeNull();s=await run(db,s,{type:'end'});s=await drain(s);expect(s.active).toBe(0);expect(s.round).toBe(2);
});
it('an interrupt reserved before injury resolves before the pending Monkey3 extra turn without losing either intent',async()=>{
 let s=hFixture(['character-048','character-015','character-025','character-031']);s.players[1].hp=3;s.players[2].hp=2;hObserveHp(s,true);give(s,0,'basic-003#01');give(s,1,'basic-004#01');give(s,3,'basic-017#01');s.players[1].ap=0;s=await run(db,s,{type:'play',card:'basic-003#01',targets:[1]});expect(s.choice).not.toBeNull();s=await run(db,s,{type:'play',actor:3,card:'basic-017#01',targets:[]});expect(s.stage4!.interrupts).toHaveLength(1);s=await run(db,s,{type:'choose',choice:s.choice!.id,card:null,accept:false});s=await drain(s);expect(s.round).toBe(2);expect(s.order).toEqual([3,0,1,2]);expect(s.active).toBe(1);expect(s.stage3!.h!.extraReturn).not.toBeNull();const interrupt=s.events.findIndex(e=>e.type==='interrupt'),extra=s.events.findIndex(e=>e.text.includes('拖动进度条：插入'));expect(interrupt).toBeGreaterThan(-1);expect(extra).toBeGreaterThan(interrupt);s=await run(db,s,{type:'end'});s=await drain(s);expect(s.active).toBe(0);expect(s.stage3!.h!.extraReturn).toBeNull();
});
