import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import DraftBoard from '../../apps/client/src/DraftBoard';
import OnlineBoard from '../../apps/client/src/OnlineBoard';
import '../../apps/client/src/style.css';
import '../../apps/client/src/online.css';
import {createGame,dispatch,publicView,legalSteps} from '../../packages/game-core/src/index';
import {createStage3Draft,dispatchDraft,draftView} from '../../packages/game-core/src/draft';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import type {DraftState} from '../../packages/game-core/src/draft';
import type {GameState,Command,Setup} from '../../packages/game-core/src/types';

const mode=new URLSearchParams(location.search).get('mode')==='team'?'team':'ffa',at=Date.now();
let seed=0,initial:DraftState;
for(seed=1;seed<=10000;seed++){
 initial=createStage3Draft(mode,{seed,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false},at,'web-v0.1.19');
 if(initial.offer!.candidates.includes('character-035'))break;
}
if(seed>10000)throw Error('No normal035 first-offer seed found');
const members=Array.from({length:4},(_,seat)=>({id:'local'+seat,seat,name:'候选玩家'+(seat+1),ready:true,online:true}));
let serial=0;const history:unknown[]=[];
declare global{interface Window{__hActivation:any}}
function App(){
 const [draft,setDraft]=useState(initial!),[game,setGame]=useState<GameState|null>(null),[error,setError]=useState('');
 const seat=game?.choice?.actor??game?.active??draft.offer?.actor??0;
 window.__hActivation={mode,seed,initial:initial!,draft,game,error,history};
 const snapshot=game?{protocol:1,roomId:'00000000-0000-4000-8000-000000000001',code:'0389',status:'playing',mode,host:'local0',members,roomRevision:0,matchId:'00000000-0000-4000-8000-000000000002',seat,memberId:'local'+seat,epoch:1,serverTime:Date.now(),game:{...publicView(game,seat),actions:{targets:Object.fromEntries(game.players[seat].hand.map(c=>[c,stage4Actions(game,seat).cards[c]?.targets??[]])),steps:legalSteps(game),stage3:stage3Actions(game,seat),stage4:stage4Actions(game,seat)}}}:null;
 return <main className="online-app"><header className="topbar"><div className="wordmark">应猴传说</div><span>房间0389</span></header>{error&&<p className="error">{error}</p>}{!game?<DraftBoard draft={draftView(draft,seat)} seat={seat} members={members as any} serverTime={Date.now()} busy={false} send={intent=>{
  const at=Date.now(),command={id:'h-entry-'+(++serial),type:'pick' as const,revision:draft.revision,actor:seat,offer:intent.offer,character:intent.character};const r=dispatchDraft(draft,command,at);history.push({kind:'draft',command,at,expected:r.state,ok:r.ok});
  if(!r.ok){setError(r.error??'选角失败');return;}setDraft(r.state);
  if(r.state.status==='complete'){
   const setup:Setup={mode,ruleVersion:'web-v0.1.19',seed:r.state.random.seed,seats:[0,1,2,3],characters:r.state.selected as Setup['characters'],first:r.state.order[0],...(mode==='team'?{teams:r.state.teams.map(t=>t==='机械猴子'?'A':'B') as ('A'|'B')[]}:{})};
   const next=createGame(setup,at);history.push({kind:'create',setup,at,expected:next});setGame(next);
  }
 }}/>:<OnlineBoard snapshot={snapshot as any} busy={false} animations={false} onToggleAnimations={()=>{}} onRematch={()=>{}} send={intent=>{
  const at=Date.now(),command={...intent,id:'h-entry-'+(++serial),actor:seat,revision:game.revision} as Command,r=dispatch(game,command,at);history.push({kind:'game',command,at,expected:r.state,ok:r.ok});if(!r.ok)setError(r.error??'操作失败');else{setError('');setGame(r.state);}
 }}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
