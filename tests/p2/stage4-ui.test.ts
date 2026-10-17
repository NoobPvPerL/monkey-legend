import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGame,publicView,legalTargets,legalSteps,dispatch} from '../../packages/game-core/src/index';
import type {GameState} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import type {OnlineGame,Snapshot,Intent} from '../../packages/online/src/protocol';
import {commandSchema} from '../../packages/online/src/protocol';
import {prepareGameCommand,playBlockReason} from '../../apps/client/src/interaction-guards';
import Stage4Controls from '../../apps/client/src/Stage4Controls';
import type {Stage4ControlProps} from '../../apps/client/src/Stage4Controls';
import OnlineBoard from '../../apps/client/src/OnlineBoard';
import SpectatorBoard from '../../apps/client/src/SpectatorBoard';
import {EquipmentLine} from '../../apps/client/src/Stage3Status';
function fixture(){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.7',seed:42,seats:[0,1,2,3],first:0,characters:['character-048','character-027','character-026','character-031']},1000);s.phase='action';s.choice=null;s.queue=[];for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=20;}return s;
}
function give(s:GameState,card:string,a=0){s.deck=s.deck.filter(c=>c!==card);s.players[a].hand.push(card);}
function gear(s:GameState,card:string,a=0){s.deck=s.deck.filter(c=>c!==card);s.stage3!.equipment[a].push(card);s.stage3!.equipmentSources[card]={origin:'equipment',actor:a,faction:s.players[a].faction,roleModifiers:[]};}
function view(s:GameState,seat=0):OnlineGame{return {...publicView(s,seat),actions:{targets:Object.fromEntries(s.players[seat].hand.map(c=>[c,legalTargets(s,seat,c)])),steps:legalSteps(s),stage3:stage3Actions(s,seat),stage4:stage4Actions(s,seat)}};}
const room=(game:OnlineGame,seat=0):Snapshot=>({protocol:1,roomId:'00000000-0000-4000-8000-000000000001',code:'1234',status:'playing',mode:'ffa',host:'m0',members:Array.from({length:4},(_,seat)=>({seat,id:'m'+seat,name:'玩家'+seat,ready:false,online:true})),roomRevision:1,matchId:'00000000-0000-4000-8000-000000000002',seat,memberId:'m'+seat,epoch:1,serverTime:1000,game});
function controls(game:OnlineGame,extra:Partial<Stage4ControlProps>={}){const no=()=>{};return renderToStaticMarkup(createElement(Stage4Controls,{game,seat:0,busy:false,now:1000,selected:null,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no,mode:null,setMode:no,...extra}));}
it('validates all new intent fields strictly and rejects server state, actor, RNG and unknown fields',()=>{
 const s=room(view(fixture())),base={op:'game',requestId:'p',matchId:s.matchId,revision:0};
 for(const intent of [{type:'play',card:'basic-025#01',targets:[],x:3},{type:'play',card:'basic-024#01',targets:[1],take:'equipment',item:'basic-059#01',replacement:'basic-058#01'},{type:'play',card:'basic-073#01',targets:[],copy:'basic-070#01'},{type:'play',card:'basic-032#01',targets:[],region:'教学楼'},{type:'choose',choice:1,option:'1:down'},{type:'choose',choice:1,guess:6},{type:'choose',choice:1,action:'ap'},{type:'skill',kind:'quote-cost',card:'basic-032#01'},{type:'skill',kind:'gift',target:1,cards:['basic-039#01']},{type:'skill',kind:'flight',cell:'r4c8'},{type:'skill',kind:'terrain',accept:true}]){
  expect(commandSchema.safeParse({...base,intent}).success).toBe(true);for(const extra of [{actor:3},{seed:0},{ap:999},{cost:0},{stage4:{}}])expect(commandSchema.safeParse({...base,intent:{...intent,...extra}}).success).toBe(false);
 }
 for(const intent of [{type:'play',card:'basic-025#01',targets:[],x:0},{type:'choose',choice:1,guess:7},{type:'skill',kind:'gift',cards:['x',2]},{type:'skill',kind:'terrain',accept:1}])expect(commandSchema.safeParse({...base,intent}).success).toBe(false);
});
it('guards variable AP, region, random quote, exact equipment selection and Bob source requirements',()=>{
 const s=fixture();for(const card of ['basic-025#01','basic-023#01','basic-024#01','basic-073#01'])give(s,card);gear(s,'basic-070#01',1);const g=view(s);
 expect(playBlockReason(g,0,'basic-025#01',[],false,1000,{x:0})).toContain('X必须');expect(playBlockReason(g,0,'basic-025#01',[],false,1000,{x:3})).toBeNull();
 expect(playBlockReason(g,0,'basic-023#01',[],false,1000)).toContain('地区');expect(playBlockReason(g,0,'basic-023#01',[],false,1000,{region:'教学楼'})).toBeNull();
 expect(playBlockReason(g,0,'basic-024#01',[1],false,1000,{take:'equipment'})).toContain('公开装备');expect(playBlockReason(g,0,'basic-024#01',[1],false,1000,{take:'equipment',item:'basic-070#01'})).toBeNull();expect(playBlockReason(g,0,'basic-073#01',[],false,1000,{copy:'basic-070#01'})).toContain('随机费用');
 expect(controls(g,{selected:'basic-025#01'})).toContain('收集石头X');expect(controls(g,{selected:'basic-023#01'})).toContain('作用地区');expect(controls(g,{selected:'basic-024#01',targets:[1]})).toContain('随机拿最多2张手牌');expect(controls(g,{selected:'basic-073#01'})).toContain('Bob复制坐骑');
});
it('outturn interrupt and Tang settings pass the identity/revision/deadline fence without enabling ordinary outturn play',()=>{
 const s=fixture();give(s,'basic-017#01',1);give(s,'basic-039#01',1);gear(s,'basic-069#01',1);const r=room(view(s,1),1);
 for(const intent of [{type:'play',card:'basic-017#01',targets:[]},{type:'skill',kind:'terrain',accept:true}] as Intent[])expect(prepareGameCommand(r,r,intent,'p',1000).command).toBeDefined();
 expect(prepareGameCommand(r,r,{type:'play',card:'basic-039#01',targets:[]},'p',1000).command).toBeUndefined();const stale=structuredClone(r);stale.game!.revision++;expect(prepareGameCommand(r,stale,{type:'play',card:'basic-017#01',targets:[]},'p',1000).command).toBeUndefined();
 expect(controls(r.game!,{seat:1})).toContain('插队');expect(controls(r.game!,{seat:1})).toContain('忽略地点效果');expect(prepareGameCommand(r,r,{type:'play',card:'basic-017#01',targets:[]},'p',61000).command).toBeUndefined();
});
it('counter quoting stays inside the original actor/window while expiry disables its controls',()=>{
 const s=fixture();give(s,'basic-027#01');s.choice={id:7,kind:'card-counter',actor:0,deadline:11000,paused:true,cards:['basic-027#01']};s.phase='choice';const r=room(view(s));
 expect(prepareGameCommand(r,r,{type:'skill',kind:'quote-cost',card:'basic-027#01'},'p',1000).command).toBeDefined();expect(controls(r.game!,{selected:'basic-027#01'})).toContain('锁定反制牌费用');expect(controls(r.game!,{selected:'basic-027#01',now:11000})).toMatch(/disabled=""[^>]*>锁定反制牌费用/);
});
it('choices show deterministic paths, guess points, AP tax and mandatory return rather than a generic accept button',()=>{
 const s=fixture();const c={id:1,actor:0,deadline:11000,paused:true};s.phase='choice';
 s.choice={...c,kind:'board-path',options:{'0':['r2c2','r2c3']}};expect(controls(view(s))).toContain('选择移动路径');
 s.choice={...c,kind:'board-guess'};const guess=controls(view(s));for(const n of [1,2,3,4,5,6])expect(guess).toContain('>'+n+'</button>');
 s.choice={...c,kind:'board-tax',data:{mode:'desert'},cards:[]};expect(controls(view(s))).toContain('支付1 AP');
 s.choice={...c,kind:'board-return',cells:['r1c1']};expect(controls(view(s))).toContain('选择首个合法格');expect(controls(view(s))).not.toContain('放弃本次位移');
});
it('copied abilities, durability and offmap state remain visible to players and spectators without a phantom map token',()=>{
 const s=fixture();gear(s,'basic-073#01');s.stage4!.copies['basic-073#01']='basic-070';s.stage4!.durability['basic-073#01']=1;s.stage4!.offMap[0]=true;const g=view(s),line=renderToStaticMarkup(createElement(EquipmentLine,{game:g,seat:0,onReference:()=>{}}));expect(line).toContain('无一骑');expect(line).toContain('1耐久');expect(line).toContain('离场');
 const r=room(g),html=renderToStaticMarkup(createElement(OnlineBoard,{snapshot:r,send:()=>{},busy:false,onRematch:()=>{},animations:false,onToggleAnimations:()=>{}}));expect(html).toContain('已移出地图');expect(html).not.toMatch(/class="piece seat-0"/);
 const spectator=renderToStaticMarkup(createElement(SpectatorBoard,{snapshot:{...r,role:'spectator',seat:null},animations:false,onToggleAnimations:()=>{}}));expect(spectator).toContain('1耐久');expect(spectator).not.toMatch(/class="piece seat-0"/);
});
it('all191 instances can render without exposing undefined prompts and new status effects have clear controls',()=>{
 const s=fixture();s.players[0].hand=[...s.deck];s.deck=[];const html=renderToStaticMarkup(createElement(OnlineBoard,{snapshot:room(view(s)),send:()=>{},busy:false,onRematch:()=>{},animations:false,onToggleAnimations:()=>{}}));expect(html).toContain('191 张');expect(html).toContain('X AP');expect(html).toContain('左右滑动查看手牌');expect(html).not.toContain('undefined');
 for(const kind of ['gear-cloak','gear-reflect','gear-chalk','gear-terrain'] as const){s.choice={id:1,actor:0,deadline:11000,paused:true,kind,source:1,data:{card:'basic-051#01'}};s.phase='choice';expect(controls(view(s))).toContain(kind==='gear-terrain'?'忽略本次地形':'放弃');}
});
