import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterAll,expect,it} from 'vitest';
import {fixture,give,run} from './p3-fixture';
import {database} from './database';
import {dispatch,publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import Stage3Controls from '../../apps/client/src/Stage3Controls';
import Stage3Rules from '../../apps/client/src/Stage3Rules';
import {commandSchema} from '../../packages/online/src/protocol';
import type {OnlineGame} from '../../packages/online/src/protocol';
const db=await database(undefined,28);afterAll(()=>db.close());
const setup=()=>fixture('web-v0.1.17',['character-052','character-051','character-019','character-007']);
function controls(s:ReturnType<typeof fixture>,seat=s.choice?.actor??s.active){const game:OnlineGame={...publicView(s,seat),actions:{targets:{},steps:[],stage3:stage3Actions(s,seat),stage4:stage4Actions(s,seat)}};const no=()=>{};return renderToStaticMarkup(createElement(Stage3Controls,{game,seat,busy:false,now:s.time,selected:null,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no}));}
it('magma and execute have direct controls, tenacity has amount selection with0 timeout, and help is versioned',()=>{
 let s=setup();expect(controls(s)).toContain('岩浆之力');s.active=3;expect(controls(s)).toContain('斩杀目标');expect(controls(s)).toContain('弃选中手牌');expect(controls(s)).toContain('需要有效唐车');s.active=0;s.players[1].cell='r3c4';s=dispatch(s,{id:'f-ui-damage',revision:s.revision,actor:0,type:'skill',kind:'magma'},1001).state;expect(controls(s)).toContain('坚韧抵挡点数');expect(controls(s)).toContain('30秒超时不抵挡');
 const html=renderToStaticMarkup(Stage3Rules({batchF:true,batchE:true,batchD:true,batchC:true,p3Characters:true}));expect(html).toContain('本版35角色');expect(html).not.toContain('本版27角色');expect(html).toContain('零上限不能普通复活');expect(renderToStaticMarkup(Stage3Rules({batchE:true}))).toContain('本版27角色');
});
it('public state and action menus match SQL for all viewers, hide internal ledgers and expose infinity only for monkey5',async()=>{
 const s=setup();for(const a of [0,1,2,3]){const v=(await db.query<{v:any}>('select ml_private.public_view($1::jsonb,$2) v',[JSON.stringify(s),a])).rows[0].v;const expected=publicView(s,a);expect(v.stage3).toEqual(expected.stage3);expect(v.players).toEqual(expected.players);expect(v.actions.stage3).toEqual(stage3Actions(s,a));expect(v.stage3.f).not.toHaveProperty('results');expect(v.stage3.f).not.toHaveProperty('dry');expect(v.players[2].uncappedHp).toBe(true);expect(v.players[0]).not.toHaveProperty('uncappedHp');}
});
it('strict F intents accept only choices and never accept authoritative HP, dice, roots or damage frames',()=>{
 const packet={op:'game',requestId:'f-ui',matchId:'00000000-0000-4000-8000-000000000001',revision:0,intent:{type:'skill',kind:'execute',card:'basic-001#01',target:1}};expect(commandSchema.safeParse(packet).success).toBe(true);for(const field of ['hp','maxHp','uncappedHp','actor','firstDeath','dry','frame','root','state','damage','cost','roll'])expect(commandSchema.safeParse({...packet,intent:{...packet.intent,[field]:1}}).success).toBe(false);
});
