import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {fixture,give} from './p3-fixture';
import {publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import Stage3Controls from '../../apps/client/src/Stage3Controls';
import Stage4Controls from '../../apps/client/src/Stage4Controls';
import Stage3Rules from '../../apps/client/src/Stage3Rules';
import {stage4PlayReason} from '../../apps/client/src/stage4-guards';
import {cardEffectDescription} from '../../apps/client/src/card-effect-description';
import {commandSchema} from '../../packages/online/src/protocol';
import type {OnlineGame} from '../../packages/online/src/protocol';
function view(s:ReturnType<typeof fixture>,seat=0):OnlineGame{return {...publicView(s,seat),actions:{targets:{},steps:[],stage3:stage3Actions(s,seat),stage4:stage4Actions(s,seat)}};}
const no=()=>{};
const props=(game:OnlineGame)=>({game,seat:0,busy:false,now:game.clock.since??1000,selected:null as string|null,targets:[] as number[],asElbow:false,setAsElbow:no,replacement:'',setReplacement:no,direction:'' as const,setDirection:no,breadMode:false,setBreadMode:no,setTargets:no,discard:[] as string[],send:no,locationMode:null,setLocationMode:no});
it('clan direct button and current23-role help are explicit; historical20-role help remains',()=>{
 const s=fixture('web-v0.1.15',['character-053','character-048','character-025','character-029'],'team');give(s,0,'basic-039#01');const html=renderToStaticMarkup(createElement(Stage3Controls,props(view(s))));expect(html).toContain('弃全部手牌 · 鸡犬升天 · 0 AP');expect(html).toContain('S1 +2AP');expect(html).toContain('S3 +2AP');const help=renderToStaticMarkup(Stage3Rules({stage4:true,batchC:true,batchD:true,p3Characters:true}));expect(help).toContain('本版23角色');expect(help).not.toContain('本版20角色');expect(help).not.toContain('本版18角色');expect(renderToStaticMarkup(Stage3Rules({batchC:true}))).toContain('本版20角色');
});
it('dragon conversion advertises ball identity/2AP and validates the new target branch',()=>{
 const s=fixture('web-v0.1.15',['character-029','character-048','character-044','character-026']);give(s,0,'basic-039#01');s.players[0].ap=2;const game=view(s);expect(stage4PlayReason(game,0,'basic-039#01',[1],{as:'dodge'})).toBeNull();expect(stage4PlayReason(game,0,'basic-039#01',[2],{as:'dodge'})).toContain('目标');expect(cardEffectDescription(game,0,'basic-039#01',true)).toMatchObject({name:'躲避球',cost:'2 AP'});
 const html=renderToStaticMarkup(createElement(Stage4Controls,{...props(game),selected:'basic-039#01',targets:[1],asElbow:true,mode:null,setMode:no}));expect(html).toContain('转换躲避球');expect(html).toContain('保留主动技能来源');expect(html).not.toContain('转换肘击');
});
it('encourage offers separate accept/cancel; source discard requires all chosen cards; intent rejects trusted outcomes',()=>{
 const s=fixture('web-v0.1.15',['character-020','character-048','character-025','character-029'],'team');let game=view(s);game.choice={id:1,kind:'encourage',actor:0,deadline:31000,source:undefined,data:{source:1}} as any;let html=renderToStaticMarkup(createElement(Stage3Controls,props(game)));expect(html).toContain('鼓励队友 · 免费判定');expect(html).toContain('放弃判定');
 give(s,0,'basic-039#01');game=view(s);game.choice={id:2,kind:'encourage-discard',actor:0,deadline:21000,count:1,cards:['basic-039#01'],source:1} as any;html=renderToStaticMarkup(createElement(Stage3Controls,{...props(game),discard:['basic-039#01']}));expect(html).toContain('确认弃置');expect(html).toContain('1/1');
 const packet={op:'game',requestId:'d-ui',matchId:'00000000-0000-4000-8000-000000000001',revision:0,intent:{type:'play',card:'basic-039#01',targets:[1],as:'dodge'}};expect(commandSchema.safeParse(packet).success).toBe(true);for(const key of ['actor','roll','state','cost','damage'])expect(commandSchema.safeParse({...packet,intent:{...packet.intent,[key]:0}}).success).toBe(false);
});
