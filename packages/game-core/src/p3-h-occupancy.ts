import {hasP3HRules} from '../../game-data/src/index';
type Space={version?:string;players:{character:string}[]};
/** N-12: a persistent spatial property; only the optional crossing skill is active. */
export const hSmall=(s:Space,a:number)=>hasP3HRules(s.version)&&s.players[a]?.character==='character-041';
export const hBlocks=(s:Space,mover:number,other:number)=>!hSmall(s,mover)&&!hSmall(s,other);
