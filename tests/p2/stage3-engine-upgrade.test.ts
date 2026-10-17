import {afterAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {database} from './database';
import {createGame} from '../../packages/game-core/src/index';
const db=await database();afterAll(()=>db.close());
await db.exec(await readFile('database/engine/stage3-generated.sql','utf8'));
it('staged SQL creates exactly the same initial classic game without opening the incomplete ruleset in room health',async()=>{
 const setup={mode:'ffa' as const,ruleVersion:'web-v0.1.6' as const,seed:42,seats:[0,1,2,3],first:0,characters:['character-045','character-031','character-026','character-044'] as const};
 const ts=createGame({...setup,characters:[...setup.characters]},1000),sql=(await db.query<{v:any}>('select ml_private.create_game($1::jsonb,1000) v',[JSON.stringify(setup)])).rows[0].v;expect(sql).toEqual(ts);
});
