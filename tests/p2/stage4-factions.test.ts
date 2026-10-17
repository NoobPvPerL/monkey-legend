import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame,dispatch,validateState} from '../../packages/game-core/src/index';
import {isWaterNative} from '../../packages/game-core/src/locations';
import {comboTeams} from '../../packages/game-core/src/stage3-resources';
import type {ResourceState} from '../../packages/game-core/src/stage3-resources';
import type {GameState,Command} from '../../packages/game-core/src/types';
const db=await database(undefined,17);afterAll(()=>db.close());await db.exec(await readFile('database/engine/stage4-generated.sql','utf8'));
function fixture(mode:'ffa'|'team'='ffa',characters:NonNullable<Parameters<typeof createGame>[0]['characters']>=['character-048','character-027','character-026','character-031']){
 const s=createGame({mode,ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],characters,teams:['A','A','B','B'],first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=50;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};return s;
}
function hand(s:GameState,a:number,...cards:string[]){for(const card of cards){s.deck=s.deck.filter(c=>c!==card);for(const p of s.players)p.hand=p.hand.filter(c=>c!==card);s.players[a].hand.push(card);}validateState(s);}
let serial=0;
async function command(s:GameState,body:Record<string,unknown>,ok=true){
 const cmd={id:'faction-'+(++serial),revision:s.revision,actor:s.active,...body} as Command,at=s.time+1;
 const ts=dispatch(s,cmd,at),sql=(await db.query<{v:any}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);return ts.state;
}
async function play(s:GameState,card:string,target:number){s=await command(s,{type:'skill',kind:'quote-cost',card});return command(s,{type:'play',card,targets:[target]});}
it('FFA changes faction and restoration but never merges personal teams or changes native water traits',async()=>{
 let s=fixture();hand(s,0,'basic-030#01','basic-036#01');s.random.dice=[1,1];const teams=s.players.map(p=>p.team);
 s=await play(s,'basic-030#01',1);expect(s.players[1].faction).toBe('帝汶家族');expect(s.players.map(p=>p.team)).toEqual(teams);expect(isWaterNative(s.version,s.players[1].character)).toBe(false);
 s=await play(s,'basic-036#01',1);expect(s.players[1].faction).toBe('中立');expect(s.stage4!.conversion[1]).toBeNull();
});
it('the latest conversion replaces the previous one and clearing restores original, not the overwritten conversion',async()=>{
 let s=fixture();hand(s,0,'basic-029#01','basic-030#01','basic-035#01','basic-036#01');s.random.dice=[1,1,1,1];
 s=await play(s,'basic-029#01',1);s=await play(s,'basic-030#01',1);expect(s.stage4!.conversion[1]).toBe('dimon');
 s=await command(s,{type:'skill',kind:'quote-cost',card:'basic-035#01'});const prior=structuredClone(s);s=await command(s,{type:'play',card:'basic-035#01',targets:[1]},false);expect(s).toEqual(prior);
 s=await play(s,'basic-036#01',1);expect(s.players[1].faction).toBe('中立');expect(s.stage4!.conversion[1]).toBeNull();
});
it('2v2 moves neutral players to the corresponding team and clearing restores their actual selected team',async()=>{
 let s=fixture('team');hand(s,0,'basic-029#01','basic-035#01');s.random.dice=[1,1];
 s=await play(s,'basic-029#01',2);expect(s.players[2]).toMatchObject({faction:'机械猴子',team:'A'});expect(s.result).toBeNull();
 s=await play(s,'basic-035#01',2);expect(s.players[2]).toMatchObject({faction:'帝汶家族',team:'B'});
});
it('converting the final enemy ends naturally after the chain without constructing an invalid empty-team ranking',async()=>{
 let s=fixture('team');hand(s,0,'basic-029#01','basic-029#02');s.random.dice=[1,1];
 s=await play(s,'basic-029#01',2);s=await play(s,'basic-029#02',3);
 expect(s.phase).toBe('over');expect(s.result).toMatchObject({reason:'natural',winners:[0,1,2,3]});expect(s.result!.ranking).toHaveLength(1);expect(s.cardStack!.stack).toEqual([]);validateState(s);
});
it('self-conversion is legal while FFA identity, health and fixed birthplace remain unchanged',async()=>{
 let s=fixture();hand(s,0,'basic-030#01');s.random.dice=[1];const before={cell:s.players[0].cell,hp:s.players[0].hp,character:s.players[0].character,team:s.players[0].team};
 s=await play(s,'basic-030#01',0);expect(s.players[0]).toMatchObject(before);expect(s.players[0].faction).toBe('帝汶家族');
});
it('a nonmechanical FFA source cannot convert North and a role-free conversion cannot affect Mei',async()=>{
 let s=fixture('ffa',['character-048','character-006','character-026','character-031']);hand(s,0,'basic-029#01');s.random.dice=[1];s=await play(s,'basic-029#01',1);expect(s.stage4!.conversion[1]).toBeNull();expect(s.players[0].ap).toBe(46);
 s=fixture('ffa',['character-003','character-027','character-026','character-031']);s.stage3!.jjFree[0]=true;hand(s,0,'basic-029#01');s.random.dice=[1];s=await play(s,'basic-029#01',2);expect(s.stage4!.conversion[2]).toBeNull();expect(s.players[0].ap).toBe(50);
});
it('combo history stays with its original team when its character owner changes teams',async()=>{
 let s=fixture('team',['character-048','character-027','character-010','character-031']);s.stage3!.combos={B:['basic-015','basic-016','basic-037']};
 hand(s,0,'basic-029#01');s.random.dice=[1];s=await play(s,'basic-029#01',2);
 expect(s.stage3!.combos.B).toEqual(['basic-015','basic-016','basic-037']);expect(s.stage3!.combos.A).toEqual(['basic-029']);expect(comboTeams(s as GameState&ResourceState)).toEqual([]);expect(s.result).toBeNull();
});
