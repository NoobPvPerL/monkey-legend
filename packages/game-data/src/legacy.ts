import type sourceCatalog from './source-catalog.json';
export const RULE_VERSION = 'web-v0.1.1' as const;
export const hasInteractionRules=(version:string)=>['web-v0.1.2','web-v0.1.3','web-v0.1.4','web-v0.1.5','web-v0.1.6','web-v0.1.7'].includes(version);
export const unlimitedAttacks=(version:string)=>['web-v0.1.3','web-v0.1.4','web-v0.1.5','web-v0.1.6','web-v0.1.7'].includes(version);
export type CardId = keyof typeof sourceCatalog.cards;
export type CharacterId = 'character-004'|'character-027'|'character-031'|'character-037'|'character-002'|'character-003'|'character-005'|'character-006'|'character-010'|'character-023'|'character-026'|'character-040'|'character-043'|'character-044'|'character-045'|'character-048';
export interface CardDefinition { id: CardId; name: string; copies: number; cost: number; type: 'attack'|'response'|'food'|'tactic'|'equipment'; range?: 'global'|'same'|'adjacent'; power?: number; group?: boolean; text: string;slot?:'body'|'hand'|'head'|'wrist'|'mount';randomCost?:true }
export const CARDS: Record<CardId, CardDefinition> = Object.fromEntries([
 ['basic-001','防御姿态',8,1,'response',undefined,undefined,false,'取消本张攻击对自己的全部效果'],
 ['basic-002','肘击',4,0,'response',undefined,undefined,false,'仅响应头锤；反吸最多2AP，对方AP为0则造成1伤害'],
 ['basic-003','搏击操Ⅰ',8,1,'attack','global',1,false,'全图单体：扣1AP，不足转普通伤害'],
 ['basic-004','搏击操Ⅱ',4,2,'attack','global',2,false,'全图单体：扣2AP，不足转普通伤害'],
 ['basic-005','搏击操Ⅲ',2,3,'attack','global',3,true,'全图选1—2敌人：各扣3AP，不足转普通伤害；始终为群体'],
 ['basic-006','吸血',8,1,'attack','same',undefined,false,'同区域；骰4—6伤1，按实际失血治疗自己'],
 ['basic-008','头锤',6,1,'attack','adjacent',undefined,false,'同/相邻区域；吸收最多2AP，目标AP为0则伤1'],
 ['basic-009','躲避球',12,1,'attack','adjacent',undefined,false,'同/相邻区域；骰4—6伤1'],
 ['basic-039','奈雪',4,1,'food',undefined,undefined,false,'自己回复1生命'],
 ['basic-045','水果',2,2,'food',undefined,undefined,false,'自己回复1生命，再获得1护盾（上限2）'],
 ['basic-046','外星人',2,2,'food',undefined,undefined,false,'自己回复2生命'],
 ['basic-047','营养快线',4,2,'food',undefined,undefined,false,'自己回复1生命，再摸2张'],
].map(([id,name,copies,cost,type,range,power,group,text])=>[id,{id,name,copies,cost,type,range,power,group,text}])) as Record<CardId,CardDefinition>;
// Versioned overrides preserve the original catalog for matches already in progress.
export function legacyCardForVersion(id:CardId,version:string):CardDefinition {
 const card=CARDS[id];if(!hasInteractionRules(version))return card;
 if(['basic-003','basic-004','basic-005'].includes(id))return {...card,group:true,text:`全图选1—3名敌人：各扣${card.power}AP，不足转普通伤害；始终为群体`};
 if(id==='basic-008')return {...card,text:'同/相邻区域；吸收目标全部现有AP，目标AP为0则伤1'};
 return card;
}
export const CARD_IDS = Object.keys(CARDS) as CardId[];
export const definitionId = (instance: string) => instance.split('#')[0] as CardId;
export const ALL_CARDS = CARD_IDS.flatMap(id => Array.from({length:CARDS[id].copies},(_,i)=>`${id}#${String(i+1).padStart(2,'0')}`));
export const CHARACTERS: Record<CharacterId,{id:CharacterId;name:string;hp:number;spawn:string;faction:string;text:string}> = {
 'character-004':{id:'character-004',name:'lemon',hp:5,spawn:'r4c1',faction:'帝汶家族',text:'合法单体攻击必须指定lemon；敌人每轮首次使其失血可摸1；自己存活受伤后每轮可付1AP，自己及队友各摸1。'},
 'character-027':{id:'character-027',name:'美丽学子',hp:4,spawn:'r2c3',faction:'中立',text:'自己开始/结束各可摸1；恰1手牌免疫群体指定；食物回血为0，其他效果保留。'},
 'character-031':{id:'character-031',name:'跑者',hp:3,spawn:'r1c1',faction:'中立',text:'自己开始AP不足6补6；每轮受伤存活可判定一次，骰4—6可付2AP回1，失败不扣AP。'},
 'character-037':{id:'character-037',name:'土豆',hp:5,spawn:'r2c5',faction:'中立',text:'每轮受伤且存活后，可免费传送至曼哈顿距离≤3的空陆地；执行才耗次数。'},
} as Record<CharacterId,{id:CharacterId;name:string;hp:number;spawn:string;faction:string;text:string}>;
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];
const REGIONS = [
 ['高唐农场','高唐农场','XDF','XDF','秀松苑','秀松苑','云上学府','云上学府'],
 ['樱花大道','樱花大道','教学楼','教学楼','教学楼','山洞','飞船','飞船'],
 ['办公室','办公室','食堂','食堂','山洞','山洞','帝汶岛','帝汶岛'],
 ['操场','操场','尚德荟','尚德荟','淘安泽','淘安泽','红素洋','红素洋'],
];
export interface Cell { id:string; row:number; col:number; region:string; terrain:'land'|'water' }
export const CELLS: Cell[] = REGIONS.flatMap((row,r)=>row.map((region,c)=>({id:`r${r+1}c${c+1}`,row:r+1,col:c+1,region,terrain:r===3&&c>=4?'water':'land'})));
export const MAP = Object.fromEntries(CELLS.map(c=>[c.id,c]));
export const distance = (a:string,b:string) => Math.abs(MAP[a].row-MAP[b].row)+Math.abs(MAP[a].col-MAP[b].col);
export const neighboring = (a:string,b:string) => CELLS.some(x=>x.region===a&&CELLS.some(y=>y.region===b&&a!==b&&distance(x.id,y.id)===1));
export function safeCells(round:number): string[] {
 return CELLS.filter(c=>round<=3 || (round<=5 ? c.col>=2&&c.col<=7 : round<=7 ? c.col>=3&&c.col<=6 : round<=9 ? c.row>=2&&c.row<=3&&c.col>=3&&c.col<=6 : c.row>=2&&c.row<=3&&c.col>=3&&c.col<=5)).map(c=>c.id);
}
export const poisonDamage = (round:number) => round<=3?0:round<=7?1:2;
export const bombCandidates = (round:number) => [...new Set(safeCells(round).map(id=>MAP[id].region))];
export function validateData(): void {
 if(CELLS.length!==32 || new Set(CELLS.map(c=>c.id)).size!==32 || new Set(CELLS.map(c=>c.region)).size!==15) throw Error('地图必须为32格15区域');
 if(CARD_IDS.length!==12 || ALL_CARDS.length!==64 || new Set(ALL_CARDS).size!==64) throw Error('牌池必须为12定义64实体');
 if(CHARACTER_IDS.length!==4 || new Set(CHARACTER_IDS.map(id=>CHARACTERS[id].spawn)).size!==4) throw Error('四角色出生无效');
 for(const id of CHARACTER_IDS) if(MAP[CHARACTERS[id].spawn]?.terrain!=='land') throw Error('出生必须为陆地');
}
