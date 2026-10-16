import type {OnlineGame} from '../../../packages/online/src/protocol';

type PublicEvent=OnlineGame['events'][number];
const actions=new Set(['play','move','response','skill','teleport','discard','timeout-discard']);
export const latestAction=(events:PublicEvent[])=>events.findLast(event=>actions.has(event.type))??events.at(-1);
export function attention(game:OnlineGame,seat:number):{key:string;text:string}|null {
 if(game.result||game.players[seat].hp<=0)return null;
 if(game.choice)return game.choice.actor===seat?{key:`choice:${game.choice.id}`,text:game.choice.kind==='response'?'轮到你响应攻击':'轮到你作出选择'}:null;
 return game.active===seat?{key:`turn:${game.round}:${game.active}`,text:game.phase==='moving'?'选择移动路径':'轮到你行动'}:null;
}
export function nextFeedback(previous:{matchId:string|null;seq:number;attention:string|null}|null,matchId:string|null,game:OnlineGame,seat:number) {
 const cue=attention(game,seat),same=previous?.matchId===matchId;
 const unseen=same?game.events.filter(event=>event.seq>previous.seq):[];
 const event=unseen.findLast(event=>['play','eliminate','round'].includes(event.type));
 const prompt=cue&&(!same||previous.attention!==cue.key)?cue.text:null;
 return {cursor:{matchId,seq:game.events.at(-1)?.seq??0,attention:cue?.key??null},message:prompt??event?.text??null,urgent:Boolean(prompt)};
}
