import source from './source-catalog.json';
import {STAGE3_CARDS, STAGE3_ALL_CARDS} from './stage3';
import type {CardDefinition} from './legacy';

/** Stage four is a development catalog, never a playable-version registration. */
export const STAGE4_CATALOG_ID = 'stage4:foundation-v1';
export const STAGE4_RULE_VERSION = 'web-v0.1.7' as const;
export type Stage4CardId = keyof typeof source.cards;
export type CostSpec =
 | {kind:'fixed'; value:number}
 | {kind:'tiers'; values:number[]}
 | {kind:'die'; min:1; max:6}
 | {kind:'variable'};
export type Stage4Slot = 'body'|'hand'|'head'|'wrist'|'mount';
export type Stage4Work = '4B'|'4C'|'4D'|'4E';
export interface Stage4Card {
 id:Stage4CardId; name:string; source:string; sourceText:string; sourceNotes:string;
 printedCost:string; cost:CostSpec; subtype:string; tags:string[]; printedRange:string;
 type:'attack'|'response'|'tactic'|'food'|'equipment'; slot?:Stage4Slot;
 copies:number|null; proposedCopies:number; inherited:boolean; implemented:boolean;
 runtimeText:string|null; milestone:Stage4Work; decisions:string[];
}
export function parseStage4Cost(text:string):CostSpec {
 if(text==='X')return {kind:'variable'};
 if(text==='1-6')return {kind:'die',min:1,max:6};
 const integer=/^-?(0|[1-9]\d*)$/;
 if(integer.test(text)){
  const value=Number(text);if(!Number.isSafeInteger(value))throw Error('费用超出安全整数范围');
  return {kind:'fixed',value};
 }
 const parts=text.split('/');
 if((parts.length===2||parts.length===3)&&parts.every(p=>integer.test(p))){
  const values=parts.map(Number);
  if(values.every(Number.isSafeInteger)&&values.every((n,i)=>i===0||n>values[i-1]))return {kind:'tiers',values};
 }
 throw Error('费用格式未获解释：'+text);
}
export function costForStage4Die(spec:CostSpec,die:number):number {
 if(!Number.isInteger(die)||die<1||die>6)throw Error('费用骰子必须为1—6');
 if(spec.kind==='die')return die;
 if(spec.kind==='tiers')return spec.values[Math.floor((die-1)*spec.values.length/6)];
 throw Error('这张牌不使用费用骰子');
}

// These are review requirements, not invented effects. Approval is tracked in docs.
const dependencies:Partial<Record<Stage4CardId,string[]>>={
 'basic-007':['rock-characters','damage-order'],
 'basic-011':['forced-delivery'],'basic-012':['forced-delivery'],'basic-014':['forced-delivery'],
 'basic-013':['forced-path'],'basic-017':['interrupt-round'],
 'basic-018':['resource-suppression'],'basic-019':['insufficient-ap'],
 'basic-020':['single-target-protection'],'basic-021':['hidden-guess'],
 'basic-022':['play-suppression'],'basic-023':['region-block'],
 'basic-024':['steal-lifecycle'],'basic-025':['variable-cost'],
 'basic-026':['lmm-priority'],'basic-027':['counter-stack'],'basic-028':['counter-stack','negative-cost'],
 'basic-029':['faction-change'],'basic-030':['faction-change'],
 'basic-031':['forced-path'],'basic-032':['terrain-overlay'],
 'basic-033':['terrain-overlay'],'basic-034':['off-map'],
 'basic-035':['faction-change'],'basic-036':['faction-change'],
 'basic-038':['counter-stack'],'basic-040':['family-membership'],
 'basic-042':['elbow-buff'],'basic-043':['guaranteed-hit'],
 'basic-044':['exercise-buff'],'basic-048':['damage-order'],
 'basic-049':['cloak-timing'],'basic-050':['uniform-trigger'],
 'basic-051':['reflect-lifecycle'],'basic-052':['chalk-trigger'],
 'basic-053':['damage-order'],'basic-055':['sugar-trigger'],
 'basic-056':['guaranteed-hit'],'basic-058':['range-bonus'],
 'basic-059':['damage-order'],'basic-060':['watch-return'],
 'basic-061':['plant-teleport'],'basic-062':['movement-suppression'],
 'basic-064':['van-trigger'],'basic-065':['ap-unlimited'],
 'basic-068':['reactive-step'],'basic-069':['terrain-immunity'],
 'basic-070':['bodyguard'],'basic-073':['mount-copy'],
 'basic-074':['flight'],'basic-075':['gift'],'basic-076':['landing-push'],
};
const equipmentSlots:Record<string,Stage4Slot>={'武器（身）':'body','武器（手）':'hand','武器（头）':'head','武器（腕）':'wrist','坐骑':'mount'};
function work(id:Stage4CardId,subtype:string):Stage4Work {
 if(equipmentSlots[subtype])return '4E';
 if(['basic-011','basic-012','basic-014','basic-027','basic-028','basic-038'].includes(id))return '4C';
 if(['basic-013','basic-017','basic-020','basic-021','basic-023','basic-026','basic-029','basic-030','basic-031','basic-032','basic-033','basic-034','basic-035','basic-036'].includes(id))return '4D';
 return '4B';
}
export const STAGE4_CARD_IDS=Object.freeze(Object.keys(source.cards) as Stage4CardId[]);
export const STAGE4_CARDS:Readonly<Record<Stage4CardId,Stage4Card>>=Object.freeze(Object.fromEntries(STAGE4_CARD_IDS.map(id=>{
 const printed=source.cards[id],old=STAGE3_CARDS[id],slot=equipmentSlots[printed.subtype];
 const card:Stage4Card={id,name:printed.name,source:printed.source,
  // The legacy metadata extractor includes the document's trailing asset appendix
  // in the last card. Preserve that metadata file; omit the appendix only here.
  sourceText:printed.text.split('\n## 不重复计入卡牌的素材')[0].trim(),sourceNotes:printed.notes.split('\n## 不重复计入卡牌的素材')[0].trim(),
  printedCost:printed.printedCost,cost:old?old.randomCost?{kind:'die',min:1,max:6}:{kind:'fixed',value:old.cost}:parseStage4Cost(printed.printedCost),
  subtype:printed.subtype,tags:[...printed.tags],printedRange:printed.range,
  type:slot?'equipment':printed.subtype==='防御'?'response':printed.subtype==='攻击'?'attack':printed.subtype==='食物'?'food':'tactic',
  ...(slot?{slot}:{}),copies:old?.copies??2,proposedCopies:old?.copies??2,
  inherited:Boolean(old),implemented:Boolean(old),runtimeText:old?.text??null,
  milestone:work(id,printed.subtype),decisions:old?[]:[...(dependencies[id]??[])],
 };
 Object.freeze(card.cost);if(card.cost.kind==='tiers')Object.freeze(card.cost.values);
 Object.freeze(card.tags);Object.freeze(card.decisions);return [id,Object.freeze(card)];
})) as Record<Stage4CardId,Stage4Card>);
export const STAGE4_NEW_CARD_IDS=Object.freeze(STAGE4_CARD_IDS.filter(id=>!STAGE4_CARDS[id].inherited));
export const STAGE4_PROPOSED_COPIES=Object.freeze(Object.fromEntries(STAGE4_CARD_IDS.map(id=>[id,STAGE4_CARDS[id].proposedCopies])) as Record<Stage4CardId,number>);
/** Requires a complete, explicit approved distribution; no fallback to a proposal. */
export function buildStage4Deck(copies:Readonly<Record<string,number>>):string[] {
 const keys=Object.keys(copies);
 if(keys.length!==STAGE4_CARD_IDS.length||keys.some(id=>!Object.hasOwn(STAGE4_CARDS,id)))throw Error('必须明确给出全部76种牌的份数');
 for(const id of STAGE4_CARD_IDS){
  if(!Number.isSafeInteger(copies[id])||copies[id]<1)throw Error('份数必须为正整数：'+id);
  const old=STAGE3_CARDS[id];if(old&&copies[id]!==old.copies)throw Error('本批保留已有85实体的份数：'+id);
 }
 return STAGE4_CARD_IDS.flatMap(id=>Array.from({length:copies[id]},(_,i)=>`${id}#${String(i+1).padStart(2,'0')}`));
}
export const STAGE4_FOUNDATION_POLICY=Object.freeze({
 playable:false,stage:'4A',cardDefinitions:76,inheritedDefinitions:23,newDefinitions:53,
 inheritedInstances:STAGE3_ALL_CARDS.length,proposedInstances:191,
 distributionApproved:true,specialCostPolicyApproved:true,
 slots:{body:1,hand:2,head:1,wrist:1,mount:1},
});
export const STAGE4_ALL_CARDS=Object.freeze(buildStage4Deck(STAGE4_PROPOSED_COPIES));
/** Development runtime: default room version remains unchanged until 4F. */
export const STAGE4_RUNTIME_CARDS:Readonly<Record<Stage4CardId,CardDefinition>>=Object.freeze(Object.fromEntries(STAGE4_CARD_IDS.map(id=>{
 const c=STAGE4_CARDS[id],old=STAGE3_CARDS[id];
 return [id,Object.freeze(old?structuredClone(old):{id,name:c.name,copies:c.copies!,type:c.type,
  cost:c.cost.kind==='fixed'?c.cost.value:0,
  ...(['tiers','die'].includes(c.cost.kind)?{randomCost:true as const}:{}),
  range:c.printedRange.includes('全地图')?'global':c.printedRange.includes('相邻')?'adjacent':c.printedRange.includes('相同')?'same':undefined,
  ...(c.slot?{slot:c.slot}:{}),group:['basic-011','basic-012','basic-014','basic-040','basic-013','basic-031','basic-026'].includes(id),text:c.sourceText.replace(/^- /gm,''),
 })];
})) as Record<Stage4CardId,CardDefinition>);
