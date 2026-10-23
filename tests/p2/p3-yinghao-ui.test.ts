import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {fixture,give} from './p3-fixture';
import {publicView,legalTargets} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import Stage4Controls from '../../apps/client/src/Stage4Controls';
import Stage3Rules from '../../apps/client/src/Stage3Rules';
import type {OnlineGame} from '../../packages/online/src/protocol';
import {commandSchema} from '../../packages/online/src/protocol';
it('Mayi is directly visible with authoritative3 AP availability and no card selection',()=>{
 const s=fixture('web-v0.1.12',['character-025','character-048','character-027','character-026']);const no=()=>{};
 const render=()=>{const game:OnlineGame={...publicView(s,0),actions:{targets:{},steps:[],stage3:stage3Actions(s,0),stage4:stage4Actions(s,0)}};return renderToStaticMarkup(createElement(Stage4Controls,{game,seat:0,busy:false,now:1000,selected:null,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no,mode:null,setMode:no}));};
 expect(render()).toMatch(/class="character-skill-button"[^>]*>樱岛麻衣 · 3 AP/);s.players[0].ap=2;expect(render()).toMatch(/disabled=""[^>]*>樱岛麻衣 · 3 AP/);
});
it('versioned help explains new immunity/skills without rewriting old rule panels',()=>{
 const html=renderToStaticMarkup(Stage3Rules({stage4:true,playtest:true,exercise:true,cardFeedback:true,yinghao:true,p3Characters:true}));expect(html).toContain('本版18角色');expect(html).toContain('应豪不参与猴子游戏判定');expect(html).toContain('不刷新行动计时');expect(renderToStaticMarkup(Stage3Rules({stage4:true,cardFeedback:true}))).not.toContain('本版18角色');
});
it('monkey target view excludes only immune Yinghao and the protocol accepts intent only',()=>{
 const s=fixture('web-v0.1.12',['character-048','character-045','character-027','character-026']);give(s,0,'basic-010#01');expect(legalTargets(s,0,'basic-010#01')).not.toContain(1);expect(stage3Actions(s,0).cards['basic-010#01'].targets).toContain(2);
 const base={op:'game',requestId:'mayi',matchId:'00000000-0000-4000-8000-000000000001',revision:0,intent:{type:'skill',kind:'mayi'}};expect(commandSchema.safeParse(base).success).toBe(true);for(const field of ['actor','state','cost','heal','seed'])expect(commandSchema.safeParse({...base,intent:{...base.intent,[field]:1}}).success).toBe(false);
});
