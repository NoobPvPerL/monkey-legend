import {cRoleStatus} from '../../apps/client/src/c-role-status';
import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {gFixture,gRun} from './p3-g-fixture';
import {give} from './p3-fixture';
import Stage3Controls from '../../apps/client/src/Stage3Controls';
import {publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import {commandSchema} from '../../packages/online/src/protocol';
import type {OnlineGame} from '../../packages/online/src/protocol';
import type {GameState} from '../../packages/game-core/src/types';
function controls(s:GameState,targets:number[]=[],discard:string[]=[],busy=false){const seat=s.choice?.actor??s.active,game:OnlineGame={...publicView(s,seat),actions:{targets:{},steps:[],stage3:stage3Actions(s,seat),stage4:stage4Actions(s,seat)}},no=()=>{};return renderToStaticMarkup(createElement(Stage3Controls,{game,seat,busy,now:s.time,selected:null,targets,asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard,send:no,locationMode:null,setLocationMode:no}));}
it('white eye and the paid counter have visible controls during their own server windows',()=>{
 let s=gFixture(['character-048','character-009','character-025','character-031']);s.round=2;give(s,0,'basic-039#01');give(s,2,'basic-040#01');s=gRun(s,{type:'end'});const html=controls(s,[0,2]);expect(html).toContain('从所选 2 人各拿1张');expect(html).toContain('不拿牌');expect(html).toContain('30秒超时按行动顺序');
 s=gFixture(['character-048','character-009','character-025','character-031']);give(s,0,'basic-039#01');s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(controls(s)).toContain('好奇怪哦 · 1AP');expect(controls(s)).toContain('放弃反制');expect(controls(s,[],[],true)).toContain('disabled=""');
});
it('programming, final1–6 and store discard controls are visible and never send a result field',()=>{
 let s=gFixture(['character-042','character-033','character-025','character-031']);s.random.dice=[3];s=gRun(s,{type:'move'});expect(controls(s)).toContain('编程 · 免费重掷');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});const math=controls(s);for(let n=1;n<=6;n++)expect(math).toContain(`最终 ${n}`);expect(math).toContain('保留当前点数');
 s=gFixture(['character-048','character-049','character-025','character-031']);give(s,0,'basic-039#01');give(s,1,'basic-001#01');s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(controls(s,[],['basic-001#01'])).toContain('店长 · 确认弃置');
});
it('G intents accept selected targets or final option only and reject authoritative fields',()=>{
 const packet={op:'game',requestId:'g-card-ui',matchId:'00000000-0000-4000-8000-000000000001',revision:0,intent:{type:'choose',choice:1,targets:[1,2]}};expect(commandSchema.safeParse(packet).success).toBe(true);expect(commandSchema.safeParse({...packet,intent:{...packet.intent,targets:[1,2,3]}}).success).toBe(false);for(const field of ['actor','roll','cost','state','raw','final','driver','seed','random'])expect(commandSchema.safeParse({...packet,intent:{...packet.intent,[field]:1}}).success).toBe(false);expect(commandSchema.safeParse({...packet,intent:{type:'choose',choice:1,option:'6'}}).success).toBe(true);
});
it('dog has target and direction controls even before a card is selected',()=>{
 const s=gFixture(['character-022','character-048','character-025','character-031']),html=controls(s);expect(html).toContain('狗头军师目标');expect(html).toContain('狗头军师方向');expect(html).toContain('狗头军师 · 1 AP');expect(html).toContain('下 ↓');
 const packet={op:'game',requestId:'g-dog-ui',matchId:'00000000-0000-4000-8000-000000000001',revision:0,intent:{type:'skill',kind:'dog',target:1,direction:'right'}};expect(commandSchema.safeParse(packet).success).toBe(true);expect(commandSchema.safeParse({...packet,intent:{...packet.intent,direction:'diagonal'}}).success).toBe(false);
});
it('food theft has direct pay/keep controls and only emits an ordinary choice intent',()=>{
 let s=gFixture();s.active=1;give(s,1,'basic-039#01');s=gRun(s,{type:'play',card:'basic-039#01',targets:[]});expect(s.choice?.kind).toBe('g-food');const html=controls(s);expect(html).toContain('过境 · 2AP');expect(html).toContain('保留原受益者');expect(controls(s,[],[],true)).toContain('disabled=""');
 const packet={op:'game',requestId:'g-food-ui',matchId:'00000000-0000-4000-8000-000000000001',revision:s.revision,intent:{type:'choose',choice:s.choice!.id,accept:true}};expect(commandSchema.safeParse(packet).success).toBe(true);for(const key of ['recipient','thief','effect','cost','gPrimeQuoted'])expect(commandSchema.safeParse({...packet,intent:{...packet.intent,[key]:0}}).success).toBe(false);
});
it('Cube teleport remains a direct map-target intent and face2 clearly disables movement',()=>{
 let s=gFixture(['character-028','character-048','character-025','character-031']);s.stage3!.g!.face[0]=6;expect(controls(s)).toContain('魔方传送 · 0 AP');s.stage3!.g!.face[0]=2;expect(controls(s)).toContain('魔法有方2：本个人回合禁止各类位移');expect(cRoleStatus(publicView(s,0) as OnlineGame,0)).toContain('本个人回合禁止移动、传送和离场');
 const packet={op:'game',requestId:'g-cube-ui',matchId:'00000000-0000-4000-8000-000000000001',revision:0,intent:{type:'move',cell:'r1c8'}};expect(commandSchema.safeParse(packet).success).toBe(true);for(const key of ['face','haki','marks','roll','cost','state'])expect(commandSchema.safeParse({...packet,intent:{...packet.intent,[key]:6}}).success).toBe(false);
});
it('Haki exposes free damage/decline, then disables stop/end until an empty landing is reached',()=>{
 let s=gFixture(['character-049','character-048','character-025','character-031']);s.players[0].cell='r1c2';s.random.dice=[6];s=gRun(s,{type:'move'});s=gRun(s,{type:'step',path:['r1c3']});expect(controls(s)).toContain('哈基米 · 免费造成1伤');expect(controls(s)).toContain('放弃本次伤害');s=gRun(s,{type:'choose',choice:s.choice!.id,accept:false});const html=controls(s);expect(html).toContain('须继续至空格');expect(html.match(/disabled=""/g)).toHaveLength(2);
});
