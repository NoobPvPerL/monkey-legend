import type {OnlineGame} from '../../../packages/online/src/protocol';
export function ObserverForecast({game}:{game:OnlineGame}){
 const forecast=game.stage3?.g?.forecast;
 return forecast?.round===game.round?<span className="observer-forecast">观察 · 第{forecast.round}轮末轰炸：{forecast.regions.join('、')}</span>:null;
}
