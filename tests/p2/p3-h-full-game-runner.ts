import {boardWater} from '../../packages/game-core/src/stage4-board';
import {gPrimeActive} from '../../packages/game-core/src/p3-g-cards';
import {hDevelopmentSQL} from '../../tools/p3-h-runtime-patch.mjs';
import {hProfile} from './p3-h-fixture';
import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {writeFile} from 'node:fs/promises';
import {createGame,createHDevelopmentGame,dispatch,validateState,legalSteps} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import type {Command,GameState} from '../../packages/game-core/src/types';
export async function registerHFullGameSuite(activated=false){
const db=await database(undefined,activated?30:29);afterAll(()=>db.close());
if(!activated){const previous=(await db.query<{v:any}>("select value v from ml_private.catalog where key='ruleset:web-v0.1.18'")).rows[0].v;await db.exec(await hDevelopmentSQL(hProfile(previous)));}
const create=activated?createGame:createHDevelopmentGame;
const sqlFactory=activated?'create_game':'p3h_create_development';
const prefix=activated?'activated':'private';
let serial=0;let coverage:Record<string,number>={};
async function step(s:GameState,body:Record<string,unknown>,at=s.time+1){
 const cmd={id:'full-p3-'+(++serial),revision:s.revision,actor:s.choice?.actor??s.active,...body} as Command;
 const ts=dispatch(s,cmd,at),sql=(await db.query<{v:any}>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(ts.ok,JSON.stringify(cmd)+': '+ts.error).toBe(true);expect(sql.ok,sql.error).toBe(true);const diffs:string[]=[];const diff=(a:any,b:any,p='')=>{if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],p+'.'+k);}else diffs.push(`${p}: TS=${JSON.stringify(a)} SQL=${JSON.stringify(b)}`);};diff(JSON.parse(JSON.stringify(ts.state)),sql.state);if(diffs.length)throw Error(JSON.stringify(cmd)+'\n'+diffs.slice(0,20).join('\n'));validateState(ts.state);if(s.choice)coverage[s.choice.kind]=(coverage[s.choice.kind]??0)+1;if(cmd.type==='skill')coverage['skill:'+cmd.kind]=(coverage['skill:'+cmd.kind]??0)+1;return ts.state;
}
function choice(s:GameState):Record<string,unknown>{
 const c=s.choice!,p=s.players[c.actor],base={type:'choose',choice:c.id};
 if(c.kind==='h-equip-draw')return {...base,accept:true};
 if(c.kind==='h-small')return {...base,accept:true};
 if(c.kind==='h-ren-retreat')return {...base,option:(c.data as {options:string[]}).options.includes('both')?'both':'pass'};
 if(c.kind==='h-birth'||c.kind==='h-respect')return {...base,cell:c.cells?.[0]??null};
 if(c.kind==='h-ren-back'||c.kind==='h-ren-expel')return {...base,cell:c.cells?.[0]??null};
 if(c.kind==='h-ren-gear')return {...base,card:c.cards![0]};
 if(c.kind==='h-cooperate')return {...base,cards:[...p.hand].sort().slice(0,c.count)};
 if(c.kind==='h-circle-pay')return {...base,accept:p.ap>=1};
 if(c.kind==='h-reroll'||c.kind==='h-six')return {...base,accept:true};
 if(c.kind==='h-attract')return {...base,cell:c.cells![0]};
 if(c.kind==='g-program')return {...base,accept:true};
 if(c.kind==='g-math')return {...base,option:'6'};
 if(c.kind==='g-white-eye')return {...base,targets:c.targets!.slice(0,2)};
 if(['g-counter','g-invisible','g-haki'].includes(c.kind))return {...base,accept:true};
 if(c.kind==='g-food')return {...base,accept:p.hp<p.maxHp};
 if(['g-discard','f-discard','encourage-discard','discard','water-discard','xiao-overflow'].includes(c.kind))return {...base,cards:[...p.hand].sort().slice(0,c.count)};
 if(['response','forced-card','board-tax'].includes(c.kind))return {...base,...(c.kind==='board-tax'&&(c.data as any).mode==='desert'&&p.ap>0?{action:'ap'}:{card:c.cards?.[0]??null})};
 if(c.kind==='move-consent'||c.kind==='primitive-food'||c.kind==='encourage')return {...base,accept:true};
 if(c.kind==='f-tenacity')return {...base,option:String(Math.min(1,c.count??0))};
 if(c.kind==='f-target')return {...base,target:c.targets![0]};
 if(['f-self-harm','f-bccb','f-sting'].includes(c.kind))return {...base,accept:true};
 if(c.kind==='card-counter')return base;
 if(c.kind==='board-guess')return {...base,guess:(s.round%6)+1};
 if(c.kind==='board-path'||c.kind==='gear-push')return {...base,option:Object.keys(c.options!)[0]};
 if(['egg-move','force-step','teleport','board-cell','board-return','native-shore','gear-plant','gear-react','elbow-push'].includes(c.kind))return {...base,cell:c.cells?.[0]??null};
 if(c.kind==='west-carry')return base;
 if(c.kind==='gear-loss')return {...base,...(c.targets?.length?{target:c.targets[0]}:c.cells?.length?{cell:c.cells[0]}:{accept:true})};
 if(c.kind==='east-start')return {...base,action:'draw',target:c.targets![0]};
 if(c.kind==='xie-ledger')return {...base,target:c.targets![0]};
 if(c.kind==='revival-confirm')return {...base,accept:p.ap>=((c.data as any).cost??0)};
 if(['gear-cloak','gear-reflect','gear-terrain','draw-start','draw-end'].includes(c.kind))return {...base,accept:true};
 if(c.kind==='gear-chalk')return {...base,accept:p.ap>=1};
 return {...base,accept:false};
}
for(const mode of ['ffa','team'] as const)for(const seed of [42,917,1201,1202,1203,1204,1205,1206,1207,1208,1209,1210,1211])it(`${prefix} complete191-card ${mode} seed${seed} settles with matching TS/SQL at every command`,async()=>{
 coverage={};let s=create({mode,ruleVersion:'web-v0.1.19',seed,seats:[0,1,2,3],first:seed%4,characters:seed===1210?['character-050','character-011','character-021','character-034']:seed===1211?['character-050','character-035','character-041','character-016']:seed===1208?['character-041','character-011','character-029','character-042']:seed===1209?['character-041','character-035','character-036','character-016']:seed===1206?['character-035','character-036','character-016','character-024']:seed===1207?['character-035','character-001','character-011','character-039']:seed===1204?['character-034','character-030','character-011','character-039']:seed===1205?['character-034','character-021','character-033','character-042']:seed===1202?['character-030','character-019','character-025','character-042']:seed===1203?['character-030','character-011','character-039','character-015']:seed===1201?['character-011','character-015','character-039','character-021']:seed===42?['character-001','character-015','character-039','character-021']:['character-001','character-015','character-039','character-033']},1000);
 const sql=(await db.query<{v:GameState}>(`select ml_private.${sqlFactory}($1::jsonb,1000) v`,[JSON.stringify({mode,ruleVersion:'web-v0.1.19',seed,seats:[0,1,2,3],first:seed%4,characters:s.players.map(p=>p.character)})])).rows[0].v;expect(sql).toEqual(s);
 let currentTurn=-1,plays=0,commands=0,gasUsed=false;
 while(!s.result&&commands++<1200){
  if(s.stage3!.turn!==currentTurn){currentTurn=s.stage3!.turn;plays=0;gasUsed=false;}
  if(s.choice){s=await step(s,choice(s));continue;}
  if(s.phase==='moving'){const cells=legalSteps(s),occupied=s.players.some(p=>p.seat!==s.active&&p.hp>0&&!s.stage4!.offMap[p.seat]&&p.cell===s.players[s.active].cell);s=await step(s,cells.length&&(occupied||s.movement!.path.length<3)?{type:'step',path:[cells[(seed+commands)%cells.length]]}:{type:'stop'});continue;}
  if(s.stage4!.offMap[s.active]){s=await step(s,{type:'end'});continue;}
  const a=stage4Actions(s,s.active),p=s.players[s.active];let chosen:Record<string,unknown>|null=null;
  const f=stage3Actions(s,s.active);if(f.ren?.available){s=await step(s,{type:'skill',kind:'ren',target:f.ren.targets[0]});continue;}if(f.cooperate?.available){s=await step(s,{type:'skill',kind:'cooperate',target:f.cooperate.targets[0],cards:[p.hand[0]]});continue;}if(f.circle?.available){s=await step(s,{type:'skill',kind:'circle'});continue;}if(f.freeze?.available){s=await step(s,{type:'skill',kind:'freeze',target:f.freeze.targets[0]});continue;}if(f.dog?.available&&!gasUsed&&f.dog.targets.length){gasUsed=true;s=await step(s,{type:'skill',kind:'dog',target:f.dog.targets[0],direction:'right'});continue;}if(p.character==='character-052'&&!gasUsed&&p.ap>=2){gasUsed=true;s=await step(s,{type:'skill',kind:'magma'});continue;}
  if(f.execute?.available&&f.execute.targets.length&&p.hand.length){s=await step(s,{type:'skill',kind:'execute',card:p.hand[0],target:f.execute.targets[0]});continue;}
  if(p.character==='character-014'&&!gasUsed&&p.ap>=1){gasUsed=true;s=await step(s,{type:'skill',kind:'gas'});continue;}
  if(p.character==='character-038'&&!s.stage3!.e!.escapeUsed[p.seat]&&p.ap>=2){s=await step(s,{type:'skill',kind:'escape',region:a.regions[(seed+commands)%a.regions.length]});continue;}
  if(p.character==='character-046'&&!s.stage3!.c!.feather[p.seat]){s=await step(s,{type:'skill',kind:'feather'});continue;}
  if(p.character==='character-053'&&!s.stage3!.d!.clanUsed[p.seat]&&p.hand.length){s=await step(s,{type:'skill',kind:'clan'});continue;}
  if(p.character==='character-025'&&p.hp<p.maxHp&&p.ap>=3){s=await step(s,{type:'skill',kind:'mayi'});continue;}
  if(plays<4){const rotated=[...p.hand].sort().map((_,i,all)=>all[(i+seed+commands)%all.length]);
   for(const card of rotated){const info=a.cards[card],id=card.split('#')[0];if(['basic-063','basic-064'].includes(id)&&boardWater(s,p.cell,p.seat))continue;if(p.character==='character-029'&&p.ap>=2&&info.convertTargets.length&&commands%3===0){chosen={type:'play',card,targets:[info.convertTargets[0]],as:'dodge'};plays++;break;}if(!info.playable||!info.allowed||info.blocked||id==='basic-017'||info.targeted&&info.targets.length===0||info.equipment&&!info.equipment.allowed)continue;
    if(info.needsQuote){chosen={type:'skill',kind:'quote-cost',card};break;}
    const cost=info.costKind==='variable'?Math.min(2,p.ap-(gPrimeActive(s as any,p.seat)?1:0)):info.cost!;if(info.costKind==='variable'&&cost<1||p.ap<Math.max(0,cost+(info.costKind==='variable'&&gPrimeActive(s as any,p.seat)?1:0)))continue;
    const targets=info.targeted?info.targets.slice(0,1):[],body:Record<string,unknown>={type:'play',card,targets,northGroup:'others'};
    if(info.region)body.region=a.regions[(seed+commands)%a.regions.length];if(info.costKind==='variable')body.x=cost;
    if(info.equipment&&gPrimeActive(s as any,p.seat))body.replacements=info.equipment.cards;else if(info.equipment?.required)body.replacement=info.equipment.cards[0];
    if(id==='basic-073'){if(!a.copyMounts.length)continue;body.copy=a.copyMounts[(seed+commands)%a.copyMounts.length].card;}
    if(id==='basic-024'){const items=Object.keys(a.stealEquipment[targets[0]]??{}).filter(c=>!c.includes('~g')||a.stealEquipment[targets[0]][c].allowed);if(items.length&&commands%2===0){body.take='equipment';body.item=items[0];const options=a.stealEquipment[targets[0]][items[0]];if(options.allowed&&options.required)body.replacement=options.cards[0];}else body.take='hand';}
    if(info.elbow){const directions=Object.keys(info.pushes[targets[0]]??{});if(directions.length)body.direction=directions[0];}
    chosen=body;plays++;break;
   }
  }
  if(chosen){s=await step(s,chosen);continue;}
  if(!f.movementBlocked&&!p.moved&&!a.cards['none']&&commands%3===0&&!s.stage4!.tongBlocked[p.seat]&&!s.stage3!.horseLocks.length&&p.ap>=1){s=await step(s,{type:'move',...(p.character==='character-035'?{cell:f.leap!.cells[0]}:f.cube?.face===6?{cell:f.cube.teleportCells[0]}:{}),...(p.character==='character-040'?{direction:'right'}:{})});continue;}
  s=await step(s,{type:'end'});
 }
 expect(commands).toBeLessThan(1200);expect(s.result).not.toBeNull();expect(s.resolving).toEqual([]);expect(s.choice).toBeNull();expect(s.cardStack!.stack).toEqual([]);validateState(s);
 await writeFile(`artifacts/p3-batch-h/${prefix}-full-game-${mode}-${seed}.json`,JSON.stringify({scope:activated?'Normal H factories and isolated030 SQL; no production deployment':'H private TS and isolated PostgreSQL harness based on frozen029; this harness does not install030',mode,seed,characters:s.players.map(p=>p.character),commands,rounds:s.round,entities:191,allCommandsCompared:true,winners:s.result!.winners,events:s.events.length,choiceResolutionsAndSkills:coverage},null,2)+'\n');
},60000);

}
