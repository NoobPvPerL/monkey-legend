import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGame,publicView,legalTargets,legalSteps} from '../../packages/game-core/src/index';
import type {CharacterId} from '../../packages/game-data/src/index';
import type {GameState} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {createStage3Draft,draftView} from '../../packages/game-core/src/draft';
import type {OnlineGame,Snapshot} from '../../packages/online/src/protocol';
import {commandSchema} from '../../packages/online/src/protocol';
import {prepareGameCommand,prepareDraftCommand,playBlockReason} from '../../apps/client/src/interaction-guards';
import Stage3Controls from '../../apps/client/src/Stage3Controls';
import type {Stage3ControlProps} from '../../apps/client/src/Stage3Controls';
import {ComboProgress,EquipmentLine} from '../../apps/client/src/Stage3Status';
function fixture(character:CharacterId='character-023'){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.6',seed:42,seats:[0,1,2,3],first:0,characters:[character,'character-031','character-026','character-044']},1000);s.phase='action';s.choice=null;s.queue=[];s.active=0;for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c2','r2c3'][p.seat];}s.players[0].ap=10;return s;
}
function give(s:GameState,card:string){s.deck=s.deck.filter(c=>c!==card);s.players[0].hand.push(card);}
function view(s:GameState):OnlineGame{return {...publicView(s,0),actions:{targets:Object.fromEntries(s.players[0].hand.map(c=>[c,legalTargets(s,0,c)])),steps:legalSteps(s),stage3:stage3Actions(s,0)}};}
const room=(game:OnlineGame|null):Snapshot=>({protocol:1,roomId:'00000000-0000-4000-8000-000000000001',code:'1234',status:'playing',mode:'ffa',host:'m0',members:Array.from({length:4},(_,seat)=>({seat,id:'m'+seat,name:'玩家'+seat,ready:false,online:true})),roomRevision:1,matchId:'00000000-0000-4000-8000-000000000002',seat:0,memberId:'m0',epoch:1,serverTime:1000,game});
function controls(game:OnlineGame,extra:Partial<Stage3ControlProps>={}){const no=()=>{};return renderToStaticMarkup(createElement(Stage3Controls,{game,seat:0,busy:false,now:1000,selected:null,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no,...extra}));}
it('new intents have strict actor-free schemas; draft picking is a distinct room operation and cannot inject RNG or teams',()=>{
 const base={op:'game',requestId:'test',matchId:room(null).matchId,revision:0};for(const intent of [{type:'skill',kind:'jj'},{type:'play',card:'basic-037#01',targets:[1],as:'elbow'},{type:'move',direction:'left'},{type:'choose',choice:1,target:1,action:'draw'}]){
  expect(commandSchema.safeParse({...base,intent}).success).toBe(true);expect(commandSchema.safeParse({...base,intent:{...intent,actor:3}}).success).toBe(false);
 }
 const draft={op:'draft-pick',requestId:'pick',matchId:base.matchId,revision:0,offer:1,character:'character-031'};expect(commandSchema.safeParse(draft).success).toBe(true);for(const extra of [{actor:3},{seed:0},{teams:['A','B']},{deadline:99999}])expect(commandSchema.safeParse({...draft,...extra}).success).toBe(false);
});
it('conversion guards use the new identity, allow unquoted materials and still require a legal susceptible target',()=>{
 const s=fixture();give(s,'basic-037#01');const game=view(s);expect(playBlockReason(game,0,'basic-037#01',[1],false,1000,{as:'elbow',direction:'right'})).toBeNull();expect(playBlockReason(game,0,'basic-037#01',[2],false,1000,{as:'elbow'})).toContain('不可选');expect(controls(game,{selected:'basic-037#01',targets:[1],asElbow:true,direction:'right'})).toContain('确认转换肘击');
 expect(playBlockReason(game,0,'basic-037#01',[1],false,1000,{as:'elbow'})).toContain('撞飞方向');expect(controls(game,{selected:'basic-037#01',targets:[1],asElbow:true})).toContain('牢大撞飞方向');expect(game.actions.stage3!.elbowPush[1].right).toBe('r1c4');
});
it('revival UI requests a locked quote first and only pays through the confirmation window',()=>{
 const s=fixture('character-045');give(s,'basic-037#01');let game=view(s);expect(controls(game,{selected:'basic-037#01',targets:[1]})).toContain('掷骰锁定复活费用');
 s.stage3!.costLocks['basic-037#01']={turn:s.stage3!.turn,cost:5};s.choice={id:8,kind:'revival-confirm',actor:0,deadline:11000,paused:true,source:1,data:{card:'basic-037#01',cost:5}};s.phase='choice';game=view(s);const html=controls(game);expect(html).toContain('实付 5 AP');expect(html).toContain('支付并复活 S2');expect(html).toContain('取消 · 不重掷');
});
it('West requires a direction before moving, and carry prompts require both a participant and a highlighted destination',()=>{
 const s=fixture('character-040');const html=controls(view(s));expect(html).toContain('西帝汶声明移动方向');expect(html).toContain('请选择');s.choice={id:1,kind:'west-carry',actor:0,deadline:11000,paused:true,targets:[1],options:{'1':['r1c1']},data:[{actor:1,origin:'r1c2'}]};s.phase='choice';const game=view(s);expect(game.choice!.options).toEqual({'1':['r1c1']});expect(controls(game)).toContain('先选同行玩家');expect(controls(game,{targets:[1]})).toContain('在棋盘选择同行落点');
});
it('equipment replacement is explicit, JJ is usable at zero AP, and an expired window disables confirmation',()=>{
 const s=fixture('character-003');s.players[0].ap=0;expect(controls(view(s))).toContain('懒得喷 · 0 AP');s.choice={id:2,kind:'easy',actor:0,deadline:1000,paused:true};s.phase='choice';expect(controls(view(s))).toMatch(/disabled=""[^>]*>付1 AP · 反制/);
});
it('stale rendered snapshots cannot silently change a conversion target or a draft offer',()=>{
 const s=fixture();give(s,'basic-037#01');const rendered=room(view(s));const current=structuredClone(rendered);current.game!.revision++;expect(prepareGameCommand(rendered,current,{type:'play',card:'basic-037#01',targets:[1],as:'elbow'},'p',1000).command).toBeUndefined();
 const draft=createStage3Draft('ffa',{seed:42,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false},1000),owner=draft.offer!.actor;const r={...room(null),status:'drafting' as const,seat:owner,memberId:'m'+owner,draft:draftView(draft,owner)};const intent={type:'draft-pick' as const,offer:draft.offer!.id,character:draft.offer!.candidates[0]};expect(prepareDraftCommand(r,r,intent,'p',1000).command?.op).toBe('draft-pick');expect(prepareDraftCommand(r,r,intent,'p',31000).command).toBeUndefined();
});
it('public status renders explicit equipment and recorded combo progress, including death pause',()=>{
 const s=fixture('character-045');s.stage3!.equipment[0]=['basic-054#01'];s.stage3!.combos.S1=['basic-046'];let game=view(s);expect(renderToStaticMarkup(createElement(EquipmentLine,{game,seat:0,onReference:()=>{}}))).toContain('爆浆冰淇淋面包');expect(renderToStaticMarkup(createElement(ComboProgress,{game}))).toContain('✓ 外星人');s.players[0].hp=0;game=view(s);expect(renderToStaticMarkup(createElement(ComboProgress,{game}))).toContain('淘汰暂停');
});
