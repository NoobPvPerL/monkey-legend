import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {fixture} from './p3-fixture';
import {dispatch,publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import Stage3Controls from '../../apps/client/src/Stage3Controls';
import Stage3Rules from '../../apps/client/src/Stage3Rules';
import {commandSchema} from '../../packages/online/src/protocol';
import type {OnlineGame} from '../../packages/online/src/protocol';
function controls(s:ReturnType<typeof fixture>,seat=s.choice?.actor??s.active){const game:OnlineGame={...publicView(s,seat),actions:{targets:{},steps:[],stage3:stage3Actions(s,seat),stage4:stage4Actions(s,seat)}};const no=()=>{};return renderToStaticMarkup(createElement(Stage3Controls,{game,seat,busy:false,now:s.time,selected:null,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no}));}
it('gas and escape have visible direct controls without a selected card and escape requires selecting a region',()=>{
 let s=fixture('web-v0.1.16',['character-014','character-016','character-024','character-038']);expect(controls(s)).toContain('释放毒气 · 1 AP');s.active=3;s.cursor=3;const html=controls(s);expect(html).toContain('逃生演习目标地区');expect(html).toContain('逃生演习 · 2 AP');expect(html).toContain('请选择地区');expect(html).toMatch(/disabled="">逃生演习/);
});
it('movement consent, optional egg and mandatory force direction have distinct controls and explicit timeouts',()=>{
 let s=fixture('web-v0.1.16',['character-014','character-016','character-024','character-038']);s=dispatch(s,{id:'e-ui-gas',revision:s.revision,actor:0,type:'skill',kind:'gas'},1001).state;expect(controls(s)).toContain('同意本次位移');expect(controls(s)).toContain('拒绝位移');expect(controls(s)).toContain('30秒超时拒绝');s=dispatch(s,{id:'e-ui-deny',revision:s.revision,actor:1,type:'choose',choice:s.choice!.id,accept:false},1002).state;expect(controls(s)).toContain('使用首个合法方向');s=dispatch(s,{id:'e-ui-force',revision:s.revision,actor:0,type:'choose',choice:s.choice!.id,cell:s.choice!.cells![0]},1003).state;expect(controls(s)).toContain('放弃反应移动');expect(controls(s)).toContain('体育部部长');
});
it('27-role help preserves historical23-role help; E intents accept region only and reject trusted results',()=>{
 const help=renderToStaticMarkup(Stage3Rules({batchE:true,batchD:true,batchC:true,p3Characters:true}));expect(help).toContain('本版27角色');expect(help).not.toContain('本版23角色');expect(help).toContain('操场仍为2格');expect(renderToStaticMarkup(Stage3Rules({batchD:true}))).toContain('本版23角色');
 const packet={op:'game',requestId:'e-ui',matchId:'00000000-0000-4000-8000-000000000001',revision:0,intent:{type:'skill',kind:'escape',region:'操场'}};expect(commandSchema.safeParse(packet).success).toBe(true);for(const field of ['actor','root','permissions','state','damage','cost','roll'])expect(commandSchema.safeParse({...packet,intent:{...packet.intent,[field]:1}}).success).toBe(false);
});
