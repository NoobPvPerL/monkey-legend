import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Source metadata, not an executable interpretation of unresolved rules.
const files=['基础牌.md','角色牌.md'];
const result={sourceHashFormat:'utf8-lf',sources:{},cards:{},characters:{}};
const selected=new Set(['002','003','004','005','006','010','023','026','027','031','037','040','043','044','045','048']);
for(const file of files){
 const path='docs/cards/'+file,bytes=await readFile(path),text=bytes.toString('utf8').replaceAll('\r\n','\n');
 result.sources[path]=createHash('sha256').update(text).digest('hex');
 for(const block of text.split(/(?=^## (?:basic|character)-)/m).slice(1)){
  const heading=block.match(/^## ((basic|character)-(\d+)) · (.+)/);if(!heading)continue;
  const [,id,kind,number,name]=heading;if(kind==='character'&&!selected.has(number))continue;
  const fields=Object.fromEntries([...block.matchAll(/^\| ([^|]+) \| ([^|]*) \|$/gm)].map(m=>[m[1].trim(),m[2].trim()]));
  const section=title=>block.match(new RegExp('### '+title+'\\n([\\s\\S]*?)(?=\\n### |\\n<a |$)'))?.[1].trim().replace(/\n---$/,'').trim()??'';
  const common={id,name,source:path+'#'+id,text:section('能力文本（牌面）'),notes:section('待确认与转录备注')};
  if(kind==='basic')result.cards[id]={...common,subtype:fields['子类'],tags:fields['牌面词条'].split(/[、/，]/),printedCost:fields['牌面行动点'],range:fields['范围'],target:fields['对象/牌面标签'],copies:null};
  else result.characters[id]={...common,printedHp:fields['牌面血量'],spawnRegion:fields['出生地'],printedFaction:fields['阵营']==='未注明'?null:fields['阵营'],waterNative:(name.includes('帝汶')&&name!=='中帝汶')||name==='lemon'};
 }
}
if(Object.keys(result.cards).length!==76||Object.keys(result.characters).length!==16)throw Error('Expected 76 card and 16 character source definitions');
const path='packages/game-data/src/source-catalog.json',body=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--check')){if((await readFile(path,'utf8')).replaceAll('\r\n','\n')!==body)throw Error('Content source catalog differs from docs/cards');}
else await writeFile(path,body);
console.log('Content metadata: 76 cards / 16 characters, stable source IDs and hashes; no unresolved defaults added.');
