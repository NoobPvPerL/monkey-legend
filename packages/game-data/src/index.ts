// Compatibility exports serve only P1 fixtures and old tooling. Gameplay uses versions.ts.
export {RULE_VERSION,hasInteractionRules,unlimitedAttacks,CARDS,CARD_IDS,ALL_CARDS,definitionId,CHARACTERS,CHARACTER_IDS,CELLS,MAP,distance,neighboring,safeCells,poisonDamage,bombCandidates,validateData} from './legacy';
export type {CardId,CharacterId,CardDefinition,Cell} from './legacy';
export * from './versions';
export * from './stage4-progress';
