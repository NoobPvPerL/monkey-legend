import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {gFixture,gRun} from './p3-g-fixture';
import {refreshClassicRound} from '../../packages/game-core/src/classic';
import {publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import {ObserverForecast} from '../../apps/client/src/ObserverForecast';
import Stage3Controls from '../../apps/client/src/Stage3Controls';
import {EquipmentLine} from '../../apps/client/src/Stage3Status';
import type {OnlineGame} from '../../packages/online/src/protocol';
const setup=()=>gFixture(['character-012','character-048','character-025','character-031']);
it('forecast text renders only from authorized server projections and names the current round',()=>{
 const s=setup();refreshClassicRound(s);for(const viewer of [-1,0,1,2,3]){const game={...publicView(s,viewer),actions:{targets:{},steps:[]}} as OnlineGame,html=renderToStaticMarkup(createElement(ObserverForecast,{game}));if(viewer<=0){expect(html).toContain('观察 · 第1轮末轰炸');for(const r of s.stage3!.g!.forecast!.regions)expect(html).toContain(r);}else expect(html).toBe('');}s.round++;expect(renderToStaticMarkup(createElement(ObserverForecast,{game:{...publicView(s,0),actions:{targets:{},steps:[]}}}))).toBe('');
});
it('invisibility has visible free/decline controls, respects busy disable, and shows its expiration status',()=>{
 let s=gRun(setup(),{type:'end'});const no=()=>{},game:OnlineGame={...publicView(s,0),actions:{targets:{},steps:[],stage3:stage3Actions(s,0),stage4:stage4Actions(s,0)}};
 for(const busy of [false,true]){const html=renderToStaticMarkup(createElement(Stage3Controls,{game,seat:0,busy,now:s.time,selected:null,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no}));expect(html).toContain('隐身 · 免费判定');expect(html).toContain('放弃隐身');expect(html.includes('disabled=""')).toBe(busy);}
 s.stage3!.g!.invisible[0]=true;expect(renderToStaticMarkup(createElement(EquipmentLine,{game:{...game,...publicView(s,0)},seat:0,onReference:no}))).toContain('隐身：至自己下次开始');
});
