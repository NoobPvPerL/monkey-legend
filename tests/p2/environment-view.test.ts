import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {lastBombing,poisonLimit,classicEnvironmentText} from '../../apps/client/src/environment-view';
import OnlineBoard from '../../apps/client/src/OnlineBoard';
import SpectatorBoard from '../../apps/client/src/SpectatorBoard';
import {createGame,publicView} from '../../packages/game-core/src/index';
import {eliminationCauses} from '../../apps/client/src/SettlementStats';
const fixture={version:'web-v0.1.5',round:2,classic:{poison:[],bombs:['帝汶岛','高唐农场'],bombRound:1},events:[]};
it('keeps explicitly labeled previous bombing markers rather than presenting them as a forecast',()=>{
 expect(lastBombing(fixture)).toEqual({regions:['帝汶岛','高唐农场'],round:1,label:'最近第1轮轰炸：帝汶岛、高唐农场；本轮轮末重新抽取'});
 expect(lastBombing({...fixture,classic:{...fixture.classic,bombs:[],bombRound:0}}).regions).toEqual([]);
});
it('recovers already-cleared historical v0.1.4 markers from public environment history on reconnect',()=>{
 const result=lastBombing({version:'web-v0.1.4',round:3,classic:{poison:[],bombs:[]},events:[{type:'environment',text:'第1轮末，轰炸：帝汶岛、操场'},{type:'environment',text:'第2轮末，轰炸：高唐农场、红素洋'}]});
 expect(result.round).toBe(2);expect(result.regions).toEqual(['高唐农场','红素洋']);
});
it('both player and spectator boards render restored markers and new poison denominator from the same snapshot',()=>{
 for(const version of ['web-v0.1.4','web-v0.1.5'] as const){
  const state=createGame({mode:'ffa',seed:42,ruleVersion:version,seats:[0,1,2,3],first:0},1000);state.round=2;state.classic!.bombs=[];
  state.events.push({seq:999,type:'environment',text:'第1轮末，轰炸：帝汶岛、高唐农场'});
  const game={...publicView(state,0),actions:{steps:[],targets:{}}};
  const snapshot:any={protocol:1,roomId:'room',code:'1234',status:'playing',mode:'ffa',host:'m0',members:state.players.map(p=>({id:'m'+p.seat,seat:p.seat,name:'玩家'+p.seat,ready:false,online:true})),roomRevision:1,matchId:'match',seat:0,memberId:'m0',epoch:1,serverTime:1000,game};
  const player=renderToStaticMarkup(createElement(OnlineBoard,{snapshot,send:()=>{},busy:false,onRematch:()=>{},animations:false,onToggleAnimations:()=>{}}));
  const observer=renderToStaticMarkup(createElement(SpectatorBoard,{snapshot:{...snapshot,role:'spectator',seat:null},animations:false,onToggleAnimations:()=>{}}));
  for(const html of [player,observer]){expect(html).toContain('最近第1轮轰炸');expect((html.match(/hazard-badge bomb-badge/g)??[])).toHaveLength(5);expect(html).toContain('/'+poisonLimit(version));}
 }
});
it('rules explain eleven protected-region poison choices and cave penalties; wildman deaths have no player attribution',()=>{
 expect(classicEnvironmentText('web-v0.1.5')).toContain('11区');expect(classicEnvironmentText('web-v0.1.4')).toContain('室内毒区');
 expect([...eliminationCauses([{seq:1,type:'cave',text:'S1 山洞连续停留3个个人回合，野人扣2AP并造成1伤害'},{seq:2,type:'damage',text:'S1 跑者 环境伤害1，护盾抵挡0，实际失血1'},{seq:3,type:'eliminate',text:'S1 跑者 淘汰（批次3）'}])]).toEqual([[0,'野人袭击']]);
});
