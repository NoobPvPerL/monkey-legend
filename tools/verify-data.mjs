import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('docs/assets-manifest.json','utf8'));
const images=manifest.images??manifest.assets??[];
if(images.length!==187)throw Error('素材台账应为187项');
for(const item of [...images,...manifest.sourceDocuments]){const data=await readFile(item.path);if(createHash('sha256').update(data).digest('hex')!==item.sha256)throw Error(`来源哈希变化：${item.path}`);}
console.log('PASS：187图片与4份原始卡牌文档SHA-256一致；运行数据校验见 npm test。');
