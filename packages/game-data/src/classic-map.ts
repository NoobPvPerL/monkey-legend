// Original CSV layout only; versioned attributes and fixed-spawn helpers live in versions.ts.
export interface RegionCell {readonly id:string;readonly row:number;readonly col:number;readonly region:string}
export const CLASSIC_MAP_ID='classic-v1' as const;
export const CLASSIC_REGIONS:readonly (readonly string[])[]=Object.freeze([
 ['高唐农场','教学楼','教学楼','秀松苑','秀松苑','尚德荟','食堂','飞船'],
 ['XDF','教学楼','教学楼','操场','秀松苑','秀松苑','食堂','山洞'],
 ['帝汶岛','帝汶岛','红素洋','操场','樱花大道','樱花大道','樱花大道','樱花大道'],
 ['帝汶岛','帝汶岛','红素洋','办公室','办公室','淘安泽','淘安泽','云上学府'],
].map(row=>Object.freeze(row)));
export const CLASSIC_CELLS:readonly RegionCell[]=Object.freeze(CLASSIC_REGIONS.flatMap((row,r)=>row.map((region,c)=>Object.freeze({id:`r${r+1}c${c+1}`,row:r+1,col:c+1,region}))));
export function parseRegionCsv(text:string):readonly RegionCell[]{
 const lines=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\n$/,'').split('\n');
 if(lines.length!==4)throw Error('经典地图必须为无表头的4行8列');
 const regions=new Set(CLASSIC_CELLS.map(cell=>cell.region));
 const cells=lines.flatMap((line,r)=>{
  const row=line.split(',');if(row.length!==8||row.some(region=>!regions.has(region)))throw Error('经典地图列数或地区名称无效');
  return row.map((region,c)=>({id:`r${r+1}c${c+1}`,row:r+1,col:c+1,region}));
 });
 if(new Set(cells.map(cell=>cell.region)).size!==15)throw Error('经典地图必须覆盖15个地区');
 for(const region of regions){
  const group=cells.filter(cell=>cell.region===region),seen=new Set([group[0].id]);
  let changed=true;while(changed){changed=false;for(const cell of group)if(!seen.has(cell.id)&&group.some(other=>seen.has(other.id)&&Math.abs(cell.row-other.row)+Math.abs(cell.col-other.col)===1)){seen.add(cell.id);changed=true;}}
  if(seen.size!==group.length)throw Error(`地区不连通：${region}`);
 }
 return Object.freeze(cells.map(cell=>Object.freeze(cell)));
}
