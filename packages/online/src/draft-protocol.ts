import {z} from 'zod';
import type {DraftView} from '../../game-core/src/draft';
// Draft choices use a separate room operation, never an in-game intent.
// There is no client actor, RNG, pool or deadline field.
export const draftPickSchema=z.strictObject({type:z.literal('draft-pick'),offer:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),character:z.string().regex(/^character-\d{3}$/)});
export type DraftPickIntent=z.infer<typeof draftPickSchema>;
export interface DraftEnvelope {revision:number;serverTime:number;draft:DraftView}
