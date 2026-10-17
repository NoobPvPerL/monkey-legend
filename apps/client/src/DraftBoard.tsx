import {useEffect,useState} from 'react';
import {sourceCatalogForVersion,runtimeForVersion} from '../../../packages/game-data/src/index';
import type {DraftView} from '../../../packages/game-core/src/draft';
import type {DraftPickIntent} from '../../../packages/online/src/draft-protocol';
import type {Member} from '../../../packages/online/src/protocol';

export default function DraftBoard({draft,seat,members,serverTime,busy,send}:{draft:DraftView;seat:number|null;members:(Member|null)[];serverTime:number;busy:boolean;send:(intent:DraftPickIntent)=>void}){
 const catalog=sourceCatalogForVersion(draft.catalogVersion).characters,offer=draft.offer;
 const effective=runtimeForVersion(draft.catalogVersion).characters as Record<string,{text:string}>;
 const [selected,setSelected]=useState<string|null>(null),[now,setNow]=useState(serverTime);
 useEffect(()=>{setSelected(null);},[offer?.id]);
 useEffect(()=>{const start=performance.now();setNow(serverTime);const timer=setInterval(()=>setNow(serverTime+performance.now()-start),200);return()=>clearInterval(timer);},[serverTime]);
 const own=offer?.actor===seat,remaining=offer?Math.max(0,offer.deadline-now):0,canPick=own&&!busy&&remaining>0;
 const name=(a:number)=>members[a]?.name??`S${a+1}`;
 return <section className="draft-board" aria-label={seat===null?'观战选角':'角色选择'}>
  <header className="draft-heading"><div><strong>{draft.status==='complete'?'角色已选定':own?'选择你的角色':`${offer?name(offer.actor):''} 正在选择角色`}</strong><p>{draft.mode==='team'?'机械猴子／帝汶家族 · 双人同盟':'各自为战'} · 按行动顺序三选一</p></div><b aria-label="选角剩余时间">{offer?`${Math.ceil(remaining/1000)}s`:'✓'}</b></header>
  <ol className="draft-progress" aria-label="选角顺序">{draft.order.map(a=><li key={a} className={offer?.actor===a?'current':''}><span className={`seat seat-${a}`}>S{a+1}</span><strong>{name(a)}</strong><small>{draft.mode==='team'?draft.teams[a]:''}</small><span>{draft.selected[a]?catalog[draft.selected[a]!].name:offer?.actor===a?'正在选择':'等待选择'}</span></li>)}</ol>
  {offer?.candidates?<><p className="draft-instruction">{seat===null?'观战可查看当前三张候选。':'选中一张后确认；未选角色会归还牌池。'}30秒超时将从本次候选中随机选择。</p><div className="draft-candidates" role="group" aria-label="本次三个候选角色">{offer.candidates.map(id=>{
   const character=catalog[id];return <button key={id} className={`draft-candidate ${selected===id?'picked':''}`} aria-pressed={selected===id} disabled={!canPick} onClick={()=>setSelected(id)} aria-label={`选择${character.name}`}>
    <header><strong>{character.name}</strong><span>♥ {character.printedHp}</span></header><p>出生：{character.spawnRegion}</p><div>{(effective[id]?.text??character.text).split('\n').map((line,i)=><p key={i}>{line.replace(/^-\s*/,'')}</p>)}</div>
   </button>;
  })}</div>{seat!==null&&own&&<div className="draft-confirm"><p role="status">{remaining===0?'选择时间已结束，正在同步':busy?'等待选择确认':selected?`已选：${catalog[selected].name}`:'请选择一个候选角色'}</p><button className="primary" disabled={!canPick||!selected||!offer.candidates.includes(selected)} onClick={()=>{if(selected)send({type:'draft-pick',offer:offer.id,character:selected});}}>确认角色{selected?` · ${catalog[selected].name}`:''}</button></div>}</>:draft.status==='complete'?<p role="status">四名玩家已选定角色，等待对局开始。</p>:<p role="status">等待当前玩家完成选择。其他玩家的候选仅本人和观众可见。</p>}
 </section>;
}
