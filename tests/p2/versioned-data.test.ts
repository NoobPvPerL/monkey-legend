import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {database} from './database';
import {ACTIVE_RULE_VERSIONS,DATA_VERSIONS,CLASSIC_RULE_VERSION,ruleManifest,mapForVersion,environmentForVersion,sourceCatalogForVersion,runtimeForVersion,distanceForVersion,neighboringForVersion,spawnCandidatesForVersion,safeCellsForVersion,allocateFixedSpawns,cardForVersion,classicLocationPolicy,characterTraitsForVersion,isClassicVersion} from '../../packages/game-data/src/index';
import {CLASSIC_CELLS} from '../../packages/game-data/src/classic-map';
import {fixedSpawnLayout} from '../../packages/game-core/src/spawn';
import {createGame,dispatch} from '../../packages/game-core/src/index';
import type {Command,RandomState} from '../../packages/game-core/src/types';
const db=await database();afterAll(()=>db.close());
const query=async<T=any>(sql:string,values:unknown[]=[])=>((await db.query<{v:T}>(sql,values)).rows[0].v);
const classic=CLASSIC_RULE_VERSION;
it('all saved version profiles are identical between TS and SQL, with classic playable using the implemented four-character runtime',async()=>{
 for(const version of DATA_VERSIONS){
  const expected={manifest:ruleManifest(version),mapDefinition:mapForVersion(version),environment:environmentForVersion(version),sourceCatalog:sourceCatalogForVersion(version),runtimeData:ACTIVE_RULE_VERSIONS.some(v=>v===version)?runtimeForVersion(version):null,...(isClassicVersion(version)?{locationPolicy:classicLocationPolicy(),characterTraits:Object.fromEntries(Object.keys(sourceCatalogForVersion(version).characters).map(id=>[id,characterTraitsForVersion(version,id)]))}:{})};
  expect(await query('select ml_private.version_catalog($1) v',[version])).toEqual(expected);
 }
 expect(runtimeForVersion(classic).characterIds).toHaveLength(4);expect(runtimeForVersion(classic).allCards).toHaveLength(64);expect(environmentForVersion(classic).kind).toBe('classic-regions-v1');
 expect(()=>mapForVersion('unknown')).toThrow(/未知/);await expect(query("select ml_private.version_catalog('unknown') v")).rejects.toThrow(/未知/);
});
it('classic topology, terrain and exposure follow source data and never use legacy adjacency',async()=>{
 const map=mapForVersion(classic);expect(map.cells.map(({terrain,...c})=>c)).toEqual(CLASSIC_CELLS);
 expect(map.cells.filter(c=>c.terrain==='water').map(c=>c.id)).toEqual(['r3c3','r4c3','r4c6','r4c7']);
 expect(Object.values(map.regions).filter(r=>r.exposure==='indoor')).toHaveLength(8);expect(Object.values(map.regions).filter(r=>r.exposure==='outdoor')).toHaveLength(6);expect(map.regions['山洞'].exposure).toBe('exempt');
 expect(mapForVersion('web-v0.1.3').map.r4c1.region).toBe('操场');expect(map.map.r4c1.region).toBe('帝汶岛');
 expect(neighboringForVersion('web-v0.1.3','高唐农场','樱花大道')).toBe(true);expect(neighboringForVersion(classic,'高唐农场','樱花大道')).toBe(false);
 const regions=Object.keys(map.regions),pairs=regions.flatMap(a=>regions.map(b=>[a,b]));
 const sql=await query<boolean[]>('select jsonb_agg(ml_private.neighbor_for_version($1,p->>0,p->>1)) v from jsonb_array_elements($2::jsonb) p',[classic,JSON.stringify(pairs)]);
 expect(sql).toEqual(pairs.map(([a,b])=>{
  const expected=map.cells.some(x=>x.region===a&&map.cells.some(y=>y.region===b&&a!==b&&Math.abs(x.row-y.row)+Math.abs(x.col-y.col)===1));
  expect(neighboringForVersion(classic,a,b)).toBe(expected);return expected;
 }));
 expect(await query('select ml_private.distance_for_version($1,$2,$3) v',[classic,'r1c1','r4c8'])).toBe(distanceForVersion(classic,'r1c1','r4c8'));
 expect(()=>distanceForVersion(classic,'r0c1','r1c1')).toThrow();await expect(query('select ml_private.distance_for_version($1,$2,$3) v',[classic,'r0c1','r1c1'])).rejects.toThrow();
});
it('76 cards and 16 characters retain printed fields and unresolved values, with stable source hashes',async()=>{
 const catalog=sourceCatalogForVersion(classic);expect(Object.keys(catalog.cards)).toHaveLength(76);expect(Object.keys(catalog.characters)).toHaveLength(16);
 expect(Object.values(catalog.cards).every(c=>c.copies===null)).toBe(true);expect(Object.values(catalog.characters).every(c=>c.printedFaction===null)).toBe(true);
 expect(catalog.cards['basic-025'].printedCost).toBe('X');expect(catalog.cards['basic-028'].printedCost).toBe('-1/0/1');expect(catalog.cards['basic-037'].printedCost).toBe('1-6');
 expect(catalog.characters['character-004']).toMatchObject({spawnRegion:'操场',waterNative:true});expect(catalog.characters['character-005'].spawnRegion).toBe('秀松苑');
 for(const [path,hash] of Object.entries(catalog.sources))expect(createHash('sha256').update((await readFile(path,'utf8')).replaceAll('\r\n','\n')).digest('hex')).toBe(hash);
 expect(Object.keys(sourceCatalogForVersion('web-v0.1.3').cards)).toHaveLength(12);expect(runtimeForVersion('web-v0.1.3').allCards).toHaveLength(64);
 expect(cardForVersion('basic-008','web-v0.1.3').text).toContain('全部');expect(cardForVersion('basic-008','web-v0.1.1').text).toContain('最多2');
 expect(()=>{runtimeForVersion('web-v0.1.1').cards['basic-008'].cost=99;}).toThrow();
 expect(()=>{mapForVersion(classic).map.r1c1.region='篡改';}).toThrow();
});
it('fixed regions allocate four random distinct empty cells; all 1820 four-character combinations are legal',async()=>{
 const ids=Object.keys(sourceCatalogForVersion(classic).characters);let checked=0;
 for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++)for(let c=b+1;c<ids.length;c++)for(let e=c+1;e<ids.length;e++){
  const players=[ids[a],ids[b],ids[c],ids[e]],cells=allocateFixedSpawns(classic,players,bound=>bound-1);
  expect(new Set(cells).size).toBe(4);for(let i=0;i<4;i++)expect(spawnCandidatesForVersion(classic,players[i])).toContain(cells[i]);checked++;
 }
 expect(checked).toBe(1820);
 const players=['character-002','character-003','character-005','character-045'],layouts=new Set<string>();
 for(let seed=0;seed<24;seed++){
  const random:RandomState={seed,dice:[],bombs:[],reshuffles:[],sortedReshuffles:false},previous=structuredClone(random),ts=fixedSpawnLayout(classic,players,random);
  const sql=await query<any>('select ml_private.allocate_spawns($1,$2::jsonb,$3::jsonb) v',[classic,JSON.stringify(players),JSON.stringify({random})]);
  expect(sql).toEqual({random:ts.random,_spawns:ts.cells});expect(random).toEqual(previous);layouts.add(ts.cells.join());
 }
 expect(layouts.size).toBeGreaterThan(1);
 for(const players of [['character-002','character-002','character-003','character-005'],['unknown','character-002','character-003','character-005']]){
  expect(()=>allocateFixedSpawns(classic,players,()=>0)).toThrow();await expect(query('select ml_private.allocate_spawns($1,$2::jsonb,$3::jsonb) v',[classic,JSON.stringify(players),JSON.stringify({random:{seed:1}})])).rejects.toThrow();
 }
},30000);
it('gameplay reads saved-version snapshots even if the old global catalog is changed',async()=>{
 await db.exec('begin');try{
  await db.exec("update ml_private.catalog set value='null'::jsonb where key in ('cards','characters','characterIds','cells','map','allCards')");
  for(const ruleVersion of DATA_VERSIONS){
   const setup={mode:'ffa' as const,seed:42,seats:[0,1,2,3],first:0,ruleVersion,dice:[6]},s=createGame(setup,1000);
   expect(await query('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).toEqual(s);
   const cmd:Command={id:'move',actor:0,revision:0,type:'move'};
   expect(await query('select ml_private.dispatch($1::jsonb,$2::jsonb,1100) v',[JSON.stringify(s),JSON.stringify(cmd)])).toEqual(dispatch(s,cmd,1100));
  }
 }finally{await db.exec('rollback');}
});
