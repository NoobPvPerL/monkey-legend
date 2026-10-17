export const APPLICATION_VERSION='0.2.4-p2.5';
export const CURRENT_RULE_VERSION='web-v0.1.6';
export const REQUIRED_ENGINE_REVISION=16;
export function databaseReady(health:unknown):boolean {
 if(!health||typeof health!=='object')return false;
 const value=health as Record<string,unknown>;
 return value.ok===true&&value.schemaVersion===2&&value.ruleVersion===CURRENT_RULE_VERSION&&Number.isInteger(value.engineRevision)&&Number(value.engineRevision)>=REQUIRED_ENGINE_REVISION&&value.feedbackRulesReady===true&&value.versionedDataReady===true&&value.locationDataReady===true&&value.locationRulesReady===true&&value.waterRulesReady===true&&value.environmentRulesReady===true&&value.classicPlayable===true&&value.classicPatchReady===true&&value.draftReady===true&&value.characterSkillsReady===true&&value.stage3Ready===true;
}
