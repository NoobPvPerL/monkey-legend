/** Engine capabilities, separate from the immutable 4A source/cost snapshot.
 * This list never enables a formal room version or substitutes for UI/acceptance.
 */
import {STAGE4_CARD_IDS,STAGE4_CARDS} from './stage4';
import type {Stage4CardId} from './stage4';
const active:readonly Stage4CardId[]=['basic-070','basic-069','basic-073','basic-049','basic-051','basic-052','basic-053','basic-055','basic-056','basic-058','basic-060','basic-061','basic-062','basic-068','basic-074','basic-075','basic-076','basic-024','basic-050','basic-057','basic-059','basic-064','basic-065','basic-007','basic-011','basic-012','basic-014','basic-018','basic-019','basic-022','basic-025','basic-029','basic-030','basic-035','basic-036','basic-040','basic-042','basic-043','basic-044','basic-048','basic-017','basic-013','basic-020','basic-021','basic-023','basic-026','basic-031','basic-032','basic-033','basic-034'];
const counters:readonly Stage4CardId[]=['basic-027','basic-028','basic-038'];
export const STAGE4_CAPABILITIES=Object.freeze(Object.fromEntries(STAGE4_CARD_IDS.map(id=>[id,
 STAGE4_CARDS[id].inherited?'inherited':active.includes(id)?'active':counters.includes(id)?'counter':'planned',
])) as Record<Stage4CardId,'inherited'|'active'|'counter'|'planned'>);
export const STAGE4_ENGINE_IMPLEMENTED=Object.freeze(STAGE4_CARD_IDS.filter(id=>STAGE4_CAPABILITIES[id]!=='planned'));
export const STAGE4_ENGINE_REMAINING=Object.freeze(STAGE4_CARD_IDS.filter(id=>STAGE4_CAPABILITIES[id]==='planned'));
