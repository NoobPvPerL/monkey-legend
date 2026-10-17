export const APPLICATION_VERSION='0.2.5-p2.6';
export const CURRENT_RULE_VERSION='web-v0.1.7';
export const REQUIRED_ENGINE_REVISION=18;
export interface DatabaseRequirement {ruleVersion:string;engineRevision:number;stage4:boolean}
export const STAGE3_DATABASE_REQUIREMENT:DatabaseRequirement={ruleVersion:'web-v0.1.6',engineRevision:16,stage4:false};
export const CURRENT_DATABASE_REQUIREMENT:DatabaseRequirement={ruleVersion:CURRENT_RULE_VERSION,engineRevision:REQUIRED_ENGINE_REVISION,stage4:true};
export function databaseReady(health:unknown,required:DatabaseRequirement=CURRENT_DATABASE_REQUIREMENT):boolean {
 if(!health||typeof health!=='object')return false;
 const value=health as Record<string,unknown>;
 return value.ok===true&&value.schemaVersion===2&&value.ruleVersion===required.ruleVersion&&Number.isInteger(value.engineRevision)&&Number(value.engineRevision)>=required.engineRevision&&value.feedbackRulesReady===true&&value.versionedDataReady===true&&value.locationDataReady===true&&value.locationRulesReady===true&&value.waterRulesReady===true&&value.environmentRulesReady===true&&value.classicPlayable===true&&value.classicPatchReady===true&&value.draftReady===true&&value.characterSkillsReady===true&&value.stage3Ready===true&&(!required.stage4||value.stage4Ready===true&&value.cardDefinitions===76&&value.cardInstances===191);
}
