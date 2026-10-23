import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createStage3Draft,createDraft,dispatchDraft,validateDraft} from '../../packages/game-core/src/draft';
import {createGame} from '../../packages/game-core/src/index';
import {characterTraitsForVersion,mapForVersion,runtimeForVersion} from '../../packages/game-data/src/index';
const db=await database(undefined,26);afterAll(()=>db.close());
const q=async(name:string,...args:unknown[])=> (await db.query<{v:any}>(`select ml_private.${name}(${args.map((_,i)=>'$'+(i+1)+'::jsonb').join(',')}) v`,args.map(a=>JSON.stringify(a)))).rows[0].v;
const rng=(seed:number)=>({seed,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false});
const playground=(id:string)=>characterTraitsForVersion('web-v0.1.15',id).spawnRegion==='操场';
it('full FFA/team drafts filter filled spawn regions and every completed combination starts identically in TS/SQL',async()=>{
 let fullPlaygroundSeen=false;
 for(const mode of ['ffa','team'] as const)for(let seed=1;seed<=8;seed++){
  let s=createStage3Draft(mode,rng(seed),1000,'web-v0.1.15');
  const setup={mode:s.mode,order:s.order,teams:s.teams,pools:s.pools,random:{...s.random},catalogVersion:s.catalogVersion};
  // createStage3Draft also draws its first offer; compare the saved state at
  // every dispatch, including the database's independently drawn next offer.
  expect(()=>validateDraft(s)).not.toThrow();
  for(let step=0;step<4;step++){
   if(s.selected.filter(id=>id&&playground(id)).length===2){fullPlaygroundSeen=true;expect(s.offer!.candidates.some(playground)).toBe(false);}
   const chosen=s.offer!.candidates.find(playground)??s.offer!.candidates[0];
   const cmd={id:`capacity-${seed}-${step}`,revision:s.revision,actor:s.offer!.actor,type:'pick' as const,offer:s.offer!.id,character:chosen};
   const ts=dispatchDraft(s,cmd,1001+step),sql=(await db.query<{v:any}>('select ml_private.dispatch_draft($1::jsonb,$2::jsonb,$3) v',[JSON.stringify(s),JSON.stringify(cmd),1001+step])).rows[0].v;
   expect(ts.ok,ts.error).toBe(true);expect(sql).toEqual(ts);s=ts.state;
  }
  const start={mode,ruleVersion:s.catalogVersion,characters:s.selected as string[],seats:[0,1,2,3],seed,first:0};
  const game=createGame(start as Parameters<typeof createGame>[0],2000),sql=(await db.query<{v:any}>('select ml_private.create_game($1::jsonb,2000) v',[JSON.stringify(start)])).rows[0].v;
  expect(sql).toEqual(game);expect(new Set(game.players.map(p=>p.cell)).size).toBe(4);expect(mapForVersion(s.catalogVersion).cells).toHaveLength(32);
  expect(setup.catalogVersion).toBe('web-v0.1.15');
 }
 expect(fullPlaygroundSeen).toBe(true);
},60000);
it('custom pools are checked before RNG: no accepted path can leave fewer than three candidates',async()=>{
 const pool=['character-004','character-046','character-053','character-029','character-020','character-025'];
 const setup={mode:'ffa' as const,order:[0,1,2,3],teams:['S1','S2','S3','S4'],pools:Object.fromEntries(['S1','S2','S3','S4'].map(t=>[t,pool])),random:rng(42),catalogVersion:'web-v0.1.15' as const};
 expect(()=>createDraft(setup,1000)).toThrow('出生容量过滤后角色池可能不足三个候选');
 await expect(db.query('select ml_private.create_draft($1::jsonb,1000)',[JSON.stringify(setup)])).rejects.toThrow('出生容量过滤后角色池可能不足三个候选');
 const all=[...runtimeForVersion(setup.catalogVersion).characterIds],valid={...setup,pools:Object.fromEntries(setup.teams.map(t=>[t,all]))};
 expect((await db.query<{v:any}>('select ml_private.create_draft($1::jsonb,1000) v',[JSON.stringify(valid)])).rows[0].v).toEqual(createDraft(valid,1000));
});
it('forged overcapacity drafts and direct overcapacity game setup are rejected by both authorities',async()=>{
 const s=createStage3Draft('ffa',rng(42),1000,'web-v0.1.15'),ids=['character-004','character-046','character-053'];
 s.cursor=3;for(let i=0;i<3;i++)s.selected[s.order[i]]=ids[i];for(const t of s.teams)s.pools[t]=s.pools[t].filter(id=>!ids.includes(id));
 expect(()=>validateDraft(s)).toThrow('已选角色超过出生地区容量');await expect(q('validate_draft',s)).rejects.toThrow('已选角色超过出生地区容量');
 const setup={mode:'ffa' as const,ruleVersion:'web-v0.1.15' as const,seed:42,seats:[0,1,2,3],characters:[...ids,'character-029']};
 expect(()=>createGame(setup as Parameters<typeof createGame>[0],1000)).toThrow();await expect(db.query('select ml_private.create_game($1::jsonb,1000)',[JSON.stringify(setup)])).rejects.toThrow();
});
it('installing026 leaves saved v14 draft creation and timeout RNG unchanged',async()=>{
 const old=await database(undefined,25);try{
 const s=createStage3Draft('ffa',rng(917),1000,'web-v0.1.14'),cmd={id:'old-capacity-timeout',revision:0,actor:s.offer!.actor,type:'tick' as const};
 const before=(await old.query<{v:any}>('select ml_private.dispatch_draft($1::jsonb,$2::jsonb,121000) v',[JSON.stringify(s),JSON.stringify(cmd)])).rows[0].v;
 await old.exec(await readFile('database/migrations/026_p3_batch_d.sql','utf8'));
 const after=(await old.query<{v:any}>('select ml_private.dispatch_draft($1::jsonb,$2::jsonb,121000) v',[JSON.stringify(s),JSON.stringify(cmd)])).rows[0].v;
 expect(after).toEqual(before);expect(after).toEqual(dispatchDraft(s,cmd,121000));expect(after.state.catalogVersion).toBe('web-v0.1.14');
 }finally{await old.close();}
});
