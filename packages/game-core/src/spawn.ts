import {allocateFixedSpawns} from '../../game-data/src/index';
import {integer} from './random';
import type {RandomState} from './types';
// Reference implementation. Online RNG and allocation are performed inside SQL.
export function fixedSpawnLayout(version:string,characters:readonly string[],previous:RandomState){
 const random=structuredClone(previous),cells=allocateFixedSpawns(version,characters,bound=>integer(random,bound));
 return {cells,random};
}
