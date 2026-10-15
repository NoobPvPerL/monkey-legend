import {readFile,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {extname,join} from 'node:path';
const manifest=JSON.parse(await readFile('docs/assets-manifest.json','utf8'));
const whitelist=new Set(['basic-001','basic-002','basic-003','basic-004','basic-005','basic-006','basic-008','basic-009','basic-039','basic-045','basic-046','basic-047','character-004','character-027','character-031','character-037']);
const map={};await mkdir('public/references',{recursive:true});
for(const image of manifest.images??manifest.assets??[]){for(const ref of image.contentRefs??[]){if(whitelist.has(ref.cardId)&&!map[ref.cardId]){const file=ref.cardId+extname(image.path);await copyFile(image.path,join('public/references',file));map[ref.cardId]=`/references/${file}`;}}}
if(Object.keys(map).length!==16)throw Error(`首版素材映射应有16项，实际${Object.keys(map).length}`);
await writeFile('public/references/index.json',JSON.stringify(map,null,2)+'\n');
console.log('已根据稳定ID准备16份浏览器参考素材，原图未修改。');
