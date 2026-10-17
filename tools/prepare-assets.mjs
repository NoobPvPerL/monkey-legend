import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {extname,join} from 'node:path';
import {build} from 'esbuild';
const manifest=JSON.parse(await readFile('docs/assets-manifest.json','utf8'));
const bundled=await build({entryPoints:['packages/game-data/src/stage3.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const data=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64'));
const whitelist=new Set([...data.STAGE3_CARD_IDS,...data.STAGE3_CHARACTER_IDS]);
const map={};await mkdir('public/references',{recursive:true});
for(const image of manifest.images??manifest.assets??[]){for(const ref of image.contentRefs??[]){if(whitelist.has(ref.cardId)&&!map[ref.cardId]){const file=ref.cardId+extname(image.path);await copyFile(image.path,join('public/references',file));map[ref.cardId]=`/references/${file}`;}}}
if(Object.keys(map).length!==whitelist.size)throw Error(`素材映射应有${whitelist.size}项，实际${Object.keys(map).length}`);
await writeFile('public/references/index.json',JSON.stringify(map,null,2)+'\n');
console.log(`已根据稳定ID准备${whitelist.size}份浏览器参考素材，原图未修改。`);
