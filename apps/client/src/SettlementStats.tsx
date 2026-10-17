import type {OnlineGame,Member} from '../../../packages/online/src/protocol';

export function eliminationCauses(events:OnlineGame['events']):Map<number,string>{
 const lastDamage=new Map<number,string>(),causes=new Map<number,string>(),cave=new Set<number>();
 for(const event of events){
  const seat=Number(event.text.match(/^S([1-4])\s/)?.[1]??0)-1;
  if(seat<0)continue;
  if(event.type==='cave')cave.add(seat);
  if(event.type==='damage'){lastDamage.set(seat,cave.has(seat)?'野人袭击':event.text.includes('环境伤害')?'环境伤害':'战斗伤害');cave.delete(seat);}
  if(event.type==='eliminate')causes.set(seat,lastDamage.get(seat)??'已淘汰');
 }
 return causes;
}
export default function SettlementStats({game,members}:{game:OnlineGame;members:(Member|null)[]}){
 const causes=eliminationCauses(game.events);
 return <div className="settlement-stats"><table><caption>个人战绩</caption><thead><tr><th>玩家</th><th>击杀</th><th>伤害</th><th>状态</th></tr></thead><tbody>{game.players.map(player=><tr key={player.seat}><th scope="row">{members[player.seat]?.name??`S${player.seat+1}`}</th><td>{player.kills}</td><td>{player.damage}</td><td>{player.hp>0?'存活':causes.get(player.seat)??'已淘汰'}</td></tr>)}</tbody></table><p>击杀只计对敌人造成致命伤害；毒圈、轰炸或野人淘汰不计玩家击杀。伤害只计敌人实际损失的生命。</p></div>;
}
