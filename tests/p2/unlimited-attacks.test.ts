import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {ALL_CARDS,CHARACTER_IDS,cardForVersion} from '../../packages/game-data/src/index';
import {createGame,dispatch,publicView} from '../../packages/game-core/src/index';
import type {Command,GameState} from '../../packages/game-core/src/types';
import {playBlockReason} from '../../apps/client/src/interaction-guards';
const db=await database();afterAll(()=>db.close());
function scene(version:GameState['version']='web-v0.1.3'){
 const s=createGame({mode:'ffa',seed:5,seats:[0,1,2,3],characters:[...CHARACTER_IDS],first:0,deck:[...ALL_CARDS],dice:[6],ruleVersion:version},1000);
 s.deck.push(...s.players.flatMap(p=>p.hand));for(const p of s.players)p.hand=[];
 const give=(actor:number,id:string)=>{const index=s.deck.findIndex(c=>c.startsWith(id+'#'));if(index<0)throw Error('Fixture exhausted '+id);const [card]=s.deck.splice(index,1);s.players[actor].hand.push(card);return card;};
 const cards=Array.from({length:5},()=>give(0,'basic-003'));give(0,'basic-039');give(1,'basic-039');give(1,'basic-039');s.players[0].ap=10;s.players[1].ap=50;
 return {s,cards,give};
}
async function apply(s:GameState,input:Record<string,unknown>,at=1100,ok=true){
 const cmd={id:'unlimited-'+s.revision,revision:s.revision,actor:0,...input} as Command;
 const ts=dispatch(s,cmd,at),sql=(await db.query<any>('select ml_private.dispatch($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),at])).rows[0].v;
 expect(sql.ok,sql.error).toBe(ts.ok);expect(ts.ok,ts.error).toBe(ok);expect(sql.state).toEqual(ts.state);return ts.state;
}
it('new rules allow the third, fourth and fifth attack, one AP payment and clock reset per card',async()=>{
 let {s,cards}=scene();
 for(let i=0;i<5;i++){
  const view={...publicView(s,0),actions:{targets:{[cards[i]]:[1,2,3]},steps:[]}};
  expect(playBlockReason(view,0,cards[i],[1],false,1100+i)).toBeNull();
  s=await apply(s,{type:'play',card:cards[i],targets:[1]},1100+i);
  expect(s.players[0].attacks).toBe(i+1);expect(s.players[0].ap).toBe(9-i);expect(s.players[1].ap).toBe(49-i);expect(s.clock).toEqual({remaining:60000,since:1100+i});
 }
 expect(s.discard.filter(c=>cards.includes(c))).toHaveLength(5);
});
it('saved v0.1.1 and v0.1.2 matches retain the original two-card cap after migration',async()=>{
 for(const version of ['web-v0.1.1','web-v0.1.2'] as const){let {s,cards}=scene(version);s=await apply(s,{type:'play',card:cards[0],targets:[1]});s=await apply(s,{type:'play',card:cards[1],targets:[1]});const next=await apply(s,{type:'play',card:cards[2],targets:[1]},1200,false);expect(next).toEqual(s);}
});
it('no attack cap does not bypass AP, target validation, defense, or group semantics',async()=>{
 const fixture=scene(),card=fixture.cards[0];let s=fixture.s;s.players[0].attacks=4;s.players[0].ap=0;
 await apply(s,{type:'play',card,targets:[1]},1100,false);s.players[0].ap=10;
 await apply(s,{type:'play',card,targets:[0]},1100,false);
 const defense=fixture.give(1,'basic-001');s=await apply(s,{type:'play',card,targets:[1]});expect(s.choice?.kind).toBe('response');
 s=await apply(s,{type:'choose',actor:1,choice:s.choice!.id,card:defense},1200);expect(s.players[1].ap).toBe(49);expect(s.players[0].attacks).toBe(5);expect(cardForVersion('basic-003','web-v0.1.3').group).toBe(true);
});
it('v0.1.3 inherits full-AP headbutt, deferred movement, and twenty-second discard',async()=>{
 const head=scene();const card=head.give(0,'basic-008');head.s.players[1].cell='r4c2';head.s.players[1].ap=9;
 const t=await apply(head.s,{type:'play',card,targets:[1]});expect(t.players[0].ap).toBe(18);expect(t.players[1].ap).toBe(0);expect(t.events.findLast(e=>e.type==='ap')?.text).toContain('吸收全部9AP');
 const move=scene();let m=await apply(move.s,{type:'move'});expect(m.players[0].ap).toBe(10);m=await apply(m,{type:'step',path:['r3c1']},1200);m=await apply(m,{type:'stop'},1300);expect(m.players[0].ap).toBe(9);
 const discard=await apply(scene().s,{type:'end'});expect(discard.choice?.kind).toBe('discard');expect(discard.choice!.deadline).toBe(21100);
});
