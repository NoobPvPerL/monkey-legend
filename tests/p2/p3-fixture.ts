import {expect} from 'vitest';
import {createGame,dispatch,validateState} from '../../packages/game-core/src/index';
import type {GameState,Command} from '../../packages/game-core/src/index';
import type {CharacterId} from '../../packages/game-data/src/index';
import {cardApCost} from '../../packages/game-core/src/stage3-resources';
import type {PGlite} from '@electric-sql/pglite';
let serial=0;
export function fixture(version:GameState['version']='web-v0.1.12',characters=['character-013','character-048','character-025','character-026'],mode:'ffa'|'team'='ffa'){
 const s=createGame({mode,ruleVersion:version,seed:42,seats:[0,1,2,3],first:0,characters:characters as CharacterId[],...(mode==='team'?{teams:['A','B','A','B']}: {})},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r2c4','r1c3','r2c2','r2c6'][p.seat];p.ap=20;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};validateState(s);return s;
}
export function give(s:GameState,a:number,card:string){s.deck=s.deck.filter(c=>c!==card);s.discard=s.discard.filter(c=>c!==card);for(const p of s.players)p.hand=p.hand.filter(c=>c!==card);s.players[a].hand.push(card);validateState(s);}
export function equip(s:GameState,a:number,card:string){give(s,a,card);s.players[a].hand=s.players[a].hand.filter(c=>c!==card);s.stage3!.equipment[a].push(card);s.stage3!.equipmentSources[card]=cardApCost(s as any,a,card,1).effect;validateState(s);}
export async function run(db:PGlite,s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:'p3-'+(++serial),revision:s.revision,actor:s.choice?.actor??s.active,...body} as Command,ts=dispatch(s,cmd,at);
 const sql=(await db.query<{v:ReturnType<typeof dispatch>}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);if(!ok)expect(ts.state).toEqual(s);else validateState(ts.state);return ts.state;
}
export async function drain(db:PGlite,s:GameState){
 for(let i=0;s.choice&&i<50;i++){const c=s.choice;s=await run(db,s,{type:'choose',choice:c.id,accept:false,...(c.count?{cards:[...s.players[c.actor].hand].sort().slice(0,c.count)}:{}),...(c.kind==='elbow-push'?{cell:c.cells?.[0]}:{})});}expect(s.choice).toBeNull();return s;
}
