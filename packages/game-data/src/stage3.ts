import source from './source-catalog.json';
import {CARDS,legacyCardForVersion,CHARACTERS} from './legacy';
import {characterFamily} from './character-affiliation';

// Approved dependency subset; this does not enable all 76 source definitions.
export const STAGE3_RULE_VERSION='web-v0.1.6' as const;
export const STAGE3_NEW_CARD_IDS=['basic-010','basic-015','basic-016','basic-037','basic-041','basic-054','basic-063','basic-066','basic-067','basic-071','basic-072'] as const;
export const ANIMAL_IDS=['basic-063','basic-066','basic-067','basic-071','basic-072'] as const;
export type Stage3CardType='attack'|'response'|'food'|'tactic'|'equipment';
export interface Stage3Card {id:string;name:string;copies:number;cost:number;type:Stage3CardType;range?:'global'|'same'|'adjacent';power?:number;group?:boolean;text:string;slot?:'hand'|'mount';randomCost?:true}
export interface Stage3Character {id:string;name:string;hp:number;spawnRegion:string;faction:string;waterNative:boolean;text:string}
const extras:Record<typeof STAGE3_NEW_CARD_IDS[number],Omit<Stage3Card,'id'|'name'|'copies'|'text'>>={
 'basic-010':{cost:2,type:'attack',range:'adjacent',group:true},
 'basic-015':{cost:0,type:'tactic'},
 'basic-016':{cost:1,type:'tactic',range:'global'},
 'basic-037':{cost:0,type:'tactic',range:'global',randomCost:true},
 'basic-041':{cost:2,type:'food',range:'adjacent',group:true},
 'basic-054':{cost:2,type:'equipment',slot:'hand'},
 'basic-063':{cost:0,type:'equipment',slot:'mount'},
 'basic-066':{cost:1,type:'equipment',slot:'mount'},
 'basic-067':{cost:1,type:'equipment',slot:'mount'},
 'basic-071':{cost:1,type:'equipment',slot:'mount'},
 'basic-072':{cost:1,type:'equipment',slot:'mount'},
};
const cardText:Record<string,string>={
 'basic-010':'同区／相邻区选1—3名敌人，各自掷d6，单数受1伤；始终按群体判定。',
 'basic-015':'增加8AP；跳过下一次整轮AP补充及下次个人开始补点／尚德荟加点。其他卡牌收益照常，重复只刷新标记。',
 'basic-016':'选择一名其他存活角色，与其交换位置；遵守免疫、封闭地区与各自禁水限制。',
 'basic-037':'复活死亡后尚未跨过一个完整个人回合结束的角色：1HP、0AP、空手，固定出生地区随机空格。d6费用按实体牌锁定至本个人回合结束，取消不重掷。',
 'basic-041':'自己及同区／相邻区的存活队友各回复1生命；各自为战只回复自己。',
 'basic-054':'装备于手。主动付2AP使全图一名其他角色下次个人回合不能主动出牌，仍能移动、技能和响应；自己第二次个人开始才可再用。失去时可回复2生命。',
 'basic-063':'无视面包车；不能下水，失去时可传送至山洞空格。',
 'basic-066':'首个个人回合无加成；上个个人回合没用基础移动，本次可移动两次，各掷d6使用完整点数。',
 'basic-067':'个人回合结束时，若本回合没有任何主动位移，其他有坐骑者至你下次开始前不能主动位移。',
 'basic-071':'基础移动不需要支付AP，仍受移动次数、步数和落点限制。',
 'basic-072':'每次正数治疗直接回复至生命上限，不超上限；美丽学子的食物禁疗优先。',
};
const characterText:Record<string,string>={
 'character-002':'太简单了：任意基础牌结算前可每次付1AP掷d6，3—6整牌失效，1—2可继续尝试；同一张牌共用10秒，不续时。',
 'character-003':'懒得喷：自己行动时0AP，每个人回合一次，至本回合结束固定费用免费；暴露至下次开始，其他人的适用主动牌追加自己为目标。通校耗尽资源仍照常。自己的致命伤害不能临死救治，淘汰后仍可复活。',
 'character-005':'根正苗红：建民牌对自己无效且不能使用，可持有／弃置／转换。纯菜：使其他存活者实际失血后，每个原效果对每目标可免费判定一次，3—6对方再受1伤，1—2自己受1伤；不递归。',
 'character-006':'北鄙：其他当前非机械猴子玩家打来的卡牌效果对自己无效，有益牌也无效；本人用牌正常。真正的帝汶：帝汶词条牌的正数出牌／装配费用自动免费，不免牌内主动费用。',
 'character-010':'帝汶三宝：本队整局累计成功打出咖啡、橡胶、紫檀木，自己存活时可组合获胜。克星：假原始人不能移动本队。领袖风范：个人开始可与其他合法角色各摸1，或从其手中随机拿1；0AP、10秒。',
 'character-023':'真肘击可主动0AP使用，选同地区一名其他角色伤1并撞开1格，自己传到其原位；无空格只伤害。任意手牌可总价2AP当作这次肘击，转换不能影响谢bro；梅梅涛免疫两种强化。',
 'character-026':'创始人优先级最高：其他角色主动／被动／锁定技能均不能影响自己。本次整份效果凡被他人角色技能修改费用、目标、伤害、位移或转换身份，也全部无效；不追溯历史摸牌来源。',
 'character-031':'整轮统一加点时不增加AP。自己个人开始不足6补至6，等于或高于6保持，再结算地点加点。每轮受伤存活可判定一次，4—6可付2AP回1，失败不扣AP。',
 'character-040':'方向感：基础移动先声明方向，独立掷d6，单数反向；沿最终方向直行。拖泥带水：每段自身位移后，可将起点相邻的一名合法角色带到终点邻接空格，0AP，不消耗其基础移动，不递归。',
 'character-043':'立即强制收取其他合法存活者超出当前HP的手牌，由原持有人10秒选牌，超时取实体ID最小者；自己超限照常结束弃牌。其他角色新增AP越过7的部分交给自己，不追收旧余额，自己无此上限。',
 'character-044':'其他角色主动技能（包括有益技能）不能影响自己。每张猴子游戏完成后，可从使用者／实际参与者中选一名造成1伤；按判定前同地区或四向邻格保存候选，0AP、10秒、每牌一次。',
 'character-045':'基础走路沿进入方向把占位者撞到最远合法空格，不连锁推第三人，梅梅涛可挡路。猴子游戏可无视教学楼／秀松苑禁用和距离，仍限1—3名敌人及正常免疫。本队整局累计外星人、阿萨姆、营养快线，自己存活时可组合获胜。',
 'character-048':'装配面包、哈基米、等一羊、小白马、勿一羊、粥盛羊不消耗AP；不免装备主动能力费用，不改变槽位、同名与替换规则。',
};
export const STAGE3_CARDS:Readonly<Record<string,Stage3Card>>=Object.freeze(Object.fromEntries([
 ...Object.keys(CARDS).map(id=>{const c=legacyCardForVersion(id as keyof typeof CARDS,'web-v0.1.5');return [id,Object.freeze({...c,...(id==='basic-001'?{text:'取消可响应攻击对自己的全部效果；不能响应躲避球'}:id==='basic-009'?{text:'同/相邻区域；骰4—6伤1；不能用防御姿态抵挡'}:{})})] as const;}),
 ...STAGE3_NEW_CARD_IDS.map(id=>[id,Object.freeze({id,name:source.cards[id].name,copies:id==='basic-037'?1:2,text:cardText[id]??source.cards[id].text,...extras[id]})] as const),
]));
export const STAGE3_CARD_IDS=Object.freeze(Object.keys(STAGE3_CARDS));
export const STAGE3_ALL_CARDS=Object.freeze(STAGE3_CARD_IDS.flatMap(id=>Array.from({length:STAGE3_CARDS[id].copies},(_,i)=>`${id}#${String(i+1).padStart(2,'0')}`)));
export const STAGE3_CHARACTER_IDS=Object.freeze(Object.keys(source.characters));
export const STAGE3_CHARACTERS:Readonly<Record<string,Stage3Character>>=Object.freeze(Object.fromEntries(Object.entries(source.characters).map(([id,c])=>[id,Object.freeze({id,name:c.name,hp:Number(c.printedHp),spawnRegion:id==='character-004'?'操场':c.spawnRegion,faction:characterFamily(id),waterNative:c.waterNative,text:characterText[id]??(id in CHARACTERS?CHARACTERS[id as keyof typeof CHARACTERS].text:c.text)})])));
export const STAGE3_POLICY=Object.freeze({
 version:STAGE3_RULE_VERSION,cardDefinitions:23,cardInstances:85,characters:16,
 equipment:{hand:2,mount:1,uniqueNames:true,voluntaryUnequip:false,deathLossTriggers:false},
 revival:{hp:1,ap:0,hand:0,completePersonalEnds:1,costMin:1,costMax:6,lockCost:'entity-and-personal-turn',noLegalSpawn:'reject'},
 mounts:{waitFirstTurnBonus:false,waitMoves:2,waitFullDice:true,horseExpiry:'owner-next-personal-start',porridge:'positive-heal-to-max'},
 coffee:{gain:8,blockNextRoundGain:true,blockNextPersonalStartGain:true,blockCardGains:false,stack:false},
 bread:{cost:2,cooldownPersonalStarts:2,skip:'next-personal-proactive-card-play',stack:false},
});
