import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {dispatch,validateState} from '../packages/game-core/src/index';
import {replay} from '../packages/game-core/src/replay';
import type {ReplayFile} from '../packages/game-core/src/replay';
import type {Command,GameState} from '../packages/game-core/src/types';

function load(name:string){return replay(JSON.parse(readFileSync(new URL(`./fixtures/ui-${name}.json`,import.meta.url),'utf8')) as ReplayFile);}
function go(s:GameState,input:Record<string,unknown>):GameState{const r=dispatch(s,{id:`fixture-${s.revision}`,revision:s.revision,actor:s.choice?.actor??s.active,...input} as Command,0);expect(r.error).toBeUndefined();validateState(r.state);return r.state;}
it('浏览器响应场景：合法开局直接头锤与肘击',()=>{let s=load('response');s=go(s,{type:'play',card:'basic-008#01',targets:[1]});expect(s.choice?.kind).toBe('response');s=go(s,{type:'choose',choice:s.choice!.id,card:'basic-002#01'});expect(s.players[3].ap).toBe(2);expect(s.players[1].ap).toBe(7);expect(s.discard).toEqual(['basic-008#01','basic-002#01']);});
it('浏览器土豆场景：学子放弃开局摸牌后可以命中土豆并传送',()=>{let s=load('teleport');s=go(s,{type:'play',card:'basic-009#01',targets:[3]});expect(s.choice?.kind).toBe('teleport');s=go(s,{type:'choose',choice:s.choice!.id,cell:'r3c5'});expect(s.players[3]).toMatchObject({hp:4,cell:'r3c5',skillUsed:true});});
it('浏览器跑者场景：合法穿过学子，命中后恢复至满血并付费',()=>{let s=load('runner');expect(s.players[3].cell).toBe('r2c2');s=go(s,{type:'play',card:'basic-009#01',targets:[2]});expect(s.choice?.kind).toBe('runner-roll');s=go(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('runner-pay');s=go(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[2]).toMatchObject({hp:3,ap:3,skillUsed:true});});
it('浏览器lemon场景：奖励先于支援，团队两名成员均摸牌',()=>{let s=load('lemon');s=go(s,{type:'play',card:'basic-009#01',targets:[0]});expect(s.choice?.kind).toBe('lemon-reward');s=go(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice?.kind).toBe('lemon-support');const counts=s.players.map(p=>p.hand.length);s=go(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.players[0]).toMatchObject({hp:4,ap:4,skillUsed:true});expect(s.players[0].hand.length).toBe(counts[0]+1);expect(s.players[1].hand.length).toBe(counts[1]+1);});
it('浏览器学子场景：首尾额外摸牌、补给保留盾，最终自选弃一张',()=>{let s=load('scholar');s=go(s,{type:'choose',choice:s.choice!.id,accept:true});s=go(s,{type:'play',card:'basic-045#01',targets:[]});expect(s.players[1]).toMatchObject({hp:4,shield:1,ap:3});s=go(s,{type:'end'});s=go(s,{type:'choose',choice:s.choice!.id,accept:true});expect(s.choice).toMatchObject({kind:'discard',count:1});s=go(s,{type:'choose',choice:s.choice!.id,cards:['basic-046#01']});expect(s.players[1].hand.length).toBe(4);expect(s.active).toBe(2);});

it('浏览器实际下载的JSON能在引擎逐条重放到同一弃牌后状态',()=>{
 const file=JSON.parse(readFileSync(new URL('../artifacts/p1/browser-roundtrip.json',import.meta.url),'utf8')) as ReplayFile;
 const s=replay(file);expect(s.players[1]).toMatchObject({hp:4,ap:3,shield:1});expect(s.players[1].hand.length).toBe(4);expect(s.active).toBe(2);expect(s.discard).toEqual(['basic-045#01','basic-046#01']);validateState(s);
});
