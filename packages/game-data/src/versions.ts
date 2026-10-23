import {P3_H_CHARACTERS} from './p3-h-characters';
import p3HSource from './p3-h-source.json';
import {P3_G_CHARACTERS} from './p3-g-characters';
import p3GSource from './p3-g-source.json';
import {P3_F_CHARACTERS} from './p3-f-characters';
import p3FSource from './p3-f-source.json';
import {P3_E_CHARACTERS} from './p3-e-characters';
import p3ESource from './p3-e-source.json';
import {P3_D_CHARACTERS} from './p3-d-characters';
import p3DSource from './p3-d-source.json';
import * as legacy from './legacy';
import {STAGE4_RULE_VERSION,STAGE4_RUNTIME_CARDS,STAGE4_ALL_CARDS} from './stage4';
import {CLASSIC_CELLS,CLASSIC_MAP_ID} from './classic-map';
import source from './source-catalog.json';
import p3Source from './p3-character-source.json';
import p3CSource from './p3-c-source.json';
import {P3_C_CHARACTERS} from './p3-c-characters';
import {P3_CHARACTERS} from './p3-characters';
import {CLASSIC_LEMON,CLASSIC_LOCATIONS} from './classic-policy';
import type {CardId,CardDefinition,Cell} from './legacy';
import {STAGE3_RULE_VERSION,STAGE3_CARDS,STAGE3_CARD_IDS,STAGE3_ALL_CARDS,STAGE3_CHARACTERS,STAGE3_CHARACTER_IDS} from './stage3';

export const PLAYTEST_RULE_VERSION='web-v0.1.8' as const;
export const EXERCISE_RULE_VERSION='web-v0.1.9' as const;
export const CARD_FEEDBACK_RULE_VERSION='web-v0.1.10' as const;
export const YINGHAO_RULE_VERSION='web-v0.1.11' as const;
export const P3_CHARACTER_RULE_VERSION='web-v0.1.12' as const;
export const POTATO_RULE_VERSION='web-v0.1.13' as const;
export const P3_C_RULE_VERSION='web-v0.1.14' as const;
export const P3_D_RULE_VERSION='web-v0.1.15' as const;
export const P3_E_RULE_VERSION='web-v0.1.16' as const;
export const P3_F_RULE_VERSION='web-v0.1.17' as const;
export const P3_G_RULE_VERSION='web-v0.1.18' as const;
export const P3_H_RULE_VERSION='web-v0.1.19' as const;
export const hasP3HRules=(version:string|undefined)=>version===P3_H_RULE_VERSION;
export const hasP3GRules=(version:string|undefined)=>version===P3_G_RULE_VERSION||hasP3HRules(version);
export const hasP3FRules=(version:string|undefined)=>version===P3_F_RULE_VERSION||hasP3GRules(version);
export const hasP3ERules=(version:string|undefined)=>version===P3_E_RULE_VERSION||hasP3FRules(version);
export const hasP3DRules=(version:string|undefined)=>version===P3_D_RULE_VERSION||hasP3ERules(version);
export const hasP3CRules=(version:string|undefined)=>version===P3_C_RULE_VERSION||hasP3DRules(version);
export const hasPotatoRules=(version:string|undefined)=>version===POTATO_RULE_VERSION||hasP3CRules(version);
export const hasP3Characters=(version:string|undefined)=>version===P3_CHARACTER_RULE_VERSION||hasPotatoRules(version);
export const hasYinghaoRules=(version:string|undefined)=>version===YINGHAO_RULE_VERSION||hasP3Characters(version);
export const hasCardFeedbackRules=(version:string|undefined)=>version===CARD_FEEDBACK_RULE_VERSION||hasYinghaoRules(version);
export const hasExerciseRules=(version:string|undefined)=>version===EXERCISE_RULE_VERSION||hasCardFeedbackRules(version);
export const hasPlaytestRules=(version:string|undefined)=>version===PLAYTEST_RULE_VERSION||hasExerciseRules(version);
export const ACTIVE_RULE_VERSIONS=['web-v0.1.1','web-v0.1.2','web-v0.1.3','web-v0.1.4','web-v0.1.5',STAGE3_RULE_VERSION,STAGE4_RULE_VERSION,PLAYTEST_RULE_VERSION,EXERCISE_RULE_VERSION,CARD_FEEDBACK_RULE_VERSION,YINGHAO_RULE_VERSION,P3_CHARACTER_RULE_VERSION,POTATO_RULE_VERSION,P3_C_RULE_VERSION,P3_D_RULE_VERSION,P3_E_RULE_VERSION,P3_F_RULE_VERSION,P3_G_RULE_VERSION,P3_H_RULE_VERSION] as const;
export type RuleVersion=typeof P3_H_RULE_VERSION|typeof ACTIVE_RULE_VERSIONS[number]|typeof STAGE4_RULE_VERSION|typeof P3_G_RULE_VERSION;
export const CLASSIC_RULE_VERSION='web-v0.1.4' as const;
export const PATCH_RULE_VERSION='web-v0.1.5' as const;
export const isClassicVersion=(version:string)=>version===CLASSIC_RULE_VERSION||version===PATCH_RULE_VERSION||hasStage3(version);
export const hasClassicPatch=(version:string)=>version===PATCH_RULE_VERSION||hasStage3(version);
export const hasStage3=(version:string)=>version===STAGE3_RULE_VERSION||hasStage4(version);
export const hasStage4=(version:string)=>version===STAGE4_RULE_VERSION||hasPlaytestRules(version);
export const PROTECTED_REGIONS=['教学楼','操场','办公室'] as const;
export type DataVersion=RuleVersion|typeof CLASSIC_RULE_VERSION;
// Frozen catalog generation boundary for historical001–016.
export const DATA_VERSIONS=['web-v0.1.1','web-v0.1.2','web-v0.1.3',CLASSIC_RULE_VERSION,PATCH_RULE_VERSION,STAGE3_RULE_VERSION] as const;
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
 return frozen({version,status:'playable' as const,mapId:classic?CLASSIC_MAP_ID:LEGACY_MAP_ID,catalogId:hasStage4(version)?'stage4-content-v1':hasStage3(version)?'stage3-content-v1':classic?'classic-content-v1':version,environmentId:hasClassicPatch(version)?'classic-regions-v2':classic?'classic-regions-v1':'legacy-cells-v1',spawnPolicy:classic?'fixed-region-random-empty':'legacy-fixed-cell',spawnConflicts:[] as string[]});
}
const manifests=Object.fromEntries([...DATA_VERSIONS,STAGE4_RULE_VERSION,PLAYTEST_RULE_VERSION,EXERCISE_RULE_VERSION,CARD_FEEDBACK_RULE_VERSION,YINGHAO_RULE_VERSION,P3_CHARACTER_RULE_VERSION,POTATO_RULE_VERSION,P3_C_RULE_VERSION,P3_D_RULE_VERSION,P3_E_RULE_VERSION,P3_F_RULE_VERSION,P3_G_RULE_VERSION,P3_H_RULE_VERSION].map(v=>[v,makeManifest(v)])) as Record<DataVersion,ReturnType<typeof makeManifest>>;
export function ruleManifest(version:string){if(!Object.hasOwn(manifests,version))throw Error(`未知规则版本：${version}`);return manifests[version as DataVersion];}
export function mapForVersion(version:string):MapDefinition{return hasP3GRules(version)?classicMap:ruleManifest(version).mapId===CLASSIC_MAP_ID?classicMap:legacyMap;}
export function environmentForVersion(version:string){return hasClassicPatch(version)?frozen({...classicEnvironment,kind:'classic-regions-v2',poisonPool:'all-except-cave-and-protected',poisonRegionCount:11,protectedRegions:[...PROTECTED_REGIONS],protectedBombsAfterPoisonComplete:true,caveEveryPersonalEnds:3,caveApLoss:2,caveDamage:1}):ruleManifest(version).environmentId==='classic-regions-v1'?classicEnvironment:legacyEnvironment;}
const runtime=Object.fromEntries(ACTIVE_RULE_VERSIONS.filter(version=>!hasStage3(version)).map(version=>[version,frozen({
 cards:Object.fromEntries(legacy.CARD_IDS.map(id=>[id,{...structuredClone(legacy.legacyCardForVersion(id,version)),...(hasClassicPatch(version)&&id==='basic-001'?{text:'取消可响应攻击对自己的全部效果；不能响应躲避球'}:hasClassicPatch(version)&&id==='basic-009'?{text:'同/相邻区域；骰4—6伤1；不能用防御姿态抵挡'}:{})}])) as Record<CardId,CardDefinition>,
 characters:isClassicVersion(version)?{...structuredClone(legacy.CHARACTERS),'character-004':{...legacy.CHARACTERS['character-004'],faction:'帝汶家族',spawn:'r2c4'},...(hasClassicPatch(version)?{'character-031':{...legacy.CHARACTERS['character-031'],text:'整轮统一加点时不增加AP；自己个人回合开始不足6补至6AP，等于或高于6保持原值，再结算地点加成。每轮受伤存活可判定一次，骰4—6可付2AP回1，失败不扣AP。'}}:{})}:structuredClone(legacy.CHARACTERS),characterIds:[...legacy.CHARACTER_IDS],allCards:[...legacy.ALL_CARDS],cells:mapForVersion(version).cells,map:mapForVersion(version).map,
 cardTags:Object.fromEntries(legacy.CARD_IDS.map(id=>[id,[...source.cards[id].tags]])),
})])) as Record<RuleVersion,RuntimeData>;
export function runtimeForVersion(version:string):RuntimeData {
 if(hasP3HRules(version))return p3HRuntime;
 if(hasP3GRules(version))return p3GRuntime;
 ruleManifest(version);if(hasP3FRules(version))return p3FRuntime;if(hasP3ERules(version))return p3ERuntime;if(hasP3DRules(version))return p3DRuntime;if(hasP3CRules(version))return p3CRuntime;if(hasPotatoRules(version))return potatoRuntime;if(hasP3Characters(version))return p3Runtime;if(hasYinghaoRules(version))return yinghaoRuntime;if(hasCardFeedbackRules(version))return cardFeedbackRuntime;if(hasExerciseRules(version))return exerciseRuntime;if(hasPlaytestRules(version))return playtestRuntime;if(hasStage4(version))return stage4Runtime;if(hasStage3(version))return stage3Runtime;if(!isActiveRuleVersion(version))throw Error('经典图数据基础已完成，后续规则未启用');return runtime[version];
}
const stage3Runtime=frozen({cards:structuredClone(STAGE3_CARDS) as Record<CardId,CardDefinition>,characters:Object.fromEntries(STAGE3_CHARACTER_IDS.map(id=>{const c=STAGE3_CHARACTERS[id];return [id,{...c,id:id as legacy.CharacterId,spawn:classicMap.cells.find(cell=>cell.region===c.spawnRegion)!.id}];})) as unknown as RuntimeData['characters'],characterIds:[...STAGE3_CHARACTER_IDS] as RuntimeData['characterIds'],allCards:[...STAGE3_ALL_CARDS],cells:classicMap.cells,map:classicMap.map,cardTags:Object.fromEntries(STAGE3_CARD_IDS.map(id=>[id,[...source.cards[id as keyof typeof source.cards].tags]]))});
const stage4Runtime=frozen({...stage3Runtime,cards:structuredClone(STAGE4_RUNTIME_CARDS),allCards:[...STAGE4_ALL_CARDS],cardTags:Object.fromEntries(Object.keys(STAGE4_RUNTIME_CARDS).map(id=>[id,[...source.cards[id as keyof typeof source.cards].tags]]))});
const playtestRuntime=frozen({...stage4Runtime,cards:{...stage4Runtime.cards,
 'basic-012':{...stage4Runtime.cards['basic-012'],text:stage4Runtime.cards['basic-012'].text+'（使用者不参与）'},
 'basic-014':{...stage4Runtime.cards['basic-014'],text:stage4Runtime.cards['basic-014'].text+'（使用者不参与）'}},
 characters:{...stage4Runtime.characters,'character-006':{...stage4Runtime.characters['character-006'],text:'北鄙：同一张牌指定你时，不得同时指定其他当前非机械猴子角色；可同时指定机械猴子。真正的帝汶：帝汶词条牌正费用免费。'}}});
const exerciseRuntime=frozen({...playtestRuntime,cards:{...playtestRuntime.cards,...Object.fromEntries(['basic-003','basic-004','basic-005'].map((id,i)=>[id,{...playtestRuntime.cards[id as CardId],cost:i+3,text:playtestRuntime.cards[id as CardId].text+'；进入弃牌堆时，本局最初获得者存活则回复1AP；可免费响应更低等级搏击操，仅抵消对自己的扣AP及不足转扣血。'}]))}});
const cardFeedbackRuntime=frozen({...exerciseRuntime,characters:{...exerciseRuntime.characters,'character-003':{...exerciseRuntime.characters['character-003'],text:'懒得喷：每个人回合可主动发动一次，本回合固定正费用免费；从发动起至自己下次个人回合开始，其他人使用的攻击牌额外以你为目标。非攻击牌不因此作用于你，其他免疫及单体保护照常。'}}});
const yinghaoRuntime=frozen({...cardFeedbackRuntime,characters:{...cardFeedbackRuntime.characters,'character-045':{...cardFeedbackRuntime.characters['character-045'],text:cardFeedbackRuntime.characters['character-045'].text+' 猴子游戏对自己无效，不参与判定。'}}});
const p3Runtime:RuntimeData=frozen({...yinghaoRuntime,characters:{...yinghaoRuntime.characters,...P3_CHARACTERS},characterIds:[...yinghaoRuntime.characterIds,...Object.keys(P3_CHARACTERS)] as legacy.CharacterId[]});
const potatoRuntime:RuntimeData=frozen({...p3Runtime,characters:{...p3Runtime.characters,'character-037':{...p3Runtime.characters['character-037'],text:'每整轮实际失血且存活后可免费传送一次，30秒内选择全图合法空格，可进入水域；封闭地区、占格及装备限制照常，执行才耗次数。'}}});
const p3CRuntime:RuntimeData=frozen({...potatoRuntime,characters:{...potatoRuntime.characters,...P3_C_CHARACTERS},characterIds:[...potatoRuntime.characterIds,...Object.keys(P3_C_CHARACTERS)] as legacy.CharacterId[]});
const p3DRuntime:RuntimeData=frozen({...p3CRuntime,characters:{...p3CRuntime.characters,...P3_D_CHARACTERS},characterIds:[...p3CRuntime.characterIds,...Object.keys(P3_D_CHARACTERS)] as legacy.CharacterId[]});
function makeSourceCatalog(classic:boolean){
 return frozen({sourceHashFormat:source.sourceHashFormat,sources:{...source.sources},cards:Object.fromEntries(Object.entries(source.cards).filter(([id])=>classic||legacy.CARD_IDS.includes(id as CardId))),characters:Object.fromEntries(Object.entries(source.characters).filter(([id])=>classic||legacy.CHARACTER_IDS.includes(id as legacy.CharacterId)))});
}
const legacySource=makeSourceCatalog(false),classicSource=makeSourceCatalog(true);
const p3Catalog:typeof classicSource=frozen({...classicSource,characters:{...classicSource.characters,...p3Source.characters}});
const p3CCatalog:typeof classicSource=frozen({...p3Catalog,characters:{...p3Catalog.characters,...p3CSource.characters}});
const p3DCatalog:typeof classicSource=frozen({...p3CCatalog,characters:{...p3CCatalog.characters,...p3DSource.characters}});
export function sourceCatalogForVersion(version:string){return hasP3HRules(version)?p3HCatalog:hasP3GRules(version)?p3GCatalog:hasP3FRules(version)?p3FCatalog:hasP3ERules(version)?p3ECatalog:hasP3DRules(version)?p3DCatalog:hasP3CRules(version)?p3CCatalog:hasP3Characters(version)?p3Catalog:isClassicVersion(version)?classicSource:legacySource;}
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
 ruleManifest(version);if(!isClassicVersion(version))throw Error('旧版使用固定坐标出生');
 if(characters.length!==4||new Set(characters).size!==4)throw Error('必须有四个不同角色');
 const custom=(id:string)=>hasP3HRules(version)&&id==='character-035';
 const candidates=characters.map(id=>custom(id)?null:spawnCandidatesForVersion(version,id));
 for(const list of candidates)if(list&&(!list.length||candidates.filter(other=>other?.join()===list.join()).length>list.length))throw Error('出生地区空格不足');
 const used=new Set<string>();return candidates.map(list=>{if(list===null)return '';const empty=list.filter(id=>!used.has(id)),index=takeIndex(empty.length);if(!Number.isInteger(index)||index<0||index>=empty.length)throw Error('随机落格索引无效');const cell=empty[index];used.add(cell);return cell;});
}

export function cardForVersion(id:CardId,version:string):CardDefinition { return runtimeForVersion(version).cards[id]; }

export function characterTraitsForVersion(version:string,id:string){
 const entry=sourceCatalogForVersion(version).characters[id];if(!entry)throw Error('角色未在此版本目录');
 if(isClassicVersion(version)&&id==='character-004')return CLASSIC_LEMON;
 if(hasStage3(version))return {faction:runtimeForVersion(version).characters[id as legacy.CharacterId].faction,familyRole:null,waterNative:entry.waterNative,spawnRegion:entry.spawnRegion,revivalRegion:entry.spawnRegion};
 return {faction:entry.printedFaction,familyRole:null,waterNative:entry.waterNative,spawnRegion:entry.spawnRegion,revivalRegion:null};
}
export function classicLocationPolicy(version?:string){return hasCardFeedbackRules(version)?{...CLASSIC_LOCATIONS,prohibitedCards:{'教学楼':['basic-009'],'秀松苑':['basic-010']}}:CLASSIC_LOCATIONS;}

const p3ERuntime:RuntimeData=frozen({...p3DRuntime,characters:{...p3DRuntime.characters,...P3_E_CHARACTERS},characterIds:[...p3DRuntime.characterIds,...Object.keys(P3_E_CHARACTERS)] as legacy.CharacterId[]});
const p3ECatalog:typeof classicSource=frozen({...p3DCatalog,characters:{...p3DCatalog.characters,...p3ESource.characters}});

const p3FRuntime:RuntimeData=frozen({...p3ERuntime,characters:{...p3ERuntime.characters,...P3_F_CHARACTERS},characterIds:[...p3ERuntime.characterIds,...Object.keys(P3_F_CHARACTERS)] as legacy.CharacterId[]});
const p3FCatalog:typeof classicSource=frozen({...p3ECatalog,characters:{...p3ECatalog.characters,...p3FSource.characters}});
const p3GRuntime:RuntimeData=frozen({...p3FRuntime,characters:{...p3FRuntime.characters,...P3_G_CHARACTERS},characterIds:[...p3FRuntime.characterIds,...Object.keys(P3_G_CHARACTERS)] as legacy.CharacterId[]});
const p3GCatalog:typeof classicSource=frozen({...p3FCatalog,characters:{...p3FCatalog.characters,...p3GSource.characters}});

// Implemented H roles enter this private catalog; ordinary factories stay closed.
const p3HRuntime:RuntimeData=frozen({...p3GRuntime,characters:{...p3GRuntime.characters,...P3_H_CHARACTERS},characterIds:[...p3GRuntime.characterIds,...Object.keys(P3_H_CHARACTERS)] as legacy.CharacterId[]});
const p3HCatalog:typeof classicSource=frozen({...p3GCatalog,characters:{...p3GCatalog.characters,...Object.fromEntries(Object.entries(p3HSource.characters).filter(([id])=>Object.hasOwn(P3_H_CHARACTERS,id)))}});
