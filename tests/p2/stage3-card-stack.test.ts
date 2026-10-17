import {afterAll,expect,it} from 'vitest';
import {database} from './database';
import {initialStage3Resources,cardApCost} from '../../packages/game-core/src/stage3-resources';
import {STAGE3_CHARACTERS} from '../../packages/game-data/src/stage3';
import * as c from '../../packages/game-core/src/stage3-card-stack';
const db=await database();afterAll(()=>db.close());
const sql=async(name:string,s:c.CardStackState,args:unknown[]=[])=>((await db.query<{v:any}>(`select ml_private.${name}($1::jsonb${args.map((_,i)=>',$'+(i+2)).join('')}) v`,[JSON.stringify(s),...args])).rows[0].v);
function fixture():c.CardStackState{return {discard:[],resolving:[],cardStack:c.initialCardStack(),stage3:initialStage3Resources(),players:['character-045','character-002','character-026','character-044'].map((character,seat)=>({seat,character,team:'S'+seat,faction:STAGE3_CHARACTERS[character].faction,hp:STAGE3_CHARACTERS[character].hp,maxHp:STAGE3_CHARACTERS[character].hp,ap:5,shield:0,cell:'r1c'+(seat+1),hand:[],eliminated:null}))};}
async function begin(s:c.CardStackState,actor:number,card:string,targets:number[],at=1000,responseTo:number|null=null){s.resolving.push(card);const prior=structuredClone(s),effect=cardApCost(s,actor,card).effect;c.beginCard(s,actor,card,card.split('#')[0],targets,effect,at,responseTo);expect(await sql('stage3_begin_card',prior,[actor,card,card.split('#')[0],targets,effect,at,responseTo])).toEqual(s);}
async function counter(s:c.CardStackState,accept:boolean,at:number,die:number){const prior=structuredClone(s),result=c.counterCard(s,1,accept,at,()=>die);expect(await sql('stage3_counter_card',prior,[1,accept,at,die])).toEqual({...s,_counterResult:result});return result;}
async function close(s:c.CardStackState){const prior=structuredClone(s),closed=c.closePending(s);expect(await sql('stage3_close_card',prior)).toEqual({...s,_closed:closed});return closed;}
it('easy retries failed rolls within one fixed ten-second deadline; each attempt pays once and success cancels the whole multi-target card',async()=>{
 const s=fixture();await begin(s,0,'basic-010#01',[2,3]);const deadline=c.currentCard(s).counter!.deadline;expect(await counter(s,true,2000,1)).toMatchObject({cancelled:false,done:false});expect(await counter(s,true,3000,2)).toMatchObject({cancelled:false,done:false});expect(c.currentCard(s).counter!.deadline).toBe(deadline);expect(await counter(s,true,4000,3)).toMatchObject({cancelled:true,done:true});expect(s.players[1].ap).toBe(2);expect((await close(s)).countered).toBe(true);expect(s.discard).toEqual(['basic-010#01']);
});
it('an expired counter cannot roll or spend AP; at the exact deadline timeout closes the window without extending it',async()=>{
 const s=fixture();await begin(s,0,'basic-046#01',[0]);let rolls=0;expect(()=>c.counterCard(s,1,true,11001,()=>{rolls++;return 6;})).toThrow(/过期/);expect(rolls).toBe(0);const result=await counter(s,true,11000,6);expect(result).toMatchObject({attempted:false,done:true});expect(s.players[1].ap).toBe(5);expect((await close(s)).countered).toBe(false);
});
it('a failed attempt at the last AP automatically ends the window and the original card proceeds',async()=>{
 const s=fixture();s.players[1].ap=1;await begin(s,0,'basic-015#01',[0]);expect(await counter(s,true,2000,1)).toEqual({attempted:true,roll:1,cancelled:false,done:true});expect(s.players[1].ap).toBe(0);expect((await close(s)).countered).toBe(false);
});
it('countering a defense response restores the original attack, without reopening its already closed easy window',async()=>{
 const s=fixture();await begin(s,0,'basic-008#01',[3]);await counter(s,false,2000,1);const parent=c.currentCard(s).serial;await begin(s,3,'basic-001#01',[],2500,parent);await counter(s,true,3000,6);await close(s);expect(c.currentCard(s).serial).toBe(parent);expect(c.currentCard(s).counter).toBeNull();expect(c.currentCard(s).cancelled).toEqual([]);await close(s);expect(s.discard).toEqual(['basic-001#01','basic-008#01']);
});
it('an uncountered elbow response cancels only its own target and appends exactly one reverse-siphon actor',async()=>{
 const s=fixture();await begin(s,0,'basic-008#01',[2,3]);await counter(s,false,2000,1);const parent=c.currentCard(s).serial;await begin(s,3,'basic-002#01',[],2500,parent);await counter(s,false,3000,1);await close(s);expect(c.currentCard(s).cancelled).toEqual([3]);expect(c.currentCard(s).elbows).toEqual([3]);expect(s.resolving).toEqual(['basic-008#01']);
});
it('easy may counter its own equipment/food and cannot open another child until the current parent counter is closed',async()=>{
 const s=fixture();await begin(s,1,'basic-054#01',[1]);const parent=c.currentCard(s).serial;s.resolving.push('basic-001#01');expect(()=>c.beginCard(s,2,'basic-001#01','basic-001',[],cardApCost(s,2,'basic-001#01').effect,2000,parent)).toThrow(/父牌/);s.resolving.pop();await counter(s,true,3000,4);expect((await close(s)).countered).toBe(true);
});
