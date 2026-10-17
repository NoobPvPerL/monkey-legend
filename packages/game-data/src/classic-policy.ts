// Owner approvals in this chat, 2026-10-17. These are web-rule decisions, not edits to printed sources.
export const CLASSIC_LOCATIONS={
 farm:{normalDrawBonus:1,initialDrawBonus:0},
 playground:{moveCost:0},
 campus:{firstRoundApBonus:0,apBonus:1,afterRunnerRefill:true},
 xdf:{foodHealBonus:1,characterRestrictionFirst:true},
 ship:{minimumAp:1,cost:0,usesPerTurn:1,emptyDestination:true,usesBasicMove:false},
 commute:{minimumAp:1,spendAllAp:true,emptyDestination:true,usesBasicMove:false},
 cave:{stopWalking:true,occupiedPassage:false},
 prohibitedCards:{'教学楼':['basic-009','basic-010'],'秀松苑':['basic-009','basic-010']},
 officeImmuneTag:'建民',
} as const;
export const CLASSIC_LEMON={faction:'帝汶家族',familyRole:'随从',waterNative:true,spawnRegion:'操场',revivalRegion:'操场'} as const;
