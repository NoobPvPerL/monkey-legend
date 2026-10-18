import {expect,it} from 'vitest';
import {publicCardCost} from '../../apps/client/src/card-cost-label';
import {formContext} from '../../apps/client/src/board-form-state';
import {cardForVersion} from '../../packages/game-data/src/index';
import {stage4PlayReason} from '../../apps/client/src/stage4-guards';
import {createGame,publicView,legalSteps} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import type {Snapshot,OnlineGame} from '../../packages/online/src/protocol';
it('spectator costs show public X, tier choices, die range and negative cost without accepting private quotes',()=>{
 for(const [id,label] of [['basic-025','X AP'],['basic-032','2/3/4 AP（随机）'],['basic-034','1-6 AP（随机）'],['basic-028','-1/0/1 AP（随机）']] as const)
  expect(publicCardCost('web-v0.1.8',id,cardForVersion(id,'web-v0.1.8'))).toBe(label);
 expect(publicCardCost('web-v0.1.1','basic-008',cardForVersion('basic-008','web-v0.1.1'))).toBe('1 AP');
});
function fixture(){
 const s=createGame({mode:'ffa',ruleVersion:'web-v0.1.8',seed:42,seats:[0,1,2,3],first:0,characters:['character-048','character-006','character-004','character-045']},1000);s.choice=null;s.phase='action';s.queue=[];
 const card='basic-003#01';for(const p of s.players){s.deck.push(...p.hand);p.hand=[];p.ap=20;}s.deck=s.deck.filter(c=>c!==card);s.players[0].hand=[card];s.players[3].faction='机械猴子';
 const game:OnlineGame={...publicView(s,0),actions:{targets:{},steps:legalSteps(s),stage3:stage3Actions(s,0),stage4:stage4Actions(s,0)}};
 const room={roomId:'r',matchId:'m',memberId:'p',seat:0,epoch:1,game} as Snapshot;return {s,game,room};
}
it('quote-only revisions keep a form context while turn/window/match/identity changes invalidate it',()=>{
 const {room}=fixture(),context=formContext(room);const same=structuredClone(room);same.game!.revision++;expect(formContext(same)).toBe(context);
 for(const mutate of [(r:Snapshot)=>{r.matchId='next';},(r:Snapshot)=>{r.epoch++;},(r:Snapshot)=>{r.seat=1;},(r:Snapshot)=>{r.game!.stage3!.turn++;},(r:Snapshot)=>{r.game!.choice={id:2,kind:'west-carry',actor:0,deadline:31000,source:undefined};}]){const next=structuredClone(room);mutate(next);expect(formContext(next)).not.toBe(context);}
});
it('client blocks the same North/non-monkey target mixture that the authority rejects',()=>{
 const {game}=fixture();game.actions.stage4!.cards['basic-003#01'].targets=[1,2,3];
 expect(stage4PlayReason(game,0,'basic-003#01',[1,2])).toContain('北帝汶');expect(stage4PlayReason(game,0,'basic-003#01',[1,3])).toBeNull();
});
