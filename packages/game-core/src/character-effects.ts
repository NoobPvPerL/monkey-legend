// Approved stage-3 effect boundary. New characters remain gated until their
// complete skills and room flow exist; callers must propagate current-action
// role modifiers through every derived effect, including equipment effects.
export type EffectOrigin='card'|'role-active'|'role-passive'|'role-locked'|'equipment'|'location'|'environment';
export interface RoleModifier {actor:number;kind:'cost'|'target'|'damage'|'movement'|'conversion'|'other'}
export interface CharacterEffect {origin:EffectOrigin;actor:number|null;roleModifiers:readonly RoleModifier[]}
export interface CharacterEffectTarget {seat:number;character:string}
export function roleEffectAllowed(effect:CharacterEffect,target:CharacterEffectTarget):boolean {
 const otherRole=effect.origin.startsWith('role-')&&effect.actor!==null&&effect.actor!==target.seat;
 const modifiedByOtherRole=effect.roleModifiers.some(m=>m.actor!==target.seat);
 // Mei's veto is evaluated before any card-specific target override. The
 // caller drops this target's entire effect, not merely the added damage.
 if(target.character==='character-026'&&(otherRole||modifiedByOtherRole))return false;
 if(target.character==='character-044'&&effect.origin==='role-active'&&effect.actor!==target.seat)return false;
 return true;
}
export function modifiedByRole(effect:CharacterEffect,modifier:RoleModifier):CharacterEffect {
 return {...effect,roleModifiers:[...effect.roleModifiers,modifier]};
}
