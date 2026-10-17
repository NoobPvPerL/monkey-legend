import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame,dispatch,validateState,legalTargets,legalSteps} from '../../packages/game-core/src/index';
import {STAGE4_CARDS} from '../../packages/game-data/src/stage4';
import {stage4Actions,stage4PublicState} from '../../packages/game-core/src/stage4-view';
import {publicView} from '../../packages/game-core/src/index';
import * as resources from '../../packages/game-core/src/stage3-resources';
import type {GameState,Command} from '../../packages/game-core/src/types';
const db=await database(undefined,17);afterAll(()=>db.close());await db.exec(await readFile('database/engine/stage4-generated.sql','utf8'));
function fixture(characters:NonNullable<Parameters<typeof createGame>[0]['characters']>=['character-048','character-027','character-026','character-031']){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],characters,first:0},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=50;}
 s.choice=null;s.queue=[];s.phase='action';s.clock={remaining:60000,since:1000};return s;
}
function take(s:GameState,card:string){s.deck=s.deck.filter(c=>c!==card);s.discard=s.discard.filter(c=>c!==card);for(const p of s.players)p.hand=p.hand.filter(c=>c!==card);}
function hand(s:GameState,a:number,...cards:string[]){for(const card of cards){take(s,card);s.players[a].hand.push(card);}validateState(s);}
function gear(s:GameState,a:number,card:string,durability?:number){take(s,card);s.stage3!.equipment[a].push(card);s.stage3!.equipmentSources[card]={origin:'equipment',actor:a,faction:s.players[a].faction,roleModifiers:[]};if(durability!==undefined)s.stage4!.durability[card]=durability;validateState(s);}
function activate(s:GameState,a:number){s.active=a;s.cursor=s.order.indexOf(a);s.clock={remaining:60000,since:s.time};}
let serial=0;
async function command(s:GameState,body:Record<string,unknown>,ok=true,at=s.time+1){
 const cmd={id:'gear-'+(++serial),revision:s.revision,actor:s.active,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=(await db.query<{v:any}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,ts.error).toBe(ok);expect(sql.ok,sql.error).toBe(ok);expect(sql.state).toEqual(ts.state);validateState(ts.state);return ts.state;
}
async function play(s:GameState,card:string,fields:Record<string,unknown>={}){
 const cost=STAGE4_CARDS[card.split('#')[0] as keyof typeof STAGE4_CARDS].cost;
 if(cost.kind==='die'||cost.kind==='tiers')s=await command(s,{type:'skill',kind:'quote-cost',card});
 return command(s,{type:'play',card,targets:[],...fields});
}
async function choose(s:GameState,fields:Record<string,unknown>={}){return command(s,{type:'choose',actor:s.choice!.actor,choice:s.choice!.id,accept:false,...fields});}
async function settle(s:GameState){let n=0;while(s.choice&&n++<100){const c=s.choice;s=await choose(s,c.kind==='discard'||c.kind==='water-discard'?{cards:[...s.players[c.actor].hand].sort().slice(0,c.count)}:{});}expect(n).toBeLessThan(100);return s;}
async function sql(name:string,s:GameState,a?:number){return (await db.query<{v:any}>(`select ml_private.${name}($1::jsonb${a===undefined?'':',$2'}) v`,[JSON.stringify(s),...(a===undefined?[]:[a])])).rows[0].v;}
it('projects every one of the191 hand instances with exact TS/PostgreSQL costs, targets and required inputs',async()=>{
 const s=fixture();s.players[0].hand=[...s.deck];s.deck=[];for(const a of [0,1,2,3])expect(await sql('stage4_actions',s,a)).toEqual(stage4Actions(s,a));
 const actions=stage4Actions(s,0);expect(Object.keys(actions.cards)).toHaveLength(191);expect(actions.cards['basic-025#01']).toMatchObject({costKind:'variable',cost:null,targeted:false});expect(actions.cards['basic-024#01'].targeted).toBe(true);expect(actions.cards['basic-027#01']).toMatchObject({counter:true,playable:false});expect(actions.cards['basic-032#01'].region).toBe(true);
});
it('safe public state exposes actual board/gear statuses without source lineage, RNG or private quotes',async()=>{
 let s=fixture();gear(s,0,'basic-073#01',1);s.stage4!.copies['basic-073#01']='basic-070';hand(s,0,'basic-037#01');s.random.dice=[6];s=await command(s,{type:'skill',kind:'quote-cost',card:'basic-037#01'});s.stage4!.water['教学楼']={owner:0,effect:{origin:'card',actor:0,faction:s.players[0].faction,roleModifiers:[{actor:0,kind:'cost'}]}};
 expect(await sql('stage4_public_state',s)).toEqual(stage4PublicState(s));
 for(const a of [0,1,2,3]){const v=await sql('public_view',s,a);expect(v.actions.stage4).toEqual(stage4Actions(s,a));const {actions,...bare}=v;expect(bare).toEqual(publicView(s,a));const encoded=JSON.stringify(bare);for(const key of ['roleModifiers','costLocks','guessDie','random','buffSources','locks'])expect(encoded).not.toContain('"'+key+'"');if(a!==0)expect(JSON.stringify(v)).not.toContain('basic-037#01');}
});
it('offturn interrupt, terrain choice, private quotes and copied active mounts project only usable actions',async()=>{
 let s=fixture();gear(s,1,'basic-069#01');gear(s,0,'basic-073#01');s.stage4!.copies['basic-073#01']='basic-074';hand(s,1,'basic-017#01');expect(stage4Actions(s,1).canInterrupt).toBe(true);expect(stage4Actions(s,1).terrainSelectable).toBe(true);expect(stage4Actions(s,0).flightCells).toContain('r4c8');
 for(const a of [0,1,2,3])expect(await sql('stage4_actions',s,a)).toEqual(stage4Actions(s,a));s.stage4!.offMap[1]=true;expect(stage4Actions(s,1).canInterrupt).toBe(false);expect(stage4Actions(s,1).terrainSelectable).toBe(false);
});
it('food-granted elbow projects same-region targets,0AP and actual push directions while honoring toilet protection',async()=>{
 const s=fixture();hand(s,0,'basic-002#01');s.stage4!.tea[0]=true;s.stage4!.toiletUntil[1]=2;s.stage4!.toiletEffects[1]={origin:'card',actor:1,faction:s.players[1].faction,roleModifiers:[]};
 expect(await sql('stage4_actions',s,0)).toEqual(stage4Actions(s,0));expect(stage4Actions(s,0).cards['basic-002#01']).toMatchObject({tea:true,elbow:true,cost:0,targets:[]});
});
