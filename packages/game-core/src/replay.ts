import {ALL_CARDS,CHARACTER_IDS,definitionId} from '../../game-data/src/index';
import {createGame,dispatch,validateState} from './index';
import type {Command,GameState,Mode,Setup} from './types';
export function tabletopSetup(mode:Mode):Setup {
 const reserved=['basic-009#01','basic-009#02','basic-009#03','basic-009#04'];const rest=ALL_CARDS.filter(c=>!reserved.includes(c)).sort();
 return {mode,seed:1,seats:[0,1,2,3],characters:[...CHARACTER_IDS],teams:['A','A','B','B'],first:0,deck:[...rest.slice(0,12),...reserved,...rest.slice(12)],dice:[4,4,4,4],bombs:[...Array(5).fill('XDF'),...Array(5).fill('食堂')],sortedReshuffles:true};
}
export function tabletopCommand(s:GameState):Command {
 const common={id:`tabletop-${s.revision}`,revision:s.revision,actor:s.choice?.actor??s.active};
 if(s.choice){const c=s.choice;let cards:string[]|undefined;
  if(c.kind==='discard'){const hand=s.players[c.actor].hand;const reserved=(card:string)=>c.actor===3&&card.startsWith('basic-009#0')&&Number(card.split('#')[1])<=4;const keepOrder=[...hand].sort((a,b)=>Number(reserved(b))-Number(reserved(a))||a.localeCompare(b));cards=keepOrder.slice(hand.length-c.count!);}
  return {...common,type:'choose',choice:c.id,accept:false,card:null,cell:null,cards};
 }
 if(s.active===3&&s.round>=9&&s.players[3].attacks<2){const card=s.players[3].hand.find(c=>definitionId(c)==='basic-009'&&Number(c.split('#')[1])<=4);if(card)return {...common,type:'play',card,targets:[1]};}
 return {...common,type:'end'};
}
export function runTabletop(mode:Mode):{state:GameState;commands:Command[];setup:Setup} {
 const setup=tabletopSetup(mode);let state=createGame(setup,0);const commands:Command[]=[];
 while(!state.result){if(commands.length>300)throw Error('完整推演未收敛');const cmd=tabletopCommand(state);const result=dispatch(state,cmd,0);if(!result.ok)throw Error(result.error);state=result.state;validateState(state);commands.push(cmd);}
 return {state,commands,setup};
}
export interface ReplayFile { format:'monkey-legend-replay-v1'; setup:Setup; commands:{command:Command;at:number}[] }
export function replay(file:ReplayFile):GameState {
 if(file.format!=='monkey-legend-replay-v1'||!Array.isArray(file.commands)||file.commands.length>20000)throw Error('复现文件格式无效或过大');
 let state=createGame(file.setup,0);let previous=0;
 for(const item of file.commands){if(!Number.isFinite(item.at)||item.at<previous)throw Error('复现时钟必须单调');previous=item.at;const result=dispatch(state,item.command,item.at);if(!result.ok)throw Error(`第${state.revision+1}步：${result.error}`);state=result.state;}
 return state;
}
