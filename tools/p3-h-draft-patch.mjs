import {replace} from './p3-patch.mjs';
/** H035 selects a legal birth cell after the other three fixed-region spawns.
 * It has no fixed-region capacity; H041 still consumes its original region slot. */
export function hDraftPatch(name,body){
 if(name==='p3d_spawn_pool')body=replace(body,
  'where\n (select count(*)',
  "where\n (s->>'catalogVersion'='web-v0.1.19' and v#>>'{}'='character-035') or (select count(*)");
 if(name==='p3d_spawn_safe')body=replace(body,
  "from ml_private.arr(pool) v loop",
  "from ml_private.arr(pool) v where not(s->>'catalogVersion'='web-v0.1.19' and v#>>'{}'='character-035') loop");
 return body;
}
