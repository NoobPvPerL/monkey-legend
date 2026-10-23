import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {fixture,give} from './p3-fixture';
import {dispatch,publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import Stage3Controls from '../../apps/client/src/Stage3Controls';
import Stage3Rules from '../../apps/client/src/Stage3Rules';
import {EquipmentLine} from '../../apps/client/src/Stage3Status';
import {commandSchema} from '../../packages/online/src/protocol';
import {cRoleStatus} from '../../apps/client/src/c-role-status';
import type {OnlineGame} from '../../packages/online/src/protocol';
function render(s:ReturnType<typeof fixture>){const game:OnlineGame={...publicView(s,0),actions:{targets:{},steps:[],stage3:stage3Actions(s,0),stage4:stage4Actions(s,0)}};const no=()=>{};return {game,html:renderToStaticMarkup(createElement(Stage3Controls,{game,seat:0,busy:false,now:s.time,selected:null,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no}))};}
it('feather has a direct free button and public active/failure status, without a selected card',()=>{
 const s=fixture('web-v0.1.14',['character-046','character-047','character-025','character-026']);expect(render(s).html).toMatch(/character-skill-button[^>]*>手长 · 0 AP/);s.stage3!.c!.feather[0]=true;s.stage3!.c!.blocked[0]=true;const {game,html}=render(s);expect(cRoleStatus(game,0)).toContain('脚短');expect(html).toContain('本回合已发动');expect(html).toContain('脚短：本回合不能再发动基础移动');const status=renderToStaticMarkup(createElement(EquipmentLine,{game,seat:0,onReference:()=>{}}));expect(status).toContain('手长全图');expect(status).toContain('脚短：本回合禁基础移动');
});
it('primitive food has explicit accept/cancel controls and C help does not relabel legacy panels',()=>{
 let s=fixture('web-v0.1.14',['character-047','character-048','character-025','character-046']);give(s,0,'basic-039#01');s=dispatch(s,{id:'c-ui',actor:0,revision:s.revision,type:'play',card:'basic-039#01',targets:[]},1001).state;const {html}=render(s);expect(html).toContain('你要不要吃 · 免费判定');expect(html).toContain('放弃判定');const help=renderToStaticMarkup(Stage3Rules({stage4:true,p3Characters:true,batchC:true}));expect(help).toContain('本版20角色');expect(help).not.toContain('本版18角色');expect(renderToStaticMarkup(Stage3Rules({stage4:true,p3Characters:true}))).toContain('本版18角色');
});
it('C protocol carries intention only and rejects trusted outcome fields',()=>{
 const packet={op:'game',requestId:'c-ui',matchId:'00000000-0000-4000-8000-000000000001',revision:0,intent:{type:'skill',kind:'feather'}};expect(commandSchema.safeParse(packet).success).toBe(true);for(const field of ['actor','state','roll','cost','feather','sleep','seed'])expect(commandSchema.safeParse({...packet,intent:{...packet.intent,[field]:1}}).success).toBe(false);
});
