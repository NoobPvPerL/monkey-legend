import {readFile,writeFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const code=await transform(await readFile('packages/game-data/src/legacy.ts','utf8'),{loader:'ts',format:'esm'});
const d=await import('data:text/javascript;base64,'+Buffer.from(code.code).toString('base64'));
const entries={cards:d.CARDS,characters:d.CHARACTERS,characterIds:d.CHARACTER_IDS,cells:d.CELLS,map:d.MAP,allCards:d.ALL_CARDS};
let sql='-- Generated from the approved web-v0.1.1 runtime data. Do not edit by hand.\n';
for(const [key,value] of Object.entries(entries))sql+=`insert into ml_private.catalog(key,value) values ('${key}','${JSON.stringify(value).replaceAll("'","''")}'::jsonb) on conflict(key) do update set value=excluded.value;\n`;
const path='database/migrations/001_data.sql';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==sql)throw Error('SQL data differs from game-data; regenerate and review.');}
else await writeFile(path,sql);
