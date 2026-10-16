import {expect,it} from 'vitest';
import {createGame,dispatch,publicView} from '../packages/game-core/src/index';
import {replay,tabletopSetup} from '../packages/game-core/src/replay';
import type {Command,Setup} from '../packages/game-core/src/types';

it('不可信JSON命令拒绝类型混淆，拒绝时保留原状态与所有费用',()=>{
 const s=createGame({...tabletopSetup('ffa'),first:1},0);
 for(const bad of [null,[],{}, {type:'choose',choice:s.choice!.id,accept:'false'}, {type:'choose',choice:s.choice!.id,card:0}, {type:'choose',choice:s.choice!.id,cell:false}, {type:'choose',choice:s.choice!.id,cards:'basic-001#01'}, {type:'play',card:'basic-001#01',targets:'0'}, {type:'step',path:'r2c4'}, {type:'tick',actor:'1'}, {type:'tick',revision:0.5}]){
  const cmd=bad&&typeof bad==='object'&&!Array.isArray(bad)?{id:'bad',actor:1,revision:0,...bad}:bad;
  const before=structuredClone(s),r=dispatch(s,cmd as Command,0);expect(r.ok).toBe(false);expect(r.state).toBe(s);expect(s).toEqual(before);
 }
});

it('复现开局验证全部注入类型，不延迟接受坏骰子/重洗/随机开关',()=>{
 for(const patch of [{dice:[7]},{dice:'4'},{bombs:['未知地点']},{reshuffles:[['unknown#01']]},{reshuffles:[['basic-001#01','basic-001#01']]},{sortedReshuffles:'false'},{characters:null},{deck:null},{first:null},{teams:['A','A','A','B']}])expect(()=>createGame({...tabletopSetup('ffa'),...patch} as Setup,0)).toThrow();
 for(const file of [null,{}, {format:'monkey-legend-replay-v1',setup:tabletopSetup('ffa'),commands:[null]}])expect(()=>replay(file as never)).toThrow();
});

it('公开视图保留待攻击和移动信息，隐藏未来输入且深拷贝不能反向改状态',()=>{
 let s=createGame({...tabletopSetup('ffa'),first:3},0);
 const card=s.players[3].hand[0];
 const r=dispatch(s,{id:'hit',revision:0,actor:3,type:'play',card,targets:[1]},0);expect(r.ok).toBe(true);s=r.state;
 const v=publicView(s,1);expect(v.attack).toMatchObject({actor:3,card,targets:[1]});expect(v.choice).toMatchObject({actor:1,kind:'response'});
 expect(v.players[1].hand).toEqual(s.players[1].hand);expect(v.players[3]).not.toHaveProperty('hand');expect(v).not.toHaveProperty('random');expect(v).not.toHaveProperty('queue');expect(v).not.toHaveProperty('deck');
 expect(v.events.find(e=>e.type==='play')?.text).toContain('目标S2 美丽学子');
 v.safe.length=0;v.attack!.targets.push(0);v.players[1].hand!.length=0;v.order.reverse();expect(s.safe.length).toBe(32);expect(s.attack!.targets).toEqual([1]);expect(s.players[1].hand.length).toBe(4);expect(s.order[0]).toBe(3);
 let m=createGame({...tabletopSetup('ffa'),first:3,dice:[6]},0);m=dispatch(m,{id:'move',revision:0,actor:3,type:'move'},0).state;
 expect(publicView(m,0).movement).toMatchObject({remaining:3,origin:'r2c5',path:['r2c5']});
});

it('团队攻击不能选择队友，费用/实体/攻击次数不改变',()=>{
 const setup=tabletopSetup('team');const s=createGame({...setup,first:3},0);
 const before=structuredClone(s);const r=dispatch(s,{id:'ally',actor:3,revision:0,type:'play',card:s.players[3].hand[0],targets:[2]},0);
 expect(r.ok).toBe(false);expect(r.state).toBe(s);expect(s).toEqual(before);
});
