import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {createGame,dispatch,validateState,legalSteps} from '../../packages/game-core/src/index';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import type {Command,GameState} from '../../packages/game-core/src/types';
const db=await database(undefined,20);afterAll(()=>db.close());
let serial=0;
async function step(s:GameState,body:Record<string,unknown>,at=s.time+1){
 const cmd={id:'full-stage4-'+(++serial),revision:s.revision,actor:s.choice?.actor??s.active,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=(await db.query<{v:any}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,JSON.stringify(cmd)+': '+ts.error).toBe(true);expect(sql.ok,sql.error).toBe(true);expect(sql.state).toEqual(ts.state);validateState(ts.state);return ts.state;
}
function choice(s:GameState):Record<string,unknown>{
 const c=s.choice!,p=s.players[c.actor],base={type:'choose',choice:c.id};
 if(['discard','water-discard','xiao-overflow'].includes(c.kind))return {...base,cards:[...p.hand].sort().slice(0,c.count)};
 if(['response','forced-card','board-tax'].includes(c.kind))return {...base,...(c.kind==='board-tax'&&(c.data as any).mode==='desert'&&p.ap>0?{action:'ap'}:{card:c.cards?.[0]??null})};
 if(c.kind==='card-counter')return base;
 if(c.kind==='board-guess')return {...base,guess:(s.round%6)+1};
 if(c.kind==='board-path'||c.kind==='gear-push')return {...base,option:Object.keys(c.options!)[0]};
 if(['teleport','board-cell','board-return','native-shore','gear-plant','gear-react','elbow-push'].includes(c.kind))return {...base,cell:c.cells?.[0]??null};
 if(c.kind==='west-carry')return base;
 if(c.kind==='gear-loss')return {...base,...(c.targets?.length?{target:c.targets[0]}:c.cells?.length?{cell:c.cells[0]}:{accept:true})};
 if(c.kind==='east-start')return {...base,action:'draw',target:c.targets![0]};
 if(c.kind==='xie-ledger')return {...base,target:c.targets![0]};
 if(c.kind==='revival-confirm')return {...base,accept:p.ap>=((c.data as any).cost??0)};
 if(['gear-cloak','gear-reflect','gear-terrain','draw-start','draw-end'].includes(c.kind))return {...base,accept:true};
 if(c.kind==='gear-chalk')return {...base,accept:p.ap>=1};
 return {...base,accept:false};
}
for(const mode of ['ffa','team'] as const)for(const seed of [42,917])it(`complete191-card ${mode} seed${seed} settles with matching TS/SQL at every command`,async()=>{
 let s=createGame({mode,ruleVersion:'web-v0.1.9',seed,seats:[0,1,2,3],first:seed%4,characters:seed===42?['character-003','character-027','character-026','character-048']:['character-040','character-045','character-044','character-031']},1000);
 const sql=(await db.query<{v:GameState}>('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify({mode,ruleVersion:'web-v0.1.9',seed,seats:[0,1,2,3],first:seed%4,characters:s.players.map(p=>p.character)})])).rows[0].v;expect(sql).toEqual(s);
 let currentTurn=-1,plays=0,commands=0;
 while(!s.result&&commands++<1200){
  if(s.stage3!.turn!==currentTurn){currentTurn=s.stage3!.turn;plays=0;}
  if(s.choice){s=await step(s,choice(s));continue;}
  if(s.phase==='moving'){const cells=legalSteps(s),occupied=s.players.some(p=>p.seat!==s.active&&p.hp>0&&!s.stage4!.offMap[p.seat]&&p.cell===s.players[s.active].cell);s=await step(s,cells.length&&(occupied||s.movement!.path.length<3)?{type:'step',path:[cells[(seed+commands)%cells.length]]}:{type:'stop'});continue;}
  if(s.stage4!.offMap[s.active]){s=await step(s,{type:'end'});continue;}
  const a=stage4Actions(s,s.active),p=s.players[s.active];let chosen:Record<string,unknown>|null=null;
  if(plays<4){const rotated=[...p.hand].sort().map((_,i,all)=>all[(i+seed+commands)%all.length]);
   for(const card of rotated){const info=a.cards[card],id=card.split('#')[0];if(!info.playable||!info.allowed||info.blocked||id==='basic-017'||info.targeted&&info.targets.length===0||info.equipment&&!info.equipment.allowed)continue;
    if(info.needsQuote){chosen={type:'skill',kind:'quote-cost',card};break;}
    const cost=info.costKind==='variable'?Math.min(2,p.ap):info.cost!;if(info.costKind==='variable'&&cost<1||p.ap<Math.max(0,cost))continue;
    const targets=info.targeted?info.targets.slice(0,1):[],body:Record<string,unknown>={type:'play',card,targets,northGroup:'others'};
    if(info.region)body.region=a.regions[(seed+commands)%a.regions.length];if(info.costKind==='variable')body.x=cost;
    if(info.equipment?.required)body.replacement=info.equipment.cards[0];
    if(id==='basic-073'){if(!a.copyMounts.length)continue;body.copy=a.copyMounts[(seed+commands)%a.copyMounts.length].card;}
    if(id==='basic-024'){const items=Object.keys(a.stealEquipment[targets[0]]??{});if(items.length&&commands%2===0){body.take='equipment';body.item=items[0];const options=a.stealEquipment[targets[0]][items[0]];if(options.allowed&&options.required)body.replacement=options.cards[0];}else body.take='hand';}
    if(info.elbow){const directions=Object.keys(info.pushes[targets[0]]??{});if(directions.length)body.direction=directions[0];}
    chosen=body;plays++;break;
   }
  }
  if(chosen){s=await step(s,chosen);continue;}
  if(!p.moved&&!a.cards['none']&&commands%3===0&&!s.stage4!.tongBlocked[p.seat]&&!s.stage3!.horseLocks.length&&p.ap>=1){s=await step(s,{type:'move',...(p.character==='character-040'?{direction:'right'}:{})});continue;}
  s=await step(s,{type:'end'});
 }
 expect(commands).toBeLessThan(1200);expect(s.result).not.toBeNull();expect(s.resolving).toEqual([]);expect(s.choice).toBeNull();expect(s.cardStack!.stack).toEqual([]);validateState(s);
},30000);
