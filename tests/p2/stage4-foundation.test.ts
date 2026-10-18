import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {database} from './database';
import {STAGE4_CARDS,STAGE4_CARD_IDS,STAGE4_NEW_CARD_IDS,STAGE4_PROPOSED_COPIES,STAGE4_ALL_CARDS,STAGE4_FOUNDATION_POLICY,buildStage4Deck,parseStage4Cost,costForStage4Die} from '../../packages/game-data/src/stage4';
import {STAGE3_CARDS,STAGE3_ALL_CARDS} from '../../packages/game-data/src/stage3';
import {ACTIVE_RULE_VERSIONS,ruleManifest,runtimeForVersion} from '../../packages/game-data/src/index';
import {initialStage4Costs,quoteStage4Cost,nextStage4CostTurn,stage4FeePlan} from '../../packages/game-core/src/stage4-costs';
import type {Stage4Costs} from '../../packages/game-core/src/stage4-costs';
const db=await database(undefined,17);afterAll(()=>db.close());
async function scalar<T=any>(query:string,args:unknown[]=[]){return (await db.query<{v:T}>(query,args)).rows[0].v;}
const q=(ledger:Stage4Costs,actor:number,card:string,hand:string[],roll:number|null,x?:number)=>scalar('select ml_private.stage4_cost_quote($1::jsonb,$2,$3,$4::jsonb,$5,$6) v',[JSON.stringify(ledger),actor,card,JSON.stringify(hand),roll,x??null]);

it('covers all76 source IDs, exact subtype counts, expanded slots and unique191 identities without changing the original85',()=>{
 expect(STAGE4_CARD_IDS).toEqual(Array.from({length:76},(_,i)=>`basic-${String(i+1).padStart(3,'0')}`));
 expect(STAGE4_NEW_CARD_IDS).toHaveLength(53);expect(STAGE4_ALL_CARDS).toHaveLength(191);expect(new Set(STAGE4_ALL_CARDS).size).toBe(191);
 expect(STAGE3_ALL_CARDS.every(card=>STAGE4_ALL_CARDS.includes(card))).toBe(true);
 const counts:Record<string,number>={};for(const c of Object.values(STAGE4_CARDS))counts[c.subtype]=(counts[c.subtype]??0)+1;
 expect(counts).toEqual({'防御':2,'攻击':8,'锦囊':27,'食物':11,'武器（身）':3,'武器（手）':6,'武器（头）':2,'武器（腕）':3,'坐骑':14});
 expect(STAGE4_FOUNDATION_POLICY.slots).toEqual({body:1,hand:2,head:1,wrist:1,mount:1});
 for(const [id,c] of Object.entries(STAGE3_CARDS))expect(STAGE4_CARDS[id as keyof typeof STAGE4_CARDS]).toMatchObject({copies:c.copies,runtimeText:c.text,implemented:true,inherited:true});
 expect(STAGE4_NEW_CARD_IDS.every(id=>!STAGE4_CARDS[id].implemented&&STAGE4_CARDS[id].copies===2)).toBe(true);
 expect(STAGE4_ALL_CARDS.filter(c=>c.startsWith('basic-037#'))).toEqual(['basic-037#01']);
});
it('requires an explicit complete distribution, rejects unknown/invalid counts and preserves all old counts',()=>{
 expect(buildStage4Deck(STAGE4_PROPOSED_COPIES)).toEqual(STAGE4_ALL_CARDS);
 for(const bad of [{},{...STAGE4_PROPOSED_COPIES,'basic-999':2},{...STAGE4_PROPOSED_COPIES,'basic-001':1},{...STAGE4_PROPOSED_COPIES,'basic-007':0},{...STAGE4_PROPOSED_COPIES,'basic-007':1.5}])expect(()=>buildStage4Deck(bad)).toThrow();
});
it('keeps source text/provenance distinct from old web text, excludes the final document asset appendix and freezes runtime metadata',()=>{
 expect(STAGE4_CARDS['basic-009'].sourceText).toContain('单数');expect(STAGE4_CARDS['basic-009'].runtimeText).toContain('4—6');
 expect(STAGE4_CARDS['basic-076'].sourceText).not.toContain('不重复计入');
 for(const c of Object.values(STAGE4_CARDS)){expect(c.source).toBe(`docs/cards/基础牌.md#${c.id}`);expect(Object.isFrozen(c)).toBe(true);expect(c.sourceText).not.toBe('');}
});
it('decodes all printed costs; two tiers split3/3 and three tiers split2/2/2, preserving negative values',()=>{
 for(const c of Object.values(STAGE4_CARDS))expect(()=>parseStage4Cost(c.printedCost)).not.toThrow();
 const rolls=[1,2,3,4,5,6];
 expect(rolls.map(n=>costForStage4Die(parseStage4Cost('1/2'),n))).toEqual([1,1,1,2,2,2]);
 expect(rolls.map(n=>costForStage4Die(parseStage4Cost('-1/0/1'),n))).toEqual([-1,-1,0,0,1,1]);
 expect(rolls.map(n=>costForStage4Die(parseStage4Cost('1-6'),n))).toEqual(rolls);
 for(const text of ['', ' 1','1 ','1/1','2/1','0/1/2/3','1-5','1.5','x','01','9007199254740992'])expect(()=>parseStage4Cost(text)).toThrow();
 for(const n of [0,7,1.5,NaN])expect(()=>costForStage4Die(parseStage4Cost('1/2'),n)).toThrow();
});
it('keeps017 passive while018 separately registers the complete playable catalog and leaves legacy decks intact',async()=>{
 expect(ACTIVE_RULE_VERSIONS).toContain('web-v0.1.7');expect(ruleManifest('web-v0.1.7').status).toBe('playable');
 expect(runtimeForVersion('web-v0.1.6').allCards).toHaveLength(85);
 for(const v of ACTIVE_RULE_VERSIONS.filter(v=>v!=='web-v0.1.6'&&v!=='web-v0.1.7'&&v!=='web-v0.1.8'&&v!=='web-v0.1.9'))expect(runtimeForVersion(v).allCards).toHaveLength(64);
 const health=await scalar('select public.ml_health() v');expect(health).toMatchObject({ruleVersion:'web-v0.1.6',engineRevision:16,stage3Ready:true});
 expect(await scalar('select ml_private.stage4_content() v')).toEqual({cards:STAGE4_CARDS,allCards:STAGE4_ALL_CARDS,policy:STAGE4_FOUNDATION_POLICY});
});
it('quotes every definition at every possible die through TS and actual PostgreSQL with identical persisted locks',async()=>{
 for(const id of STAGE4_CARD_IDS)for(let die=1;die<=6;die++){
  const card=`${id}#01`,ledger=initialStage4Costs(),previous=structuredClone(ledger);let rolls=0;
  const x=STAGE4_CARDS[id].cost.kind==='variable'?2:undefined;
  const quote=quoteStage4Cost(ledger,0,card,[card],()=>{rolls++;return die;},x);
  expect(await q(previous,0,card,[card],die,x),id+'/'+die).toEqual({ledger,quote});
  expect(rolls).toBe(['die','tiers'].includes(STAGE4_CARDS[id].cost.kind)?1:0);
 }
});
it('preserves a random quote across cancel, insufficient AP, retries and a same-turn transfer to another owner',async()=>{
 const ledger=initialStage4Costs(),card='basic-029#01';let rolls=0;
 expect(quoteStage4Cost(ledger,0,card,[card],()=>{rolls++;return 6;})).toEqual({cost:6,die:6,cached:false});
 const locked=structuredClone(ledger);expect(()=>stage4FeePlan(1,6)).toThrow('AP不足');expect(ledger).toEqual(locked);
 const again=quoteStage4Cost(ledger,2,card,[card],()=>{rolls++;return 1;});expect(again).toEqual({cost:6,die:6,cached:true});expect(rolls).toBe(1);
 expect(await q(locked,2,card,[card],null)).toEqual({ledger,quote:again});
 expect(await scalar('select ml_private.stage4_cost_needs_roll($1::jsonb,$2) v',[JSON.stringify(ledger),card])).toBe(false);
 nextStage4CostTurn(ledger,1);expect(await scalar('select ml_private.stage4_cost_turn($1::jsonb,1) v',[JSON.stringify(locked)])).toEqual(ledger);
 expect(quoteStage4Cost(ledger,2,card,[card],()=>{rolls++;return 1;}).cost).toBe(4);expect(rolls).toBe(2);
});
it('keeps quotes distinct per physical copy and refuses an unowned entity before drawing randomness',async()=>{
 const ledger=initialStage4Costs();let rolls=0;
 for(const [card,die] of [['basic-029#01',1],['basic-029#02',6]] as const)quoteStage4Cost(ledger,0,card,[card],()=>{rolls++;return die;});
 expect(ledger.locks['basic-029#01'].cost).toBe(4);expect(ledger.locks['basic-029#02'].cost).toBe(6);
 const prior=structuredClone(ledger);
 expect(()=>quoteStage4Cost(ledger,0,'basic-030#01',[],()=>{rolls++;return 1;})).toThrow('手中没有');expect(rolls).toBe(2);expect(ledger).toEqual(prior);
 await expect(q(ledger,0,'basic-030#01',[],1)).rejects.toThrow('手中没有');
});
it('charges X as a resource, applies free only to positive fixed costs and returns gains for the normal siphon path',async()=>{
 for(const [ap,cost,free,variable,result] of [
  [0,-1,false,false,{cost:-1,spend:0,gain:1}],
  [0,-1,true,false,{cost:-1,spend:0,gain:1}],
  [0,3,true,false,{cost:0,spend:0,gain:0}],
  [5,5,true,true,{cost:5,spend:5,gain:0}],
  [0,0,false,false,{cost:0,spend:0,gain:0}],
 ] as const){expect(stage4FeePlan(ap,cost,free,variable)).toEqual(result);expect(await scalar('select ml_private.stage4_fee_plan($1,$2,$3,$4) v',[ap,cost,free,variable])).toEqual(result);}
 for(const [ap,cost,free,variable] of [[0,2,false,false],[1,2,true,true],[5,0,true,true]] as const){expect(()=>stage4FeePlan(ap,cost,free,variable)).toThrow();await expect(scalar('select ml_private.stage4_fee_plan($1,$2,$3,$4) v',[ap,cost,free,variable])).rejects.toThrow();}
});
it('rejects malformed actors, cards, stale turns and tampered cached prices without changing the ledger',async()=>{
 const card='basic-029#01',s=initialStage4Costs();
 for(const a of [-1,4]){const old=structuredClone(s);expect(()=>quoteStage4Cost(s,a,card,[card],()=>1)).toThrow();await expect(q(s,a,card,[card],1)).rejects.toThrow();expect(s).toEqual(old);}
 for(const c of ['basic-999#01','basic-029','basic-029#x']){expect(()=>quoteStage4Cost(s,0,c,[c],()=>1)).toThrow();await expect(q(s,0,c,[c],1)).rejects.toThrow();}
 for(const die of [0,7]){expect(()=>quoteStage4Cost(s,0,card,[card],()=>die)).toThrow();await expect(q(s,0,card,[card],die)).rejects.toThrow();}
 s.locks[card]={turn:0,die:6,cost:1};const previous=structuredClone(s);expect(()=>quoteStage4Cost(s,0,card,[card],()=>1)).toThrow('锁定费用');await expect(q(s,0,card,[card],1)).rejects.toThrow('锁定费用');expect(s).toEqual(previous);
 expect(()=>nextStage4CostTurn(s,0)).toThrow();await expect(scalar('select ml_private.stage4_cost_turn($1::jsonb,0) v',[JSON.stringify(s)])).rejects.toThrow();
});
it('requires valid X only for variable costs and never consumes a die for it',async()=>{
 const s=initialStage4Costs(),card='basic-025#01';let rolls=0;
 for(const x of [undefined,0,-1]){expect(()=>quoteStage4Cost(s,0,card,[card],()=>{rolls++;return 1;},x)).toThrow();await expect(q(s,0,card,[card],1,x)).rejects.toThrow();}
 expect(quoteStage4Cost(s,0,card,[card],()=>{rolls++;return 1;},3)).toEqual({cost:3,die:null,cached:false});expect(rolls).toBe(0);
 expect(()=>quoteStage4Cost(s,0,'basic-029#01',['basic-029#01'],()=>{rolls++;return 1;},1)).toThrow('不接受X');expect(rolls).toBe(0);
 await expect(q(s,0,'basic-029#01',['basic-029#01'],1,1)).rejects.toThrow('不接受X');
});
it('017 is repeatable and keeps rulesets, health and existing rooms byte-for-byte unchanged',async()=>{
 const migration=await readFile('database/migrations/017_stage4_foundation.sql','utf8');
 const snapshot=()=>scalar("select jsonb_build_object('health',public.ml_health(),'profiles',(select jsonb_object_agg(key,value) from ml_private.catalog where key like 'ruleset:%'),'rooms',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from ml_private.rooms r)) v");
 const old=await snapshot();await db.exec(migration);await db.exec(migration);expect(await snapshot()).toEqual(old);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await expect(db.query('select ml_private.stage4_content()')).rejects.toThrow(/permission denied/);await db.exec('reset role');}
});
it('a failed outer017 transaction leaves no partial development data or cost functions',async()=>{
 const probe=new PGlite();await probe.waitReady;
 try{
  await probe.exec('create schema ml_private;create table ml_private.catalog(key text primary key,value jsonb);create function public.ml_health() returns jsonb language sql as $$select jsonb_build_object(\'engineRevision\',16)$$;create role anon;create role authenticated;');
  const migration=await readFile('database/migrations/017_stage4_foundation.sql','utf8');
  await expect(probe.query(`DO $outer$ BEGIN EXECUTE $payload$${migration}\nselect 1/0;$payload$;END $outer$;`)).rejects.toThrow(/division by zero/);
  expect((await probe.query<{n:number}>('select count(*)::int n from ml_private.catalog')).rows[0].n).toBe(0);
  expect((await probe.query<{n:number}>("select count(*)::int n from pg_proc p join pg_namespace n on p.pronamespace=n.oid where n.nspname='ml_private'")).rows[0].n).toBe(0);
 }finally{await probe.close();}
});
