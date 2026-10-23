import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Stage4Controls from '../../apps/client/src/Stage4Controls';
import {stage4PlayReason} from '../../apps/client/src/stage4-guards';
import {gFixture,gRun,gDrain} from './p3-g-fixture';
import {hFixture} from './p3-h-fixture';
import {give,equip} from './p3-fixture';
import {publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import type {OnlineGame} from '../../packages/online/src/protocol';
import type {GameState} from '../../packages/game-core/src/types';
const view=(s:GameState):OnlineGame=>({...publicView(s,0),actions:{targets:{},steps:[],stage3:stage3Actions(s,0),stage4:stage4Actions(s,0)}});
const no=()=>{};
function controls(game:OnlineGame,selected:string|null=null){return renderToStaticMarkup(createElement(Stage4Controls,{game,seat:0,busy:false,now:1000,selected,targets:[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'',setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[],send:no,locationMode:null,setLocationMode:no,mode:null,setMode:no}));}
function wear(card:string){let s=gFixture();give(s,0,card);s.random.dice=[3];s=gRun(s,{type:'skill',kind:'quote-cost',card});return gDrain(gRun(s,{type:'play',card,targets:[]}));}
it('two ready watches remain visible independently, including when the first record is spent',()=>{
 const s=wear('basic-060#01'),[a,b]=s.stage3!.equipment[0];s.stage4!.watches[a]={current:s.players[0].cell,previous:'r1c1',usedTurn:null};s.stage4!.watches[b]={current:s.players[0].cell,previous:'r1c2',usedTurn:null};expect(controls(view(s))).toContain('手表 1');expect(controls(view(s))).toContain('手表 2');s.stage4!.watches[a].usedTurn=s.stage3!.turn;const game=view(s);expect(game.actions.stage4!.equipmentSkills!.watch).toEqual([{card:b,cell:'r1c2'}]);expect(controls(game)).toContain('回到r1c2');
});
it('each Tang piece has an independent visible setting and no first-item-only control',()=>{
 const s=wear('basic-069#01'),html=controls(view(s));expect(html).toContain('唐车 1');expect(html).toContain('唐车 2');expect(html.match(/忽略地点效果/g)).toHaveLength(2);
});
it('prime replacement controls require both legal old items and protect changed selections',()=>{
 const s=gFixture();equip(s,0,'basic-049#01');equip(s,0,'basic-050#01');give(s,0,'basic-051#01');s.stage4!.costs.locks['basic-051#01']={cost:3,actor:0} as any;const game=view(s);game.actions.stage4!.cards['basic-051#01'].needsQuote=false;game.actions.stage4!.cards['basic-051#01'].cost=4;expect(controls(game,'basic-051#01')).toContain('双装备替换对象');expect(stage4PlayReason(game,0,'basic-051#01',[],{replacements:['basic-049#01']})).toContain('2件替换');expect(stage4PlayReason(game,0,'basic-051#01',[],{replacements:['basic-049#01','basic-050#01']})).toBeNull();expect(stage4PlayReason(game,0,'basic-051#01',[],{replacements:['basic-049#01','basic-049#01']})).toContain('替换');
});
it('prime X guard includes the extra AP and paired theft never suggests a hand fallback',()=>{
 const s=gFixture();give(s,0,'basic-025#01');s.players[0].ap=2;expect(stage4PlayReason(view(s),0,'basic-025#01',[],{x:2})).toContain('AP不足');expect(stage4PlayReason(view(s),0,'basic-025#01',[],{x:1})).toBeNull();expect(controls(view(s),'basic-025#01')).toContain('2 AP');
});
it('private H uses authoritative suppression to switch new equipment between single and paired installation',()=>{
 const s=hFixture(['character-021','character-011','character-025','character-031']);s.players[0].cell='r4c4';s.players[1].cell='r4c5';equip(s,0,'basic-049#01');equip(s,0,'basic-050#01');give(s,0,'basic-051#01');s.stage4!.costs.locks['basic-051#01']={cost:3,actor:0} as any;
 let game=view(s);Object.assign(game.actions.stage4!.cards['basic-051#01'],{needsQuote:false,cost:3});expect(controls(game,'basic-051#01')).not.toContain('双装备替换对象');expect(stage4PlayReason(game,0,'basic-051#01',[],{replacement:'basic-049#01'})).toBeNull();
 s.players[1].cell='r1c1';game=view(s);Object.assign(game.actions.stage4!.cards['basic-051#01'],{needsQuote:false,cost:4});expect(controls(game,'basic-051#01')).toContain('双装备替换对象');expect(stage4PlayReason(game,0,'basic-051#01',[],{replacements:['basic-049#01']})).toContain('2件替换');
});
