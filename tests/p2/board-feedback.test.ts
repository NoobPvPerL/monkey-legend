import {expect,it} from 'vitest';
import {createGame,publicView} from '../../packages/game-core/src/index';
import type {OnlineGame} from '../../packages/online/src/protocol';
import {attention,latestAction,nextFeedback} from '../../apps/client/src/board-feedback';

function game():OnlineGame {
 const state=createGame({mode:'ffa',seed:1,seats:[0,1,2,3],first:0},1000);
 return {...publicView(state,0),actions:{targets:{},steps:[]}};
}
it('repeated snapshots do not replay a turn cue, while a new match does',()=>{
 const view=game();view.choice=null;view.active=0;view.phase='action';
 const first=nextFeedback(null,'match-one',view,0);expect(first.message).toBe('轮到你行动');
 expect(nextFeedback(first.cursor,'match-one',view,0).message).toBeNull();
 expect(nextFeedback(first.cursor,'match-two',view,0).message).toBe('轮到你行动');
});
it('a response request takes priority over incoming attack text, and only prompts its actor',()=>{
 const view=game();view.choice=null;view.active=1;
 const previous=nextFeedback(null,'match-one',view,0).cursor;
 view.choice={id:9,actor:0,kind:'response',deadline:11000,source:1};
 view.events.push({seq:view.events.at(-1)!.seq+1,type:'play',text:'S2 使用攻击'});
 const next=nextFeedback(previous,'match-one',view,0);
 expect(next.message).toBe('轮到你响应攻击\nS2 使用攻击');expect(next.urgent).toBe(true);
 expect(attention(view,2)).toBeNull();expect(nextFeedback(next.cursor,'match-one',view,0).message).toBeNull();
});
it('the latest player action survives subsequent bookkeeping events',()=>{
 const events=[{seq:1,type:'play',text:'S1 使用攻击'},{seq:2,type:'damage',text:'实际失血1'},{seq:3,type:'choice',text:'等待恢复选择'}];
 expect(latestAction(events)?.seq).toBe(2);
 events.push({seq:4,type:'response',text:'S2 使用防御姿态'});expect(latestAction(events)?.seq).toBe(4);
 expect(latestAction([])).toBeUndefined();
});
it('all combat results remain visible alongside a new choice, and actual damage selects impact audio',()=>{
 const view=game();view.choice=null;view.active=1;
 const previous=nextFeedback(null,'match',view,0).cursor;
 let seq=view.events.at(-1)!.seq;
 view.events.push({seq:++seq,type:'ap',text:'S2 被扣1AP → 0'},{seq:++seq,type:'damage',text:'S3 跑者 普通伤害1，护盾抵挡0，实际失血1'},{seq:++seq,type:'miss',text:'躲避球 未命中'});
 view.choice={id:3,kind:'runner-roll',actor:0,deadline:10000,source:undefined};
 const feedback=nextFeedback(previous,'match',view,0);
 expect(feedback.message).toContain('轮到你作出选择\nS2 被扣1AP');expect(feedback.message).toContain('实际失血1');expect(feedback.message).toContain('未命中');expect(feedback.hit).toBe(true);
 const repeat=nextFeedback(feedback.cursor,'match',view,0);expect(repeat.message).toBeNull();expect(repeat.hit).toBe(false);
 view.events.push({seq:++seq,type:'damage',text:'S1 lemon 普通伤害1，护盾抵挡1，实际失血0'});
 expect(nextFeedback(feedback.cursor,'match',view,0).hit).toBe(false);
});
it('rejoining does not announce historical attacks; eliminated players are not prompted to act',()=>{
 const view=game();view.choice=null;view.active=1;
 view.events.push({seq:view.events.at(-1)!.seq+1,type:'play',text:'旧攻击'});
 expect(nextFeedback(null,'match-one',view,0).message).toBeNull();
 view.players[0].hp=0;view.active=0;expect(attention(view,0)).toBeNull();
});
