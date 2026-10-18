import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createGame,publicView} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import {cardForVersion} from '../../packages/game-data/src/index';
import type {OnlineGame} from '../../packages/online/src/protocol';
import {cardEffectDescription,elbowEffect} from '../../apps/client/src/card-effect-description';
import {nextFeedback,publicCardEffect} from '../../apps/client/src/board-feedback';
import CardEffectSummary from '../../apps/client/src/CardEffectSummary';

function game(version:'web-v0.1.8'|'web-v0.1.9'='web-v0.1.9'):OnlineGame{
 const s=createGame({mode:'ffa',ruleVersion:version,seed:42,seats:[0,1,2,3],first:0,characters:['character-023','character-027','character-026','character-031']},1000);
 s.phase='action';s.choice=null;s.queue=[];
 for(const p of s.players){s.deck.push(...p.hand);p.hand=[];}
 for(const id of ['basic-003#01','basic-004#01','basic-039#01','basic-025#01','basic-073#01']){s.deck=s.deck.filter(c=>c!==id);s.players[0].hand.push(id);}
 return {...publicView(s,0),actions:{targets:{},steps:[],stage3:stage3Actions(s,0),stage4:stage4Actions(s,0)}};
}
it('shows complete versioned text, authoritative AP cost, variable input and an unlocked quote distinctly',()=>{
 const g=game();
 expect(cardEffectDescription(g,0,'basic-003#01')).toMatchObject({cost:'3 AP',text:cardForVersion('basic-003',g.version).text});
 expect(cardEffectDescription(game('web-v0.1.8'),0,'basic-003#01').text).not.toContain('最初获得者');
 expect(cardEffectDescription(g,0,'basic-025#01',false,4).cost).toBe('4 AP');
 expect(cardEffectDescription(g,0,'basic-073#01').cost).toBe('费用尚未锁定');
 g.actions.stage4!.cards['basic-039#01'].cost=0;
 expect(cardEffectDescription(g,0,'basic-039#01').cost).toBe('0 AP');
 const html=renderToStaticMarkup(createElement(CardEffectSummary,{game:g,seat:0,card:'basic-003#01'}));
 expect(html).toContain('本次3 AP');expect(html).toContain('最初获得者');expect(html).toContain('牌效与费用');
});
it('describes the converted action instead of claiming the original food effect will occur',()=>{
 const effect=cardEffectDescription(game(),0,'basic-039#01',true);
 expect(effect).toMatchObject({name:'肘击',originalName:'奈雪',cost:'2 AP',text:elbowEffect});
 expect(effect.text).not.toContain('回复');
 expect(cardEffectDescription(game(),0,'basic-003#01',true).text).toContain('原搏击操实体入弃');
 const response=game();response.choice={id:1,actor:0,kind:'response',source:1,deadline:11000,cards:['basic-002#01']};
 expect(cardEffectDescription(response,0,'basic-002#01').text).toBe(cardForVersion('basic-002',response.version).text);
});
it('free higher boxing response explicitly cancels only the defender, with no offensive effect',()=>{
 const g=game();g.choice={id:1,actor:0,kind:'response',source:1,deadline:11000,cards:['basic-004#01']};
 const effect=cardEffectDescription(g,0,'basic-004#01');
 expect(effect.cost).toBe('0 AP');expect(effect.text).toContain('不反击、不影响其他目标');expect(effect.text).toContain('最初获得者');expect(effect.text).not.toContain('全图选');
});
it('uses only public played names for effects, preserves actual outcomes and never replays old cards on reconnect',()=>{
 const g=game();g.choice=null;g.active=1;
 const prev=nextFeedback(null,'match',g,0).cursor;
 let seq=g.events.at(-1)!.seq;
 g.events.push({seq:++seq,type:'play',text:'S2 使用搏击操Ⅰ，支付3AP'},{seq:++seq,type:'ap',text:'S1 被扣1AP → 0'});
 const feedback=nextFeedback(prev,'match',g,0);
 expect(feedback.effects).toHaveLength(1);expect(feedback.effects[0].text).toContain('最初获得者');expect(feedback.message).toContain('被扣1AP');
 expect(nextFeedback(feedback.cursor,'match',g,0).effects).toEqual([]);
 expect(nextFeedback(null,'match',g,0).effects).toEqual([]);
 expect(publicCardEffect(g,{seq:99,type:'play',text:'未知卡牌'})).toBeNull();
 expect(publicCardEffect(g,{seq:100,type:'chat',text:'S2 使用奈雪，支付1AP'})).toBeNull();
 expect(publicCardEffect(g,{seq:101,type:'response',text:'S2 使用搏击操Ⅱ，支付0AP'})!.text).toContain('不反击');
 expect(publicCardEffect(g,{seq:102,type:'play',text:'S1 使用肘击，支付2AP'})!.text).toBe(elbowEffect);
});
