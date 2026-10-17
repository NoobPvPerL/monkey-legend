import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {budget,createGame,dispatch,legalTargets,publicView} from '../../packages/game-core/src/index';
import {ALL_CARDS,CHARACTER_IDS,cardForVersion} from '../../packages/game-data/src/index';
import type {Command,GameState} from '../../packages/game-core/src/types';
import {commandSchema} from '../../packages/online/src/protocol';
const db=await database();afterAll(()=>db.close());
it('online protocol accepts three targets and rejects four, leaving versioned legality to the engine',()=>{
 const input={op:'game',requestId:'three',matchId:'12345678-1234-4234-8234-123456789abc',revision:0,intent:{type:'play',card:'basic-003#01',targets:[1,2,3]}};
 expect(commandSchema.safeParse(input).success).toBe(true);expect(commandSchema.safeParse({...input,intent:{...input.intent,targets:[0,1,2,3]}}).success).toBe(false);
});
function fixture(card:string,version:'web-v0.1.1'|'web-v0.1.2'='web-v0.1.2',team=false){
 const s=createGame({mode:team?'team':'ffa',teams:['A','A','B','B'],seed:5,seats:[0,1,2,3],characters:[...CHARACTER_IDS],first:0,deck:[...ALL_CARDS],ruleVersion:version},1000);
 s.deck.push(...s.players.flatMap(p=>p.hand));for(const p of s.players)p.hand=[];
 function give(actor:number,id:string){const index=s.deck.findIndex(c=>c.startsWith(id+'#'));const [instance]=s.deck.splice(index,1);s.players[actor].hand.push(instance);return instance;}
 const instance=give(0,card);for(let i=1;i<4;i++){give(i,'basic-039');give(i,'basic-001');}
 // No automatic response choices unless a test explicitly asks for one.
 for(let i=1;i<4;i++){const defense=s.players[i].hand.pop()!;s.deck.push(defense);give(i,'basic-009');}
 return {s,instance,give};
}
async function step(s:GameState,input:Record<string,unknown>,at=1100,ok=true){
 const cmd={id:`feedback-${s.revision}`,actor:0,revision:s.revision,...input} as Command;
 const ts=dispatch(s,cmd,at),sql=(await db.query<{v:ReturnType<typeof dispatch>}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(sql.ok,sql.error).toBe(ts.ok);expect(sql.state).toEqual(ts.state);expect(ts.ok,ts.error).toBe(ok);return ts.state;
}
for(const [id,power] of [['basic-003',1],['basic-004',2],['basic-005',3]] as const)it(`${id} is always a group attack and can hit all three enemies`,async()=>{
 const {s,instance}=fixture(id);s.players[2].ap=0;s.players[2].skillUsed=true;
 const t=await step(s,{type:'play',card:instance,targets:[1,2,3]});
 expect(t.choice,JSON.stringify(t.events.slice(-3))).toBeNull();expect(t.players[0].ap).toBe(5-power);expect(t.players[1].ap).toBe(5-power);expect(t.players[2].hp).toBe(3-power);expect(t.players[3].ap).toBe(5-power);
 expect(t.events.filter(e=>e.type==='play')).toHaveLength(1);expect(cardForVersion(id,s.version).group).toBe(true);
});
it('group targeting respects one-card immunity, excludes teammates, and bypasses single-target taunt',async()=>{
 let {s,instance}=fixture('basic-003');s.deck.push(s.players[1].hand.pop()!);
 expect(legalTargets(s,0,instance)).toEqual([2,3]);
 const sql=(await db.query<any>('select ml_private.targets($1::jsonb,0,$2) v',[JSON.stringify(s),instance])).rows[0].v;expect(sql).toEqual([2,3]);
 await step(s,{type:'play',card:instance,targets:[1]},1100,false);
 const team=fixture('basic-003','web-v0.1.2',true);expect(legalTargets(team.s,0,team.instance)).toEqual([2,3]);await step(team.s,{type:'play',card:team.instance,targets:[1]},1100,false);
 // Attack from seat 2 may freely select another enemy even while lemon is legal.
 s=fixture('basic-003').s;expect(legalTargets(s,2,'basic-003#01')).toEqual([0,1,3]);
});
it('headbutt transfers all current AP, preserves zero-AP damage and old-match two-point cap',async()=>{
 for(const version of ['web-v0.1.1','web-v0.1.2'] as const){const {s,instance}=fixture('basic-008',version);s.players[1].cell='r4c2';s.players[1].ap=9;const t=await step(s,{type:'play',card:instance,targets:[1]});expect(t.players[1].ap).toBe(version==='web-v0.1.2'?0:7);expect(t.players[0].ap).toBe(version==='web-v0.1.2'?13:6);expect(t.events.findLast(e=>e.type==='ap')?.text).toContain(version==='web-v0.1.2'?'吸收全部9AP（目标AP 9→0）':'吸收2AP');}
 const {s,instance}=fixture('basic-008');s.players[1].cell='r4c2';s.players[1].ap=0;const t=await step(s,{type:'play',card:instance,targets:[1]});expect(t.players[1].hp).toBe(3);expect(t.players[0].ap).toBe(4);
});
it('three lethal enemy hits reach settlement with three kills in both engines and the public view',async()=>{
 const {s,instance}=fixture('basic-005');for(let i=1;i<4;i++){s.players[i].hp=1;s.players[i].ap=0;s.players[i].skillUsed=true;}
 const t=await step(s,{type:'play',card:instance,targets:[1,2,3]});
 expect(t.result?.reason).toBe('natural');expect(t.players[0]).toMatchObject({kills:3,damage:3});expect(t.result?.ranking[0]).toMatchObject({players:[0],kills:3,damage:3});
 const view=(await db.query<any>('select ml_private.public_view($1::jsonb,0) v',[JSON.stringify(t)])).rows[0].v;
 expect(view.result).toEqual(publicView(t,0).result);expect(view.players[0].kills).toBe(3);
});
it('environmental elimination leaves every player kill counter at zero in both engines',async()=>{
 const {s}=fixture('basic-003');s.round=3;s.active=3;s.cursor=3;s.phase='action';s.choice=null;s.queue=[];
 s.players[0].cell='r2c4';s.players[1].cell='r2c3';s.players[2].cell='r1c1';s.players[3].cell='r2c5';s.players[2].hp=1;
 const t=await step(s,{actor:3,type:'end'});expect(t.round).toBe(4);expect(t.players[2].hp).toBe(0);expect(t.players.map(p=>p.kills)).toEqual([0,0,0,0]);
 expect(t.events.findLast(e=>e.type==='damage')?.text).toContain('环境伤害1');
});
it('new headbutt can still be cancelled by defense or elbow; elbow retains its own two-point cap',async()=>{
 for(const id of ['basic-001','basic-002']){const {s,instance,give}=fixture('basic-008');s.players[1].cell='r4c2';s.players[1].ap=9;const response=give(1,id);let t=await step(s,{type:'play',card:instance,targets:[1]});expect(t.choice?.kind).toBe('response');t=await step(t,{actor:1,type:'choose',choice:t.choice!.id,card:response},1200);expect(t.players[1].ap).toBe(id==='basic-002'?11:8);expect(t.players[0].ap).toBe(id==='basic-002'?2:4);}
});
it('discard gets a full 20-second window only in new matches, including after personal timeout',async()=>{
 for(const version of ['web-v0.1.1','web-v0.1.2'] as const){const {s,give}=fixture('basic-003',version);while(s.players[0].hand.length<=s.players[0].hp)give(0,'basic-009');const t=await step(s,{type:'tick'},61000);expect(t.choice?.kind).toBe('discard');expect(t.choice!.deadline).toBe(version==='web-v0.1.2'?81000:71000);const u=await step(t,{type:'tick'},70999);expect(u.choice?.id).toBe(t.choice!.id);const v=await step(u,{type:'tick'},t.choice!.deadline);expect(v.players[0].hand).toHaveLength(5);}
});
it('successful active cards immediately reset 60 seconds; invalid plays, movement and replies do not',async()=>{
 const {s,instance,give}=fixture('basic-003');const response=give(1,'basic-001');
 let t=await step(s,{type:'play',card:instance,targets:[1]},59000);expect(t.clock).toEqual({remaining:60000,since:null});expect(t.choice?.deadline).toBe(69000);
 t=await step(t,{actor:1,type:'choose',choice:t.choice!.id,card:response},65000);expect(t.clock).toEqual({remaining:60000,since:65000});
 const invalid=await step(t,{type:'play',card:instance,targets:[1]},66000,false);expect(invalid.clock).toEqual(t.clock);
 const moved=await step(t,{type:'move'},66000);expect(budget(moved,66000)).toBe(59000);
 const food=fixture('basic-039');const ate=await step(food.s,{type:'play',card:food.instance,targets:[]},59000);expect(ate.clock).toEqual({remaining:60000,since:59000});
 const old=fixture('basic-039','web-v0.1.1');const legacy=await step(old.s,{type:'play',card:old.instance,targets:[]},59000);expect(budget(legacy,59000)).toBe(2000);
});

