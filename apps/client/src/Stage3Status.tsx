import {cardForVersion,definitionId} from '../../../packages/game-data/src/index';
import type {OnlineGame} from '../../../packages/online/src/protocol';
export function EquipmentLine({game,seat,onReference}:{game:OnlineGame;seat:number;onReference:(id:string)=>void}){
 if(!game.stage3)return null;const cards=game.stage3.equipment[seat];return <div className="equipment-line" aria-label={`S${seat+1}已装备`}>{cards.length?cards.map(card=><button key={card} onClick={()=>onReference(definitionId(card))}>{cardForVersion(definitionId(card),game.version).name}</button>):<small>未装备</small>}{game.stage3.jjExposed[seat]&&<b>暴露</b>}{game.stage3.breadBlocked[seat]&&<b>本回合禁出牌</b>}</div>;
}
export function ComboProgress({game}:{game:OnlineGame}){
 if(!game.stage3)return null;const owners=game.players.filter(p=>p.character==='character-010'||p.character==='character-045');if(!owners.length)return null;
 return <div className="combo-progress" aria-label="组合胜利进度">{owners.map(p=>{const ids=p.character==='character-010'?['basic-015','basic-016','basic-037']:['basic-046','basic-041','basic-047'],used=game.stage3!.combos[p.team]??[];return <div key={p.seat}><strong>{game.mode==='team'?`${p.team}队`:`S${p.seat+1}`} · {p.character==='character-010'?'帝汶三宝':'APE'}{p.hp===0?'（淘汰暂停）':''}</strong>{ids.map(id=><span key={id} className={used.includes(id)?'complete':''}>{used.includes(id)?'✓':'○'} {cardForVersion(id as ReturnType<typeof definitionId>,game.version).name}</span>)}</div>;})}</div>;
}
