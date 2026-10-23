import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import OnlineBoard from '../../apps/client/src/OnlineBoard';
import '../../apps/client/src/style.css';
import '../../apps/client/src/online.css';
import {createGame,dispatch,publicView,legalSteps,validateState} from '../../packages/game-core/src/index';
import {stage3Actions} from '../../packages/game-core/src/stage3-engine';
import {stage4Actions} from '../../packages/game-core/src/stage4-view';
import type {GameState,Setup,Command} from '../../packages/game-core/src/types';

const scenario=new URLSearchParams(location.search).get('scenario')??'c-feather';
const batch=scenario[0] as 'c'|'d'|'e'|'f',version=({c:'web-v0.1.14',d:'web-v0.1.15',e:'web-v0.1.16',f:'web-v0.1.17'} as const)[batch];
const roles:Record<string,string[]>={
 'c-feather':['046','048','047','026'],'c-feather-fail':['046','048','047','026'],'c-primitive':['047','048','025','046'],
 'd-dragon':['029','048','044','026'],'d-clan':['053','048','025','029'],'d-encourage':['020','048','025','029'],
 'e-gas':['014','016','024','038'],'e-escape':['038','014','016','024'],'e-highest':['038','014','016','024'],
 'f-execute':['007','051','019','052'],'f-tenacity':['052','051','019','007'],'f-monkey5':['019','048','025','031'],
 'f-home':['048','018','025','031'],'f-self':['048','025','017','047'],'f-sting':['048','036','025','047'],'f-bccb':['048','032','025','047'],
};
if(!version||!roles[scenario])throw Error('Unknown local review scenario');
let game=createGame({mode:['d-clan','d-encourage','f-self'].includes(scenario)?'team':'ffa',teams:['A','B','A','B'],ruleVersion:version,seed:42,seats:[0,1,2,3],first:0,characters:roles[scenario].map(id=>'character-'+id) as Setup['characters']},Date.now());
for(const p of game.players){game.deck.push(...p.hand);p.hand=[];p.cell=['r2c4','r2c6','r2c2','r1c8'][p.seat];p.ap=12;}
game.choice=null;game.queue=[];game.phase='action';game.active=0;game.cursor=0;game.movement=null;game.clock={remaining:60000,since:game.time};
let serial=0;
function give(a:number,card:string){game.deck=game.deck.filter(c=>c!==card);game.discard=game.discard.filter(c=>c!==card);game.players.forEach(p=>p.hand=p.hand.filter(c=>c!==card));game.players[a].hand.push(card);}
function act(fields:Record<string,unknown>){const r=dispatch(game,{...fields,id:'cdef-setup-'+(++serial),actor:game.choice?.actor??game.active,revision:game.revision} as Command,game.time+1);if(!r.ok)throw Error(r.error);game=r.state;}
if(scenario.startsWith('c-feather')){game.players[1].cell='r4c8';['basic-009#01','basic-003#01','basic-039#01'].forEach(c=>give(0,c));game.random.dice=scenario==='c-feather'?[6,6]:[1,6];}
if(scenario==='c-primitive'){game.players[0].hp=1;give(0,'basic-039#01');game.random.dice=[6];act({type:'play',card:'basic-039#01',targets:[]});}
if(scenario==='d-dragon'||scenario==='d-clan'){['basic-039#01','basic-009#01','basic-003#01'].forEach(c=>give(0,c));game.random.dice=[6,6];}
if(scenario==='d-encourage'){
 game.active=1;game.cursor=1;game.players[1].cell='r1c4';game.players[2].cell='r1c5';game.players[2].ap=0;
 ['basic-003#01','basic-039#01','basic-046#01'].forEach(c=>give(1,c));game.random.dice=[2];act({type:'play',card:'basic-003#01',targets:[2]});
}
if(scenario==='e-highest'){game.players[1].hp=4;game.players[2].hp=3;game.players[3].hp=3;}
if(scenario==='f-execute'){game.players[0].cell='r1c4';game.players[1].cell='r1c5';game.players[1].hp=2;give(0,'basic-039#01');game.random.dice=[1];}
if(scenario==='f-tenacity'){game.players[1].cell='r3c4';give(0,'basic-039#01');}
if(scenario==='f-monkey5'){give(0,'basic-003#01');game.players[1].ap=0;}
if(scenario==='f-home'){give(0,'basic-007#01');}
if(scenario==='f-self'){give(0,'basic-016#01');give(1,'basic-001#01');give(3,'basic-001#02');game.random.dice=[3];act({type:'play',card:'basic-016#01',targets:[2]});}
if(scenario==='f-sting'||scenario==='f-bccb'){
 game.players[0].cell='r2c1';game.players[1].cell='r1c2';game.players[2].cell='r3c5';
 give(0,'basic-001#01');give(0,'basic-001#02');game.random.dice=scenario==='f-sting'?[6,4,6]:[6,2];
 if(scenario==='f-sting')game.players[0].shield=2;
 act({type:'move'});act({type:'step',path:['r2c2']});
}
validateState(game);
const initial=game;
declare global{interface Window{__p3Review:{scenario:string;state:GameState;error:string;intents:unknown[]}}}
const intents:unknown[]=[];
function App(){
 const [state,setState]=useState(initial),[error,setError]=useState('');const seat=state.choice?.actor??state.active;
 window.__p3Review={scenario,state:structuredClone(state),error,intents};
 const snapshot={protocol:1,roomId:'00000000-0000-4000-8000-000000000001',code:'0388',status:'playing',mode:state.mode,host:'local0',members:state.players.map(p=>({id:'local'+p.seat,seat:p.seat,name:'审核玩家'+(p.seat+1),ready:true,online:true})),roomRevision:0,matchId:'00000000-0000-4000-8000-000000000002',seat,memberId:'local'+seat,epoch:1,serverTime:Date.now(),game:{...publicView(state,seat),actions:{targets:Object.fromEntries(state.players[seat].hand.map(c=>[c,stage4Actions(state,seat).cards[c]?.targets??[]])),steps:legalSteps(state),stage3:stage3Actions(state,seat),stage4:stage4Actions(state,seat)}}};
 return <main className="online-app"><header className="topbar"><div className="wordmark">应猴传说 <span>本地审核 · {state.version}</span></div><span>房间0388</span></header>{error&&<p className="error">{error}</p>}<OnlineBoard snapshot={snapshot as any} busy={false} animations={false} onToggleAnimations={()=>{}} onRematch={()=>{}} send={intent=>{const at=Date.now(),command={...intent,id:'cdef-ui-'+(++serial),actor:seat,revision:state.revision} as Command;const r=dispatch(state,command,at);intents.push({intent,command,at,ok:r.ok,error:r.error,expected:structuredClone(r.state)});if(!r.ok)setError(r.error??'失败');else{validateState(r.state);setError('');setState(r.state);}}}/></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
