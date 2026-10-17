import {expect,it} from 'vitest';
import {createGame,publicView} from '../../packages/game-core/src/index';
import {actionBlockReason,playBlockReason,prepareGameCommand,commandError} from '../../apps/client/src/interaction-guards';
import {compactLine} from '../../apps/client/src/CompactText';
import type {Snapshot,OnlineCommand} from '../../packages/online/src/protocol';
function snapshot():Snapshot {
 const game={...publicView(createGame({mode:'ffa',seed:1,seats:[0,1,2,3],first:0,ruleVersion:'web-v0.1.2'},1000),0),actions:{targets:{'basic-005#01':[1,2,3]},steps:[]}};
 game.choice=null;game.phase='action';game.active=0;game.players[0].hand=['basic-005#01'];game.players[0].ap=4;
 return {protocol:1,roomId:'room',code:'2513',status:'playing',mode:'ffa',host:'me',members:[],roomRevision:10,matchId:'match',seat:0,memberId:'me',epoch:1,serverTime:1000,game};
}
it('explains the reported 2/2 attack limit and preserves food actions',()=>{
 const s=snapshot(),g=s.game!;g.players[0].attacks=2;
 expect(playBlockReason(g,0,'basic-005#01',[3],false,1500)).toBe('本回合攻击次数已用完（2/2，旧版规则）');
 expect(prepareGameCommand(s,s,{type:'play',card:'basic-005#01',targets:[3]},'x',1500).command).toBeUndefined();
 g.players[0].hand!.push('basic-039#01');expect(playBlockReason(g,0,'basic-039#01',[],false,1500)).toBeNull();
 g.players[0].attacks=1;expect(playBlockReason(g,0,'basic-005#01',[3],false,1500)).toBeNull();
 g.version='web-v0.1.3';g.players[0].attacks=4;expect(playBlockReason(g,0,'basic-005#01',[3],false,1500)).toBeNull();
});
it('distinguishes missing targets, AP, illegal targets, waiting, movement and elapsed time',()=>{
 const g=snapshot().game!;
 expect(playBlockReason(g,0,'basic-005#01',[],false,1500)).toContain('选择目标');
 expect(playBlockReason(g,0,'basic-005#01',[0],false,1500)).toContain('重新选择');
 g.players[0].ap=2;expect(playBlockReason(g,0,'basic-005#01',[3],false,1500)).toContain('AP不足');
 g.players[0].ap=4;g.phase='moving';expect(playBlockReason(g,0,'basic-005#01',[3],false,1500)).toContain('结束移动');
 g.phase='action';expect(actionBlockReason(g,0,true,1500)).toContain('等待操作确认');
 expect(actionBlockReason(g,0,false,61000)).toContain('行动时间已结束');
 g.choice={id:4,kind:'runner-roll',actor:0,deadline:1500,source:undefined};expect(actionBlockReason(g,0,false,1500)).toContain('选择时间已结束');
});
it('a newer snapshot cannot silently rebase a click into another choice or match',()=>{
 const s=snapshot(),latest=structuredClone(s);latest.game!.revision++;
 expect(prepareGameCommand(s,latest,{type:'play',card:'basic-005#01',targets:[3]},'same-id',1500).error).toContain('本次操作未发送');
 latest.matchId='another';expect(prepareGameCommand(s,latest,{type:'end'},'same-id',1500).command).toBeUndefined();
 const command=prepareGameCommand(s,s,{type:'play',card:'basic-005#01',targets:[3]},'request',1500).command!;
 expect(command).toMatchObject({revision:0,requestId:'request',intent:{targets:[3]}});
});
it('expired choices are blocked locally and a server race is explained without automatic retry',()=>{
 const s=snapshot();s.game!.choice={id:5,kind:'runner-roll',actor:0,deadline:2000,source:undefined};
 expect(prepareGameCommand(s,s,{type:'choose',choice:4,accept:true},'x',1500).command).toBeUndefined();
 expect(prepareGameCommand(s,s,{type:'choose',choice:5,accept:true},'x',2000).command).toBeUndefined();
 const command=prepareGameCommand(s,s,{type:'choose',choice:5,accept:true},'x',1500).command!;
 const next=structuredClone(s);next.game!.choice=null;next.game!.revision++;
 expect(commandError(command,{ok:false,error:'命令版本过期',snapshot:next})).toContain('原选择窗口已结束');
 expect(commandError(command,{ok:false,error:'命令版本过期',snapshot:s})).toContain('请查看后重新确认');
 expect(commandError(command,{ok:false,error:'操作结果尚未确认，请重试原请求'})).toContain('重试原请求');
 expect(commandError(command,{ok:true})).toBe('');
});
it('compact actions keep card, cost, seats, actual HP, shield and full-AP semantics',()=>{
 expect(compactLine('S1 跑者 使用吸血，支付1AP，目标S4 lemon')).toBe('S1 [−1 AP] ─吸血→ S4');
 expect(compactLine('S1 lemon 使用搏击操Ⅲ，支付3AP，目标S2 美丽学子、S3 跑者、S4 土豆')).toContain('S2、S3、S4');
 expect(compactLine('S4 lemon 普通伤害2，护盾抵挡1，实际失血1')).toBe('S4 [♥ −1] [◇ 抵挡1]');
 expect(compactLine('S4 lemon 环境伤害1，护盾抵挡0，实际失血1')).toContain('⚠ 环境');
 expect(compactLine('S1 lemon 头锤：从S2 美丽学子吸收全部9AP（目标AP 9→0）')).toContain('[AP 9→0]');
 expect(compactLine('未知说明<原文>')).toBe('未知说明<原文>');
});
