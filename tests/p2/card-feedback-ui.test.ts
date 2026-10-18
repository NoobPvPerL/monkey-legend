import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {createGame,publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import Stage4Controls from '../../apps/client/src/Stage4Controls';
import type {Stage4ControlProps} from '../../apps/client/src/Stage4Controls';
import Stage3Rules from '../../apps/client/src/Stage3Rules';
import {playBlockReason} from '../../apps/client/src/interaction-guards';
import type {OnlineGame} from '../../packages/online/src/protocol';
function fixture(){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.10',seed:42,seats:[0,1,2,3],first:0,characters:['character-048','character-031','character-003','character-040']},1000);
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.cell=['r1c2','r1c3','r2c4','r2c5'][p.seat];p.ap=20;}s.choice=null;s.queue=[];s.phase='action';return s;
}
function give(s:ReturnType<typeof fixture>,card:string){s.deck=s.deck.filter(c=>c!==card);s.players[0].hand.push(card);}
function view(s:ReturnType<typeof fixture>):OnlineGame{return {...publicView(s,0),actions:{targets:{},steps:[],stage3:stage3Actions(s,0),stage4:stage4Actions(s,0)}};}
function render(game:OnlineGame,extra:Partial<Stage4ControlProps>={}){const no=()=>{};return renderToStaticMarkup(createElement(Stage4Controls,{game,seat:0,busy:false,now:1000,selected:null,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no,mode:null,setMode:no,...extra}));}
it('exposes a named dead revival target directly and requires choosing it before quoting',()=>{
 const s=fixture();give(s,'basic-037#01');Object.assign(s.players[1],{hp:0,ap:0,shield:0,eliminated:1});s.stage3!.deathTurns[1]=s.stage3!.turn;const g=view(s),html=render(g,{selected:'basic-037#01'});
 expect(html).toContain('aria-label="紫檀木复活目标"');expect(html).toContain('S2 · 跑者 · 已阵亡');expect(html).toMatch(/disabled=""[^>]*>锁定本张费用/);
 expect(render(g,{selected:'basic-037#01',targets:[1]})).not.toMatch(/disabled=""[^>]*>锁定本张费用/);
 s.stage3!.costLocks['basic-037#01']={turn:s.stage3!.turn,cost:3};expect(playBlockReason(view(s),0,'basic-037#01',[1],false,1000)).toBeNull();
});
it('explains no eligible revival without offering living players or inventing a new revival period',()=>{
 const s=fixture();give(s,'basic-037#01');const html=render(view(s),{selected:'basic-037#01'});expect(html).toContain('无合法复活目标');expect(html).not.toContain('· 已阵亡');expect(html).toMatch(/disabled=""[^>]*>锁定本张费用/);
});
it('labels both Weiwen actors and retains six guess buttons, legal map selection and explicit skip',()=>{
 const s=fixture();give(s,'basic-021#01');expect(render(view(s),{selected:'basic-021#01'})).toContain('aria-label="卫汶找你目标"');
 s.phase='choice';s.choice={id:1,kind:'board-guess',actor:0,deadline:11000,paused:true,source:1};const guess=render(view(s));for(const n of [1,2,3,4,5,6])expect(guess).toContain('>'+n+'</button>');expect(guess).toContain('猜错由出牌者选择传送落点');
 s.choice={...s.choice,kind:'board-cell',source:1,cells:['r4c8']};const cell=render(view(s));expect(cell).toContain('为S2选择落点');expect(cell).toContain('放弃本次位移');expect(render(view(s),{now:11000})).toMatch(/disabled=""[^>]*>放弃本次位移/);
});
it('new rules explain attack-only JJ and distinct bans, while historical descriptions stay version gated',()=>{
 const newer=renderToStaticMarkup(Stage3Rules({stage4:true,playtest:true,exercise:true,cardFeedback:true}));expect(newer).toContain('教学楼只禁止躲避球，秀松苑只禁止猴子游戏');expect(newer).toContain('暴露仅增加攻击牌目标');
 expect(renderToStaticMarkup(Stage3Rules({stage4:true,playtest:true,exercise:true}))).not.toContain('暴露仅增加攻击牌目标');
});
