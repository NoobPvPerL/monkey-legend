import * as legacy from './legacy';
import {CLASSIC_CELLS,CLASSIC_MAP_ID} from './classic-map';
import source from './source-catalog.json';
import {CLASSIC_LEMON,CLASSIC_LOCATIONS} from './classic-policy';
import type {CardId,CardDefinition,Cell} from './legacy';
import {STAGE3_RULE_VERSION,STAGE3_CARDS,STAGE3_CARD_IDS,STAGE3_ALL_CARDS,STAGE3_CHARACTERS,STAGE3_CHARACTER_IDS} from './stage3';

export const ACTIVE_RULE_VERSIONS=['web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4','web-v0.1.5',STAGE3_RULE_VERSION] as const;
export type RuleVersion=typeof ACTIVE_RULE_VERSIONS[number]|typeof STAGE3_RULE_VERSION;
export const CLASSIC_RULE_VERSION='web-v0.1.4' as const;
export const PATCH_RULE_VERSION='web-v0.1.5' as const;
export const isClassicVersion=(version:string)=>version===CLASSIC_RULE_VERSION||version===PATCH_RULE_VERSION||version===STAGE3_RULE_VERSION;
export const hasClassicPatch=(version:string)=>version===PATCH_RULE_VERSION||version===STAGE3_RULE_VERSION;
export const hasStage3=(version:string)=>version===STAGE3_RULE_VERSION;
export const PROTECTED_REGIONS=['教学楼','操场','办公室'] as const;
export type DataVersion=RuleVersion|typeof CLASSIC_RULE_VERSION;
export const DATA_VERSIONS=[...ACTIVE_RULE_VERSIONS] as const;
export const LEGACY_MAP_ID='web-map-v1' as const;
function frozen<T>(value:T):T {
 if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;
}
export interface MapDefinition {id:string;cells:readonly Cell[];map:Readonly<Record<string,Cell>>;regions:Readonly<Record<string,{exposure:'indoor'|'outdoor'|'exempt'|'legacy'}>>}
const outdoor=new Set(['高唐农场','操场','帝汶岛','红素洋','淘安泽','樱花大道']);
const classicCells=CLASSIC_CELLS.map(c=>({...c,terrain:(c.region==='红素洋'||c.region==='淘安泽'?'water':'land') as Cell['terrain']}));
function mapDefinition(id:string,cells:readonly Cell[],classic:boolean):MapDefinition {
 return frozen({id,cells:structuredClone(cells),map:Object.fromEntries(cells.map(c=>[c.id,{...c}])),regions:Object.fromEntries([...new Set(cells.map(c=>c.region))].map(region=>[region,{exposure:classic?(region==='山洞'?'exempt':outdoor.has(region)?'outdoor':'indoor'):'legacy'}]))});
}
const legacyMap=mapDefinition(LEGACY_MAP_ID,legacy.CELLS,false),classicMap=mapDefinition(CLASSIC_MAP_ID,classicCells,true);
const legacyEnvironment=frozen({kind:'legacy-cells-v1',roundLimit:12,settlement:'round-start',shieldBlocks:false});
const classicEnvironment=frozen({kind:'classic-regions-v1',roundLimit:null,settlement:'round-end',shieldBlocks:true,poisonPerRound:2,bombsPerRound:2,poisonStarts:1,bombsStart:1,farmCloses:5,waterDiscardMs:10000});
export interface RuntimeData {cards:Record<CardId,CardDefinition>;characters:typeof legacy.CHARACTERS;characterIds:typeof legacy.CHARACTER_IDS;allCards:string[];cells:readonly Cell[];map:MapDefinition['map'];cardTags:Record<string,string[]>}
export function isActiveRuleVersion(version:unknown):version is RuleVersion{return ACTIVE_RULE_VERSIONS.some(v=>v===version);}
function makeManifest(version:DataVersion){
 const classic=isClassicVersion(version);
 return frozen({version,status:'playable',mapId:classic?CLASSIC_MAP_ID:LEGACY_MAP_ID,catalogId:hasStage3(version)?'stage3-content-v1':classic?'classic-content-v1':version,environmentId:hasClassicPatch(version)?'classic-regions-v2':classic?'classic-regions-v1':'legacy-cells-v1',spawnPolicy:classic?'fixed-region-random-empty':'legacy-fixed-cell',spawnConflicts:[] as string[]});
}
const manifests=Object.fromEntries([...DATA_VERSIONS,STAGE3_RULE_VERSION].map(v=>[v,makeManifest(v)])) as Record<DataVersion,ReturnType<typeof makeManifest>>;
export function ruleManifest(version:string){if(!Object.hasOwn(manifests,version))throw Error(`未知规则版本：${version}`);return manifests[version as DataVersion];}
export function mapForVersion(version:string):MapDefinition{return ruleManifest(version).mapId===CLASSIC_MAP_ID?classicMap:legacyMap;}
export function environmentForVersion(version:string){return hasClassicPatch(version)?frozen({...classicEnvironment,kind:'classic-regions-v2',poisonPool:'all-except-cave-and-protected',poisonRegionCount:11,protectedRegions:[...PROTECTED_REGIONS],protectedBombsAfterPoisonComplete:true,caveEveryPersonalEnds:3,caveApLoss:2,caveDamage:1}):ruleManifest(version).environmentId==='classic-regions-v1'?classicEnvironment:legacyEnvironment;}
const runtime=Object.fromEntries(ACTIVE_RULE_VERSIONS.filter(version=>!hasStage3(version)).map(version=>[version,frozen({
 cards:Object.fromEntries(legacy.CARD_IDS.map(id=>[id,{...structuredClone(legacy.legacyCardForVersion(id,version)),...(hasClassicPatch(version)&&id==='basic-001'?{text:'取消可响应攻击对自己的全部效果；不能响应躲避球'}:hasClassicPatch(version)&&id==='basic-009'?{text:'同/相邻区域；骰4—6伤1；不能用防御姿态抵挡'}:{})}])) as Record<CardId,CardDefinition>,
 characters:isClassicVersion(version)?{...structuredClone(legacy.CHARACTERS),'character-004':{...legacy.CHARACTERS['character-004'],faction:'帝汶家族',spawn:'r2c4'},...(hasClassicPatch(version)?{'character-031':{...legacy.CHARACTERS['character-031'],text:'整轮统一加点时不增加AP；自己个人回合开始不足6补至6AP，等于或高于6保持原值，再结算地点加成。每轮受伤存活可判定一次，骰4—6可付2AP回1，失败不扣AP。'}}:{})}:structuredClone(legacy.CHARACTERS),characterIds:[...legacy.CHARACTER_IDS],allCards:[...legacy.ALL_CARDS],cells:mapForVersion(version).cells,map:mapForVersion(version).map,
 cardTags:Object.fromEntries(legacy.CARD_IDS.map(id=>[id,[...source.cards[id].tags]])),
})])) as Record<RuleVersion,RuntimeData>;
export function runtimeForVersion(version:string):RuntimeData {
 ruleManifest(version);if(hasStage3(version))return stage3Runtime;if(!isActiveRuleVersion(version))throw Error('经典图数据基础已完成，后续规则未启用');return runtime[version];
}
const stage3Runtime=frozen({cards:structuredClone(STAGE3_CARDS) as Record<CardId,CardDefinition>,characters:Object.fromEntries(STAGE3_CHARACTER_IDS.map(id=>{const c=STAGE3_CHARACTERS[id];return [id,{...c,id:id as legacy.CharacterId,spawn:classicMap.cells.find(cell=>cell.region===c.spawnRegion)!.id}];})) as unknown as RuntimeData['characters'],characterIds:[...STAGE3_CHARACTER_IDS] as RuntimeData['characterIds'],allCards:[...STAGE3_ALL_CARDS],cells:classicMap.cells,map:classicMap.map,cardTags:Object.fromEntries(STAGE3_CARD_IDS.map(id=>[id,[...source.cards[id as keyof typeof source.cards].tags]]))});
function makeSourceCatalog(classic:boolean){
 return frozen({sourceHashFormat:source.sourceHashFormat,sources:{...source.sources},cards:Object.fromEntries(Object.entries(source.cards).filter(([id])=>classic||legacy.CARD_IDS.includes(id as CardId))),characters:Object.fromEntries(Object.entries(source.characters).filter(([id])=>classic||legacy.CHARACTER_IDS.includes(id as legacy.CharacterId)))});
}
const legacySource=makeSourceCatalog(false),classicSource=makeSourceCatalog(true);
export function sourceCatalogForVersion(version:string){return isClassicVersion(version)?classicSource:legacySource;}
export function distanceForVersion(version:string,a:string,b:string):number {
 const map=mapForVersion(version).map,x=map[a],y=map[b];if(!x||!y)throw Error('位置无效');return Math.abs(x.row-y.row)+Math.abs(x.col-y.col);
}
export function neighboringForVersion(version:string,a:string,b:string):boolean {
 const cells=mapForVersion(version).cells;return a!==b&&cells.some(x=>x.region===a&&cells.some(y=>y.region===b&&distanceForVersion(version,x.id,y.id)===1));
}
export function safeCellsForVersion(version:string,round:number):string[]{
 runtimeForVersion(version);if(isClassicVersion(version))return mapForVersion(version).cells.map(c=>c.id);return mapForVersion(version).cells.filter(c=>round<=3||(round<=5?c.col>=2&&c.col<=7:round<=7?c.col>=3&&c.col<=6:round<=9?c.row>=2&&c.row<=3&&c.col>=3&&c.col<=6:c.row>=2&&c.row<=3&&c.col>=3&&c.col<=5)).map(c=>c.id);
}
export function bombCandidatesForVersion(version:string,round:number):string[]{
 if(isClassicVersion(version))return Object.entries(classicMap.regions).filter(([,v])=>v.exposure==='outdoor').map(([k])=>k);const map=mapForVersion(version).map;return [...new Set(safeCellsForVersion(version,round).map(id=>map[id].region))];
}
export function poisonDamageForVersion(version:string,round:number):number {runtimeForVersion(version);if(isClassicVersion(version))return 1;return round<=3?0:round<=7?1:2;}
export function spawnCandidatesForVersion(version:string,character:string):string[]{
 const catalog=sourceCatalogForVersion(version),entry=catalog.characters[character];if(!entry)throw Error('角色未在此版本目录');
 return mapForVersion(version).cells.filter(c=>c.region===entry.spawnRegion).map(c=>c.id);
}
// takeIndex is provided by the authoritative transaction RNG, never the client.
export function allocateFixedSpawns(version:string,characters:readonly string[],takeIndex:(bound:number)=>number):string[]{
 const manifest=ruleManifest(version);if(!isClassicVersion(version))throw Error('旧版使用固定坐标出生');
 if(characters.length!==4||new Set(characters).size!==4)throw Error('必须有四个不同角色');
 const candidates=characters.map(id=>spawnCandidatesForVersion(version,id));
 for(const list of candidates)if(!list.length||candidates.filter(other=>other.join()===list.join()).length>list.length)throw Error('出生地区空格不足');
 const used=new Set<string>();return candidates.map(list=>{const empty=list.filter(id=>!used.has(id)),index=takeIndex(empty.length);if(!Number.isInteger(index)||index<0||index>=empty.length)throw Error('随机落格索引无效');const cell=empty[index];used.add(cell);return cell;});
}

export function cardForVersion(id:CardId,version:string):CardDefinition { return runtimeForVersion(version).cards[id]; }

export function characterTraitsForVersion(version:string,id:string){
 const entry=sourceCatalogForVersion(version).characters[id];if(!entry)throw Error('角色未在此版本目录');
 if(isClassicVersion(version)&&id==='character-004')return CLASSIC_LEMON;
 if(hasStage3(version))return {faction:STAGE3_CHARACTERS[id].faction,familyRole:null,waterNative:entry.waterNative,spawnRegion:entry.spawnRegion,revivalRegion:entry.spawnRegion};
 return {faction:entry.printedFaction,familyRole:null,waterNative:entry.waterNative,spawnRegion:entry.spawnRegion,revivalRegion:null};
}
export function classicLocationPolicy(){return CLASSIC_LOCATIONS;}
