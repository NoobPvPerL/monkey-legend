import type {OnlineGame} from '../../../packages/online/src/protocol';

type PublicEvent=OnlineGame['events'][number];
const results=new Set(['cave','damage','ap','miss','response','eliminate','heal','shield']);
const actions=new Set(['play','move','response','skill','teleport','discard','timeout-discard','environment',...results]);
export const latestAction=(events:PublicEvent[])=>events.findLast(event=>actions.has(event.type))??events.at(-1);
export function attention(game:OnlineGame,seat:number):{key:string;text:string}|null {
 if(game.result||game.players[seat].hp<=0)return null;
 if(game.choice)return game.choice.actor===seat?{key:`choice:${game.choice.id}`,text:game.choice.kind==='response'?'轮到你响应攻击':game.choice.kind==='water-discard'?'轮到你弃置水域手牌':'轮到你作出选择'}:null;
 return game.active===seat?{key:`turn:${game.round}:${game.active}`,text:game.phase==='moving'?'选择移动路径':'轮到你行动'}:null;
}
export function nextFeedback(previous:{matchId:string|null;seq:number;attention:string|null}|null,matchId:string|null,game:OnlineGame,seat:number) {
 const cue=attention(game,seat),same=previous?.matchId===matchId;
 const unseen=same?game.events.filter(event=>event.seq>previous.seq):[];
 const outcomes=unseen.filter(event=>results.has(event.type));
 const event=unseen.findLast(event=>['play','round'].includes(event.type));
 const prompt=cue&&(!same||previous.attention!==cue.key)?cue.text:null;
 const summary=outcomes.length?outcomes.map(event=>event.type==='response'&&/使用(防御姿态|肘击)/.test(event.text)?event.text+'，取消本次攻击对自己的效果':event.text).join('\n'):null;
 const hit=outcomes.some(event=>event.type==='damage'&&Number(event.text.match(/实际失血(\d+)/)?.[1]??0)>0);
 const lines=[prompt,event?.type==='play'?event.text:null,summary??(!prompt&&event?.type!=='play'?event?.text:null)].filter(Boolean);
 return {cursor:{matchId,seq:game.events.at(-1)?.seq??0,attention:cue?.key??null},message:lines.join('\n')||null,urgent:Boolean(prompt),hit};
}
