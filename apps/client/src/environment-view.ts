import {hasClassicPatch,mapForVersion} from '../../../packages/game-data/src/index';
interface EnvironmentView {version:string;round:number;classic?:{poison:string[];bombs:string[];bombRound?:number};events:{type:string;text:string}[]}
// Last-round history is a display record, never a forecast or damage input.
export function lastBombing(game:EnvironmentView):{regions:string[];round:number;label:string}{
 const event=game.events.findLast(e=>e.type==='environment'),match=event?.text.match(/第(\d+)轮末，轰炸：(.*)/);
 const allowed=mapForVersion(game.version).regions;
 const recovered=(match?.[2].split('、')??[]).filter(r=>Object.hasOwn(allowed,r));
 const regions=[...(game.classic?.bombs.length?game.classic.bombs:recovered)];
 const round=game.classic?.bombs.length&&game.classic.bombRound?game.classic.bombRound:Number(match?.[1]??0);
 return {regions,round,label:regions.length?`最近第${round}轮轰炸：${regions.join('、')}；本轮轮末重新抽取`:'尚未进行轮末轰炸'};
}
export const poisonLimit=(version:string)=>hasClassicPatch(version)?11:8;
export const classicEnvironmentText=(version:string)=>hasClassicPatch(version)?'除山洞、教学楼、操场、办公室外，其余11区每轮初新增2个永久毒区。11区全变毒后，教学楼／操场／办公室加入原有室外轰炸候选，永久不进毒圈；轮末随机轰炸2区，无预告。山洞每连续3个个人回合结束扣2AP（最低0）并受1伤，可护盾抵挡，离洞立即清零。环境同区连续整轮实际失血翻倍，换区或该轮未失血重置。第5轮农场封闭，最后一人或一队获胜，无12轮上限。':'每轮初新增2个永久室内毒区，轮末随机轰炸2个不同室外地区，无预告。环境基础伤害1，可护盾抵挡；同地区连续整轮实际失血翻倍，换区或该轮未失血重置。山洞豁免，第5轮农场封闭，原住可留或离开。最后一人或一队获胜，无12轮上限。';
