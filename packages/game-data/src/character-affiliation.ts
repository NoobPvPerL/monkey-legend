import source from './source-catalog.json';
export type CharacterFamily='机械猴子'|'帝汶家族'|'中立';
// Owner's explicit Q1 ruling, separate from the unmodified printed transcript.
export function familyForName(name:string):CharacterFamily {
 if(name==='应豪'||/^猴[零〇一二三四五六七八九十百千万0-9]+$/.test(name))return '机械猴子';
 if(name==='lemon'||/^.+帝汶$/.test(name))return '帝汶家族';return '中立';
}
export function characterFamily(id:string):CharacterFamily {
 const entry=(source.characters as Record<string,{name:string}>)[id];if(!entry)throw Error('角色未在本批目录');return familyForName(entry.name);
}
// Only the caller's explicitly enabled, fully implemented IDs may enter a pool.
// No implicit default enables the 16 metadata entries as playable characters.
export function factionDraftPools(available:readonly string[]){
 if(new Set(available).size!==available.length)throw Error('角色池不能重复');
 return Object.fromEntries((['机械猴子','帝汶家族'] as const).map(faction=>[faction,available.filter(id=>{const family=characterFamily(id);return family===faction||family==='中立';})])) as Record<'机械猴子'|'帝汶家族',string[]>;
}
