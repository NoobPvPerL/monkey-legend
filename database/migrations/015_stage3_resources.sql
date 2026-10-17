-- Private stage-three dependency catalog and resource helpers only.
-- Does not change ml_health, default room rules or existing ruleset profiles.
DO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<14 THEN RAISE EXCEPTION 'Apply complete 014 before 015'; END IF; END $$;
insert into ml_private.catalog(key,value) values('stage3:content-v1','{"cards":{"basic-001":{"id":"basic-001","name":"防御姿态","copies":8,"cost":1,"type":"response","group":false,"text":"取消可响应攻击对自己的全部效果；不能响应躲避球"},"basic-002":{"id":"basic-002","name":"肘击","copies":4,"cost":0,"type":"response","group":false,"text":"仅响应头锤；反吸最多2AP，对方AP为0则造成1伤害"},"basic-003":{"id":"basic-003","name":"搏击操Ⅰ","copies":8,"cost":1,"type":"attack","range":"global","power":1,"group":true,"text":"全图选1—3名敌人：各扣1AP，不足转普通伤害；始终为群体"},"basic-004":{"id":"basic-004","name":"搏击操Ⅱ","copies":4,"cost":2,"type":"attack","range":"global","power":2,"group":true,"text":"全图选1—3名敌人：各扣2AP，不足转普通伤害；始终为群体"},"basic-005":{"id":"basic-005","name":"搏击操Ⅲ","copies":2,"cost":3,"type":"attack","range":"global","power":3,"group":true,"text":"全图选1—3名敌人：各扣3AP，不足转普通伤害；始终为群体"},"basic-006":{"id":"basic-006","name":"吸血","copies":8,"cost":1,"type":"attack","range":"same","group":false,"text":"同区域；骰4—6伤1，按实际失血治疗自己"},"basic-008":{"id":"basic-008","name":"头锤","copies":6,"cost":1,"type":"attack","range":"adjacent","group":false,"text":"同/相邻区域；吸收目标全部现有AP，目标AP为0则伤1"},"basic-009":{"id":"basic-009","name":"躲避球","copies":12,"cost":1,"type":"attack","range":"adjacent","group":false,"text":"同/相邻区域；骰4—6伤1；不能用防御姿态抵挡"},"basic-039":{"id":"basic-039","name":"奈雪","copies":4,"cost":1,"type":"food","group":false,"text":"自己回复1生命"},"basic-045":{"id":"basic-045","name":"水果","copies":2,"cost":2,"type":"food","group":false,"text":"自己回复1生命，再获得1护盾（上限2）"},"basic-046":{"id":"basic-046","name":"外星人","copies":2,"cost":2,"type":"food","group":false,"text":"自己回复2生命"},"basic-047":{"id":"basic-047","name":"营养快线","copies":4,"cost":2,"type":"food","group":false,"text":"自己回复1生命，再摸2张"},"basic-010":{"id":"basic-010","name":"猴子游戏","copies":2,"text":"同区／相邻区选1—3名敌人，各自掷d6，单数受1伤；始终按群体判定。","cost":2,"type":"attack","range":"adjacent","group":true},"basic-015":{"id":"basic-015","name":"咖啡","copies":2,"text":"增加8AP；跳过下一次整轮AP补充及下次个人开始补点／尚德荟加点。其他卡牌收益照常，重复只刷新标记。","cost":0,"type":"tactic"},"basic-016":{"id":"basic-016","name":"橡胶","copies":2,"text":"选择一名其他存活角色，与其交换位置；遵守免疫、封闭地区与各自禁水限制。","cost":1,"type":"tactic","range":"global"},"basic-037":{"id":"basic-037","name":"紫檀木","copies":1,"text":"复活死亡后尚未跨过一个完整个人回合结束的角色：1HP、0AP、空手，固定出生地区随机空格。d6费用按实体牌锁定至本个人回合结束，取消不重掷。","cost":0,"type":"tactic","range":"global","randomCost":true},"basic-041":{"id":"basic-041","name":"阿萨姆","copies":2,"text":"自己及同区／相邻区的存活队友各回复1生命；各自为战只回复自己。","cost":2,"type":"food","range":"adjacent","group":true},"basic-054":{"id":"basic-054","name":"爆浆冰淇淋面包","copies":2,"text":"装备于手。主动付2AP使全图一名其他角色下次个人回合不能主动出牌，仍能移动、技能和响应；自己第二次个人开始才可再用。失去时可回复2生命。","cost":2,"type":"equipment","slot":"hand"},"basic-063":{"id":"basic-063","name":"哈基米","copies":2,"text":"无视面包车；不能下水，失去时可传送至山洞空格。","cost":0,"type":"equipment","slot":"mount"},"basic-066":{"id":"basic-066","name":"等一羊","copies":2,"text":"首个个人回合无加成；上个个人回合没用基础移动，本次可移动两次，各掷d6使用完整点数。","cost":1,"type":"equipment","slot":"mount"},"basic-067":{"id":"basic-067","name":"高胜胜牌小白马","copies":2,"text":"个人回合结束时，若本回合没有任何主动位移，其他有坐骑者至你下次开始前不能主动位移。","cost":1,"type":"equipment","slot":"mount"},"basic-071":{"id":"basic-071","name":"勿一羊","copies":2,"text":"基础移动不需要支付AP，仍受移动次数、步数和落点限制。","cost":1,"type":"equipment","slot":"mount"},"basic-072":{"id":"basic-072","name":"粥盛羊","copies":2,"text":"每次正数治疗直接回复至生命上限，不超上限；美丽学子的食物禁疗优先。","cost":1,"type":"equipment","slot":"mount"}},"characters":{"character-002":{"id":"character-002","name":"easy","hp":4,"spawnRegion":"秀松苑","faction":"中立","waterNative":false,"text":"太简单了：任意基础牌结算前可每次付1AP掷d6，3—6整牌失效，1—2可继续尝试；同一张牌共用10秒，不续时。"},"character-003":{"id":"character-003","name":"JJ","hp":4,"spawnRegion":"秀松苑","faction":"中立","waterNative":false,"text":"懒得喷：自己行动时0AP，每个人回合一次，至本回合结束固定费用免费；暴露至下次开始，其他人的适用主动牌追加自己为目标。通校耗尽资源仍照常。自己的致命伤害不能临死救治，淘汰后仍可复活。"},"character-004":{"id":"character-004","name":"lemon","hp":5,"spawnRegion":"操场","faction":"帝汶家族","waterNative":true,"text":"合法单体攻击必须指定lemon；敌人每轮首次使其失血可摸1；自己存活受伤后每轮可付1AP，自己及队友各摸1。"},"character-005":{"id":"character-005","name":"QB","hp":4,"spawnRegion":"秀松苑","faction":"中立","waterNative":false,"text":"根正苗红：建民牌对自己无效且不能使用，可持有／弃置／转换。纯菜：使其他存活者实际失血后，每个原效果对每目标可免费判定一次，3—6对方再受1伤，1—2自己受1伤；不递归。"},"character-006":{"id":"character-006","name":"北帝汶","hp":4,"spawnRegion":"帝汶岛","faction":"帝汶家族","waterNative":true,"text":"北鄙：其他当前非机械猴子玩家打来的卡牌效果对自己无效，有益牌也无效；本人用牌正常。真正的帝汶：帝汶词条牌的正数出牌／装配费用自动免费，不免牌内主动费用。"},"character-010":{"id":"character-010","name":"东帝汶","hp":4,"spawnRegion":"帝汶岛","faction":"帝汶家族","waterNative":true,"text":"帝汶三宝：本队整局累计成功打出咖啡、橡胶、紫檀木，自己存活时可组合获胜。克星：假原始人不能移动本队。领袖风范：个人开始可与其他合法角色各摸1，或从其手中随机拿1；0AP、10秒。"},"character-023":{"id":"character-023","name":"牢大","hp":4,"spawnRegion":"教学楼","faction":"中立","waterNative":false,"text":"真肘击可主动0AP使用，选同地区一名其他角色伤1并撞开1格，自己传到其原位；无空格只伤害。任意手牌可总价2AP当作这次肘击，转换不能影响谢bro；梅梅涛免疫两种强化。"},"character-026":{"id":"character-026","name":"梅梅涛","hp":4,"spawnRegion":"教学楼","faction":"中立","waterNative":false,"text":"创始人优先级最高：其他角色主动／被动／锁定技能均不能影响自己。本次整份效果凡被他人角色技能修改费用、目标、伤害、位移或转换身份，也全部无效；不追溯历史摸牌来源。"},"character-027":{"id":"character-027","name":"美丽学子","hp":4,"spawnRegion":"教学楼","faction":"中立","waterNative":false,"text":"自己开始/结束各可摸1；恰1手牌免疫群体指定；食物回血为0，其他效果保留。"},"character-031":{"id":"character-031","name":"跑者","hp":3,"spawnRegion":"高唐农场","faction":"中立","waterNative":false,"text":"整轮统一加点时不增加AP。自己个人开始不足6补至6，等于或高于6保持，再结算地点加点。每轮受伤存活可判定一次，4—6可付2AP回1，失败不扣AP。"},"character-037":{"id":"character-037","name":"土豆","hp":5,"spawnRegion":"教学楼","faction":"中立","waterNative":false,"text":"每轮受伤且存活后，可免费传送至曼哈顿距离≤3的空陆地；执行才耗次数。"},"character-040":{"id":"character-040","name":"西帝汶","hp":5,"spawnRegion":"帝汶岛","faction":"帝汶家族","waterNative":true,"text":"方向感：基础移动先声明方向，独立掷d6，单数反向；沿最终方向直行。拖泥带水：每段自身位移后，可将起点相邻的一名合法角色带到终点邻接空格，0AP，不消耗其基础移动，不递归。"},"character-043":{"id":"character-043","name":"晓虫","hp":3,"spawnRegion":"办公室","faction":"中立","waterNative":false,"text":"立即强制收取其他合法存活者超出当前HP的手牌，由原持有人10秒选牌，超时取实体ID最小者；自己超限照常结束弃牌。其他角色新增AP越过7的部分交给自己，不追收旧余额，自己无此上限。"},"character-044":{"id":"character-044","name":"谢bro","hp":3,"spawnRegion":"办公室","faction":"中立","waterNative":false,"text":"其他角色主动技能（包括有益技能）不能影响自己。每张猴子游戏完成后，可从使用者／实际参与者中选一名造成1伤；按判定前同地区或四向邻格保存候选，0AP、10秒、每牌一次。"},"character-045":{"id":"character-045","name":"应豪","hp":4,"spawnRegion":"秀松苑","faction":"机械猴子","waterNative":false,"text":"基础走路沿进入方向把占位者撞到最远合法空格，不连锁推第三人，梅梅涛可挡路。猴子游戏可无视教学楼／秀松苑禁用和距离，仍限1—3名敌人及正常免疫。本队整局累计外星人、阿萨姆、营养快线，自己存活时可组合获胜。"},"character-048":{"id":"character-048","name":"涨佳选","hp":5,"spawnRegion":"教学楼","faction":"中立","waterNative":false,"text":"装配面包、哈基米、等一羊、小白马、勿一羊、粥盛羊不消耗AP；不免装备主动能力费用，不改变槽位、同名与替换规则。"}},"allCards":["basic-001#01","basic-001#02","basic-001#03","basic-001#04","basic-001#05","basic-001#06","basic-001#07","basic-001#08","basic-002#01","basic-002#02","basic-002#03","basic-002#04","basic-003#01","basic-003#02","basic-003#03","basic-003#04","basic-003#05","basic-003#06","basic-003#07","basic-003#08","basic-004#01","basic-004#02","basic-004#03","basic-004#04","basic-005#01","basic-005#02","basic-006#01","basic-006#02","basic-006#03","basic-006#04","basic-006#05","basic-006#06","basic-006#07","basic-006#08","basic-008#01","basic-008#02","basic-008#03","basic-008#04","basic-008#05","basic-008#06","basic-009#01","basic-009#02","basic-009#03","basic-009#04","basic-009#05","basic-009#06","basic-009#07","basic-009#08","basic-009#09","basic-009#10","basic-009#11","basic-009#12","basic-039#01","basic-039#02","basic-039#03","basic-039#04","basic-045#01","basic-045#02","basic-046#01","basic-046#02","basic-047#01","basic-047#02","basic-047#03","basic-047#04","basic-010#01","basic-010#02","basic-015#01","basic-015#02","basic-016#01","basic-016#02","basic-037#01","basic-041#01","basic-041#02","basic-054#01","basic-054#02","basic-063#01","basic-063#02","basic-066#01","basic-066#02","basic-067#01","basic-067#02","basic-071#01","basic-071#02","basic-072#01","basic-072#02"],"characterIds":["character-002","character-003","character-004","character-005","character-006","character-010","character-023","character-026","character-027","character-031","character-037","character-040","character-043","character-044","character-045","character-048"],"policy":{"version":"web-v0.1.6","cardDefinitions":23,"cardInstances":85,"characters":16,"equipment":{"hand":2,"mount":1,"uniqueNames":true,"voluntaryUnequip":false,"deathLossTriggers":false},"revival":{"hp":1,"ap":0,"hand":0,"completePersonalEnds":1,"costMin":1,"costMax":6,"lockCost":"entity-and-personal-turn","noLegalSpawn":"reject"},"mounts":{"waitFirstTurnBonus":false,"waitMoves":2,"waitFullDice":true,"horseExpiry":"owner-next-personal-start","porridge":"positive-heal-to-max"},"coffee":{"gain":8,"blockNextRoundGain":true,"blockNextPersonalStartGain":true,"blockCardGains":false,"stack":false},"bread":{"cost":2,"cooldownPersonalStarts":2,"skip":"next-personal-proactive-card-play","stack":false}}}'::jsonb) on conflict(key) do nothing;
-- Private stage-three resource helpers. This file alone never enables a new
-- room ruleset. The authenticated room engine integrates them after skills.
create or replace function ml_private.stage3_content() returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select value from ml_private.catalog where key='stage3:content-v1' $$;
create or replace function ml_private.stage3_initial() returns jsonb language sql immutable as $$
 select '{"turn":0,"completedTurn":0,"starts":[0,0,0,0],"ends":[0,0,0,0],"deathTurns":[null,null,null,null],"equipment":[[],[],[],[]],"equipmentSources":{},"costLocks":{},"basicUsed":[0,0,0,0],"voluntaryMoved":[false,false,false,false],"previousBasic":[null,null,null,null],"doubleMove":[false,false,false,false],"horseLocks":[],"horseSources":{},"breadReadyAt":[0,0,0,0],"breadPending":[false,false,false,false],"breadBlocked":[false,false,false,false],"coffeeRound":[false,false,false,false],"coffeeUntilStart":[null,null,null,null],"jjFree":[false,false,false,false],"jjExposed":[false,false,false,false],"jjUsed":[false,false,false,false],"combos":{}}'::jsonb $$;
create or replace function ml_private.stage3_equipped(s jsonb,a integer,definition text) returns boolean language sql immutable
set search_path=pg_catalog,ml_private as $$ select exists(select 1 from ml_private.arr(s#>array['stage3','equipment',a::text]) c where split_part(c#>>'{}','#',1)=definition) $$;
create or replace function ml_private.stage3_mount_blocked(s jsonb,a integer) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select
 exists(select 1 from ml_private.arr(s#>array['stage3','equipment',a::text]) c where ml_private.stage3_content()#>>array['cards',split_part(c#>>'{}','#',1),'slot']='mount')
 and exists(select 1 from ml_private.arr(s#>'{stage3,horseLocks}') c where (c#>>'{}')::int<>a and (s#>>array['players',c#>>'{}','hp'])::int>0 and ml_private.character_effect_allowed(s#>array['stage3','horseSources',c#>>'{}'],a,s#>>array['players',a::text,'character']) and (s#>>array['players',a::text,'character']<>'character-006' or s#>array['stage3','horseSources',c#>>'{}','actor']=to_jsonb(a) or s#>>array['stage3','horseSources',c#>>'{}','faction']='机械猴子')) $$;
create or replace function ml_private.stage3_can_enter(s jsonb,a integer,cell text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select
 (ml_private.runtime_data('web-v0.1.5','map') ? cell) and not (ml_private.stage3_equipped(s,a,'basic-063') and ml_private.runtime_data('web-v0.1.5','map')#>>array[cell,'terrain']='water') $$;
create or replace function ml_private.stage3_turn_start(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare r jsonb:=s->'stage3'; b text:=a::text; locks jsonb; begin
 r:=jsonb_set(r,'{turn}',to_jsonb((r->>'turn')::int+1));r:=jsonb_set(r,array['starts',b],to_jsonb((r#>>array['starts',b])::int+1));
 r:=jsonb_set(r,array['basicUsed',b],'0');r:=jsonb_set(r,array['voluntaryMoved',b],'false');
 r:=jsonb_set(r,array['doubleMove',b],to_jsonb(coalesce(ml_private.stage3_equipped(s,a,'basic-066') and r#>array['previousBasic',b]='false'::jsonb,false)));
 r:=jsonb_set(r,array['jjFree',b],'false');r:=jsonb_set(r,array['jjExposed',b],'false');r:=jsonb_set(r,array['jjUsed',b],'false');
 r:=jsonb_set(r,array['breadBlocked',b],r#>array['breadPending',b]);r:=jsonb_set(r,array['breadPending',b],'false');
 select coalesce(jsonb_agg(x),'[]') into locks from ml_private.arr(r->'horseLocks') x where (x#>>'{}')::int<>a;
 r:=jsonb_set(r,'{horseSources}',(r->'horseSources')-b);r:=r||jsonb_build_object('horseLocks',locks,'costLocks','{}'::jsonb);return jsonb_set(s,'{stage3}',r);
end $$;
create or replace function ml_private.stage3_coffee(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ begin
 s:=jsonb_set(s,array['stage3','coffeeRound',a::text],'true');s:=jsonb_set(s,array['stage3','coffeeUntilStart',a::text],to_jsonb((s#>>array['stage3','starts',a::text])::int+1));return ml_private.stage3_gain_ap(s,a,8);
end $$;
create or replace function ml_private.stage3_round_gain_allowed(s jsonb,a integer) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare allowed boolean:=not (s#>>array['stage3','coffeeRound',a::text])::boolean; begin
 s:=jsonb_set(s,array['stage3','coffeeRound',a::text],'false');return s||jsonb_build_object('_allowed',allowed);
end $$;
create or replace function ml_private.stage3_start_gain_allowed(s jsonb,a integer) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare at_start integer:=(s#>>array['stage3','coffeeUntilStart',a::text])::int; begin
 if at_start is null or (s#>>array['stage3','starts',a::text])::int<at_start then return s||jsonb_build_object('_allowed',true);end if;
 return jsonb_set(s,array['stage3','coffeeUntilStart',a::text],'null')||jsonb_build_object('_allowed',false);
end $$;
create or replace function ml_private.stage3_record_combo(s jsonb,a integer,card text) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare key text:=s#>>array['players',a::text,'team']; used jsonb:=coalesce(s#>array['stage3','combos',key],'[]'); definition text:=split_part(card,'#',1);begin
 if not (used ? definition) then s:=jsonb_set(s,array['stage3','combos',key],used||jsonb_build_array(definition));end if;return s;
end $$;
create or replace function ml_private.stage3_turn_end(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare r jsonb:=s->'stage3'; b text:=a::text; begin
 r:=jsonb_set(r,array['ends',b],to_jsonb((r#>>array['ends',b])::int+1));r:=jsonb_set(r,'{completedTurn}',r->'turn');
 r:=jsonb_set(r,array['previousBasic',b],to_jsonb((r#>>array['basicUsed',b])::int>0));r:=jsonb_set(r,array['jjFree',b],'false');
 if (s#>>array['players',b,'hp'])::int>0 and ml_private.stage3_equipped(s,a,'basic-067') and r#>array['voluntaryMoved',b]='false'::jsonb and not (r->'horseLocks' @> jsonb_build_array(a)) then r:=jsonb_set(r,'{horseLocks}',(r->'horseLocks')||jsonb_build_array(a));r:=jsonb_set(r,array['horseSources',b],(select r->'equipmentSources'->(c#>>'{}')||jsonb_build_object('origin','equipment') from ml_private.arr(r#>array['equipment',b]) c where split_part(c#>>'{}','#',1)='basic-067' limit 1));end if;
 return jsonb_set(s,'{stage3}',r);
end $$;
create or replace function ml_private.stage3_card_cost(s jsonb,a integer,card text,random_cost integer default null) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a; d jsonb:=ml_private.stage3_content()#>array['cards',split_part(card,'#',1)]; n integer; effect jsonb; begin
 perform ml_private.need(d is not null,'卡牌不在阶段三牌池');n:=case when d->>'randomCost'='true' then random_cost else (d->>'cost')::int end;
 perform ml_private.need(n is not null and n>=0,'请先锁定该实体牌的随机费用');
 effect:=jsonb_build_object('origin','card','actor',a,'faction',p->'faction','roleModifiers','[]'::jsonb);
 if n>0 and ((p->>'character'='character-006' and ml_private.version_catalog('web-v0.1.5')#>array['sourceCatalog','cards',d->>'id','tags'] ? '帝汶') or (p->>'character'='character-048' and d->>'id' in ('basic-054','basic-063','basic-066','basic-067','basic-071','basic-072')) or s#>>array['stage3','jjFree',a::text]='true') then
 n:=0;effect:=jsonb_set(effect,'{roleModifiers}',jsonb_build_array(jsonb_build_object('actor',a,'kind','cost')));end if;
 return jsonb_build_object('cost',n,'effect',effect);
end $$;
create or replace function ml_private.stage3_gain_ap(s jsonb,a integer,amount integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a; collector integer; taken integer:=0; result jsonb; begin
 perform ml_private.need(amount>=0,'新增AP必须为非负整数');
 if (p->>'hp')::int<=0 then return s||jsonb_build_object('_gain',jsonb_build_object('gained',0,'collector',null,'taken',0));end if;
 select (q->>'seat')::int into collector from ml_private.arr(s->'players') q where (q->>'hp')::int>0 and q->>'character'='character-043' and (q->>'seat')::int<>a and ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',q->'seat','roleModifiers','[]'::jsonb),a,p->>'character') limit 1;
 if collector is not null then taken:=least(amount,greatest(0,(p->>'ap')::int+amount-7));end if;
 s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((p->>'ap')::int+amount-taken));
 if collector is not null then s:=jsonb_set(s,array['players',collector::text,'ap'],to_jsonb((s#>>array['players',collector::text,'ap'])::int+taken));end if;
 return s||jsonb_build_object('_gain',jsonb_build_object('gained',amount-taken,'collector',case when taken>0 then collector else null end,'taken',taken));
end $$;
create or replace function ml_private.stage3_healing(s jsonb,a integer,amount integer,food boolean default false) returns integer language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a; begin
 if (p->>'hp')::int<=0 or amount<=0 or (food and p->>'character'='character-027') then return 0;end if;
 if ml_private.stage3_equipped(s,a,'basic-072') then return (p->>'maxHp')::int-(p->>'hp')::int;end if;
 return least(amount,(p->>'maxHp')::int-(p->>'hp')::int);
end $$;
create or replace function ml_private.stage3_overflow(s jsonb,action_order jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare collector integer; a jsonb; p jsonb; n integer; result jsonb:='[]'; begin
 select (q->>'seat')::int into collector from ml_private.arr(s->'players') q where (q->>'hp')::int>0 and q->>'character'='character-043' limit 1;if collector is null then return result;end if;
 for a in select * from ml_private.arr(action_order) loop p:=s->'players'->(a#>>'{}')::int;n:=jsonb_array_length(p->'hand')-(p->>'hp')::int;
 if (p->>'hp')::int>0 and (a#>>'{}')::int<>collector and n>0 and ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',collector,'roleModifiers','[]'::jsonb),(a#>>'{}')::int,p->>'character') then result:=result||jsonb_build_array(jsonb_build_object('actor',a,'count',n,'collector',collector));end if;end loop;return result;
end $$;
create or replace function ml_private.stage3_transfer_overflow(s jsonb,a integer,collector integer,cards jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare due jsonb; remaining jsonb; begin
 select x into due from ml_private.arr(ml_private.stage3_overflow(s,jsonb_build_array(a))) x where (x->>'collector')::int=collector;
 perform ml_private.need(due is not null and jsonb_array_length(cards)=(due->>'count')::int and (select count(distinct x) from ml_private.arr(cards) x)=jsonb_array_length(cards) and s#>array['players',a::text,'hand'] @> cards,'超限转交牌不合法');
 select coalesce(jsonb_agg(x),'[]') into remaining from ml_private.arr(s#>array['players',a::text,'hand']) x where not (cards @> jsonb_build_array(x));
 s:=jsonb_set(s,array['players',a::text,'hand'],remaining);return jsonb_set(s,array['players',collector::text,'hand'],(s#>array['players',collector::text,'hand'])||cards);
end $$;
create or replace function ml_private.stage3_death(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare r jsonb:=s->'stage3'; c jsonb; locks jsonb; begin
 r:=jsonb_set(r,array['deathTurns',a::text],r->'turn');r:=jsonb_set(r,array['jjFree',a::text],'false');r:=jsonb_set(r,array['jjExposed',a::text],'false');
 for c in select * from ml_private.arr(r#>array['equipment',a::text]) loop s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(c));r:=jsonb_set(r,'{equipmentSources}',(r->'equipmentSources')-(c#>>'{}'));end loop;
 r:=jsonb_set(r,array['equipment',a::text],'[]');select coalesce(jsonb_agg(x),'[]') into locks from ml_private.arr(r->'horseLocks') x where (x#>>'{}')::int<>a;
 r:=jsonb_set(r,'{horseLocks}',locks);r:=jsonb_set(r,'{horseSources}',(r->'horseSources')-a::text);return jsonb_set(s,'{stage3}',r);
end $$;
create or replace function ml_private.stage3_revival_cells(s jsonb,a integer,farm_closed boolean) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a; region text; result jsonb; begin
 if (p->>'hp')::int>0 or s#>array['stage3','deathTurns',a::text]='null'::jsonb or (s#>>'{stage3,completedTurn}')::int>(s#>>array['stage3','deathTurns',a::text])::int then return '[]';end if;
 region:=ml_private.stage3_content()#>>array['characters',p->>'character','spawnRegion'];
 select coalesce(jsonb_agg(c->'id' order by ord),'[]') into result from jsonb_array_elements(ml_private.runtime_data('web-v0.1.5','cells')) with ordinality t(c,ord) where c->>'region'=region and not (farm_closed and region='高唐农场') and not exists(select 1 from ml_private.arr(s->'players') q where (q->>'hp')::int>0 and q->>'cell'=c->>'id');return result;
end $$;
create or replace function ml_private.stage3_revive(s jsonb,a integer,cell text,farm_closed boolean) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ begin
 perform ml_private.need(ml_private.stage3_revival_cells(s,a,farm_closed) ? cell,'复活已过期或出生地区没有合法空格');
 s:=jsonb_set(s,array['players',a::text],(s->'players'->a)||jsonb_build_object('hp',1,'ap',0,'shield',0,'hand','[]'::jsonb,'cell',cell,'eliminated',null));return jsonb_set(s,array['stage3','deathTurns',a::text],'null');
end $$;
create or replace function ml_private.stage3_lock_cost(s jsonb,a integer,card text,rolled integer) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare prior jsonb:=s#>array['stage3','costLocks',card]; begin
 perform ml_private.need(split_part(card,'#',1)='basic-037' and s#>array['players',a::text,'hand'] ? card,'手中没有紫檀木');
 if prior->'turn'=s#>'{stage3,turn}' then return s||jsonb_build_object('_cost',prior->'cost');end if;
 perform ml_private.need(rolled between 1 and 6,'复活费用骰子必须为1—6');s:=jsonb_set(s,array['stage3','costLocks',card],jsonb_build_object('turn',s#>'{stage3,turn}','cost',rolled));return s||jsonb_build_object('_cost',rolled);
end $$;
create or replace function ml_private.stage3_equipment_options(s jsonb,a integer,card text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare definition text:=split_part(card,'#',1); d jsonb:=ml_private.stage3_content()#>array['cards',definition]; cards jsonb; begin
 if d is null or d->>'type'<>'equipment' or ml_private.stage3_equipped(s,a,definition) then return '{"allowed":false,"required":false,"cards":[]}'::jsonb;end if;
 select coalesce(jsonb_agg(c),'[]') into cards from ml_private.arr(s#>array['stage3','equipment',a::text]) c where ml_private.stage3_content()#>>array['cards',split_part(c#>>'{}','#',1),'slot']=d->>'slot';
 return jsonb_build_object('allowed',true,'required',jsonb_array_length(cards)>=case when d->>'slot'='hand' then 2 else 1 end,'cards',cards);
end $$;
create or replace function ml_private.stage3_install(s jsonb,a integer,card text,source jsonb,replacement text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare options jsonb:=ml_private.stage3_equipment_options(s,a,card); gear jsonb:=s#>array['stage3','equipment',a::text]; begin
 perform ml_private.need(options->>'allowed'='true' and (options->>'required'<>'true' or replacement is not null) and (replacement is null or options->'cards' ? replacement),'装备同名或替换对象不合法');
 if replacement is not null then gear:=gear-replacement;s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(replacement));s:=jsonb_set(s,'{stage3,equipmentSources}',(s#>'{stage3,equipmentSources}')-replacement);end if;
 s:=jsonb_set(s,array['stage3','equipment',a::text],gear||jsonb_build_array(card));return jsonb_set(s,array['stage3','equipmentSources',card],source);
end $$;
create or replace function ml_private.stage3_bread(s jsonb,a integer,target integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ begin
 perform ml_private.need(ml_private.stage3_equipped(s,a,'basic-054') and (s#>>array['stage3','starts',a::text])::int>=(s#>>array['stage3','breadReadyAt',a::text])::int and a<>target and (s#>>array['players',target::text,'hp'])::int>0,'面包技能暂不可用或目标不合法');
 s:=jsonb_set(s,array['stage3','breadReadyAt',a::text],to_jsonb((s#>>array['stage3','starts',a::text])::int+2));return jsonb_set(s,array['stage3','breadPending',target::text],'true');
end $$;
create or replace function ml_private.stage3_combo_teams(s jsonb) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(team),'[]') from (select distinct p->'team' team from ml_private.arr(s->'players') p where (p->>'hp')::int>0 and ((p->>'character'='character-010' and s#>array['stage3','combos',p->>'team'] @> '["basic-015","basic-016","basic-037"]'::jsonb) or (p->>'character'='character-045' and s#>array['stage3','combos',p->>'team'] @> '["basic-046","basic-041","basic-047"]'::jsonb))) q $$;

create or replace function ml_private.stage3_card_allowed(s jsonb,target integer,card text,effect jsonb) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->target; tags jsonb; begin
 if p is null or not ml_private.character_effect_allowed(effect,target,p->>'character') then return false;end if;
 if p->>'character'='character-006' and (effect->>'actor')::int<>target and effect->>'faction'<>'机械猴子' then return false;end if;
 tags:=ml_private.version_catalog('web-v0.1.5')#>array['sourceCatalog','cards',split_part(card,'#',1),'tags'];
 if p->>'character'='character-005' and tags ? '建民' then return false;end if;return true;
end $$;
create or replace function ml_private.stage3_role_targets(s jsonb,a integer,origin text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(p->'seat' order by ord),'[]') from jsonb_array_elements(s->'players') with ordinality t(p,ord) where (p->>'hp')::int>0 and (p->>'seat')::int<>a and ml_private.character_effect_allowed(jsonb_build_object('origin',origin,'actor',a,'roleModifiers','[]'::jsonb),(p->>'seat')::int,p->>'character') $$;
create or replace function ml_private.stage3_jj_targets(s jsonb,a integer,card text,targets jsonb,effect jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare d jsonb:=ml_private.stage3_content()#>array['cards',split_part(card,'#',1)]; jj integer; begin
 if d is null or d->>'type'='equipment' or (d->>'type'='response' and not (d->>'id'='basic-002' and s#>>array['players',a::text,'character']='character-023')) or d->>'id'='basic-037' then return jsonb_build_object('targets',targets,'effect',effect);end if;
 select (p->>'seat')::int into jj from ml_private.arr(s->'players') p where (p->>'hp')::int>0 and p->>'character'='character-003' and (p->>'seat')::int<>a and s#>>array['stage3','jjExposed',p->>'seat']='true' limit 1;
 if jj is null or targets @> jsonb_build_array(jj) then return jsonb_build_object('targets',targets,'effect',effect);end if;
 effect:=jsonb_set(effect,'{roleModifiers}',(effect->'roleModifiers')||jsonb_build_array(jsonb_build_object('actor',jj,'kind','target')));return jsonb_build_object('targets',targets||jsonb_build_array(jj),'effect',effect);
end $$;
create or replace function ml_private.stage3_same_near(a text,b text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.runtime_data('web-v0.1.5','map')#>>array[a,'region']=ml_private.runtime_data('web-v0.1.5','map')#>>array[b,'region'] or ml_private.neighbor_for_version('web-v0.1.5',ml_private.runtime_data('web-v0.1.5','map')#>>array[a,'region'],ml_private.runtime_data('web-v0.1.5','map')#>>array[b,'region']) $$;
create or replace function ml_private.stage3_monkey_targets(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a; boost boolean:=p->>'character'='character-045'; result jsonb; begin
 if not boost and ml_private.runtime_data('web-v0.1.5','map')#>>array[p->>'cell','region'] in ('教学楼','秀松苑') then return '[]';end if;
 select coalesce(jsonb_agg(q->'seat' order by ord),'[]') into result from jsonb_array_elements(s->'players') with ordinality t(q,ord) where (q->>'hp')::int>0 and (q->>'seat')::int<>a and (s->>'mode'='ffa' or q->'team'<>p->'team') and not (q->>'character'='character-027' and jsonb_array_length(q->'hand')=1) and (boost or ml_private.stage3_same_near(p->>'cell',q->>'cell'));return result;
end $$;
create or replace function ml_private.stage3_ledger_candidates(s jsonb,xie integer,card_user integer,participants jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->xie; result jsonb:='[]'; a jsonb; q jsonb; begin
 if (p->>'hp')::int<=0 or p->>'character'<>'character-044' then return result;end if;
 for a in select * from ml_private.arr(jsonb_build_array(card_user)||participants) loop q:=s->'players'->(a#>>'{}')::int;
 if (a#>>'{}')::int<>xie and (q->>'hp')::int>0 and not (result @> jsonb_build_array(a)) and ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',xie,'roleModifiers','[]'::jsonb),(a#>>'{}')::int,q->>'character') and (ml_private.runtime_data('web-v0.1.5','map')#>>array[q->>'cell','region']=ml_private.runtime_data('web-v0.1.5','map')#>>array[p->>'cell','region'] or ml_private.distance_for_version('web-v0.1.5',p->>'cell',q->>'cell')=1) then result:=result||jsonb_build_array(a);end if;end loop;return result;
end $$;
create or replace function ml_private.stage3_east_targets(s jsonb,a integer,kind text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(t order by ord),'[]') from jsonb_array_elements(ml_private.stage3_role_targets(s,a,'role-active')) with ordinality x(t,ord) where kind='draw' or jsonb_array_length(s#>array['players',t#>>'{}','hand'])>0 $$;
create or replace function ml_private.stage3_assam_targets(s jsonb,a integer) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(p->'seat' order by ord),'[]') from jsonb_array_elements(s->'players') with ordinality t(p,ord) where (p->>'hp')::int>0 and ((p->>'seat')::int=a or (s->>'mode'='team' and p->'team'=s#>array['players',a::text,'team'] and ml_private.stage3_same_near(p->>'cell',s#>>array['players',a::text,'cell']))) $$;
create or replace function ml_private.stage3_direction_cell(cell text,direction text) returns text language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=ml_private.runtime_data('web-v0.1.5','map')->cell; result text; begin
 if p is null then return null;end if;
 result:='r'||((p->>'row')::int+case direction when 'up' then -1 when 'down' then 1 else 0 end)::text||'c'||((p->>'col')::int+case direction when 'left' then -1 when 'right' then 1 else 0 end)::text;
 return case when ml_private.runtime_data('web-v0.1.5','map') ? result then result else null end;
end $$;
create or replace function ml_private.stage3_west_direction(declared text,die integer) returns text language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ begin
 perform ml_private.need(declared in ('up','right','down','left') and die between 1 and 6,'西帝汶方向或判定无效');
 return case when die%2=0 then declared else case declared when 'up' then 'down' when 'right' then 'left' when 'down' then 'up' else 'right' end end;
end $$;
create or replace function ml_private.stage3_west_step(from_cell text,to_cell text,direction text) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare a jsonb:=ml_private.runtime_data('web-v0.1.5','map')->from_cell; b jsonb:=ml_private.runtime_data('web-v0.1.5','map')->to_cell; begin
 if a is null or b is null then return false;end if;
 return case direction when 'up' then a->'col'=b->'col' and (b->>'row')::int<(a->>'row')::int when 'down' then a->'col'=b->'col' and (b->>'row')::int>(a->>'row')::int when 'left' then a->'row'=b->'row' and (b->>'col')::int<(a->>'col')::int else a->'row'=b->'row' and (b->>'col')::int>(a->>'col')::int end;
end $$;
create or replace function ml_private.stage3_empty_entry(s jsonb,a integer,cell text,ignored jsonb default '[]') returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(ml_private.runtime_data('web-v0.1.5','map') ? cell and not (coalesce((s->>'farmClosed')::boolean,false) and ml_private.runtime_data('web-v0.1.5','map')#>>array[cell,'region']='高唐农场') and ml_private.stage3_can_enter(s,a,cell) and not exists(select 1 from ml_private.arr(s->'players') p where (p->>'hp')::int>0 and p->>'cell'=cell and not (ignored @> jsonb_build_array(p->'seat'))),false) $$;
create or replace function ml_private.stage3_elbow_cells(s jsonb,card_user integer,target integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare d text; cell text; result jsonb:='[]'; begin
 if (s#>>array['players',target::text,'hp'])::int<=0 then return result;end if;
 foreach d in array array['up','right','down','left'] loop cell:=ml_private.stage3_direction_cell(s#>>array['players',target::text,'cell'],d);if cell is not null and ml_private.stage3_empty_entry(s,target,cell,jsonb_build_array(target)) then result:=result||jsonb_build_array(cell);end if;end loop;return result;
end $$;
create or replace function ml_private.stage3_elbow_targets(s jsonb,a integer,converted boolean) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(t order by ord),'[]') from jsonb_array_elements(ml_private.stage3_role_targets(s,a,case when converted then 'role-active' else 'role-locked' end)) with ordinality x(t,ord) where s#>>array['players',a::text,'character']='character-023' and ml_private.runtime_data('web-v0.1.5','map')#>>array[s#>>array['players',a::text,'cell'],'region']=ml_private.runtime_data('web-v0.1.5','map')#>>array[s#>>array['players',t#>>'{}','cell'],'region'] $$;
create or replace function ml_private.stage3_collision_path(s jsonb,card_user integer,target integer,direction text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare result jsonb:='[]'; at_cell text:=s#>>array['players',target::text,'cell']; next_cell text; begin
 if s#>>array['players',card_user::text,'character']<>'character-045' or not ml_private.character_effect_allowed(jsonb_build_object('origin','role-locked','actor',card_user,'roleModifiers','[]'::jsonb),target,s#>>array['players',target::text,'character']) then return result;end if;
 loop next_cell:=ml_private.stage3_direction_cell(at_cell,direction);exit when next_cell is null or not ml_private.stage3_empty_entry(s,target,next_cell,jsonb_build_array(target));result:=result||jsonb_build_array(next_cell);at_cell:=next_cell;exit when ml_private.runtime_data('web-v0.1.5','map')#>>array[at_cell,'region']='山洞';end loop;return result;
end $$;
create or replace function ml_private.stage3_carry_candidates(s jsonb,west integer,origin text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(jsonb_build_object('actor',t,'origin',s#>array['players',t#>>'{}','cell']) order by ord),'[]') from jsonb_array_elements(ml_private.stage3_role_targets(s,west,'role-active')) with ordinality x(t,ord) where s#>>array['players',west::text,'character']='character-040' and ml_private.distance_for_version('web-v0.1.5',origin,s#>>array['players',t#>>'{}','cell'])=1 $$;
create or replace function ml_private.stage3_carry_destinations(s jsonb,west integer,passenger integer,initial text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare result jsonb; begin
 if (s#>>array['players',west::text,'hp'])::int<=0 or (s#>>array['players',passenger::text,'hp'])::int<=0 or s#>>array['players',passenger::text,'cell']<>initial or not (ml_private.stage3_role_targets(s,west,'role-active') @> jsonb_build_array(passenger)) then return '[]';end if;
 select coalesce(jsonb_agg(c->'id' order by ord),'[]') into result from jsonb_array_elements(ml_private.runtime_data('web-v0.1.5','cells')) with ordinality x(c,ord) where ml_private.distance_for_version('web-v0.1.5',s#>>array['players',west::text,'cell'],c->>'id')=1 and ml_private.stage3_empty_entry(s,passenger,c->>'id');return result;
end $$;

create or replace function ml_private.stage3_begin_card(s jsonb,a integer,card text,definition text,targets jsonb,effect jsonb,at double precision,response_to integer default null) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare flow jsonb:=s->'cardStack'; parent jsonb:=(flow->'stack')->-1; easy integer; pending jsonb;begin
 perform ml_private.need(at>=0 and at<'Infinity'::double precision,'卡牌窗口时钟无效');
 perform ml_private.need(s->'resolving' ? card and not exists(select 1 from ml_private.arr(flow->'stack') c where c->>'card'=card),'待结算实体牌无效');
 if response_to is not null then perform ml_private.need((parent->>'serial')::int=response_to and parent->'counter'='null'::jsonb,'父牌尚不可响应');end if;
 select (p->>'seat')::int into easy from ml_private.arr(s->'players') p where (p->>'hp')::int>0 and p->>'character'='character-002' and (p->>'ap')::int>=1 limit 1;
 pending:=jsonb_build_object('serial',(flow->>'serial')::int+1,'actor',a,'card',card,'definition',definition,'targets',targets,'effect',effect,'cancelled','[]'::jsonb,'elbows','[]'::jsonb,'countered',false,'counter',case when easy is null then null else jsonb_build_object('actor',easy,'deadline',at+10000) end,'responseTo',response_to,'responseActor',case when response_to is null then null else a end);
 return jsonb_set(s,'{cardStack}',jsonb_build_object('serial',pending->'serial','stack',(flow->'stack')||jsonb_build_array(pending)));
end $$;
create or replace function ml_private.stage3_counter_card(s jsonb,a integer,accept boolean,at double precision,rolled integer) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare stack jsonb:=s#>'{cardStack,stack}'; position text:=(jsonb_array_length(stack)-1)::text; pending jsonb:=stack->-1; counter_window jsonb:=pending->'counter'; p jsonb:=s->'players'->a; result jsonb; begin
 perform ml_private.need(counter_window<>'null'::jsonb and (counter_window->>'actor')::int=a,'不是当前反制者');perform ml_private.need(at<=(counter_window->>'deadline')::double precision,'反制窗口已过期');
 if not accept or at=(counter_window->>'deadline')::double precision then pending:=jsonb_set(pending,'{counter}','null');result:='{"attempted":false,"roll":null,"cancelled":false,"done":true}';
 else
  perform ml_private.need((p->>'hp')::int>0 and p->>'character'='character-002' and (p->>'ap')::int>=1,'反制费用不足');perform ml_private.need(rolled between 1 and 6,'反制骰子无效');
  s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((p->>'ap')::int-1));pending:=jsonb_set(pending,'{countered}',to_jsonb(rolled>=3));
  if rolled>=3 or (p->>'ap')::int=1 then pending:=jsonb_set(pending,'{counter}','null');end if;
  result:=jsonb_build_object('attempted',true,'roll',rolled,'cancelled',pending->'countered','done',pending->'counter'='null'::jsonb);
 end if;
 return jsonb_set(s,array['cardStack','stack',position],pending)||jsonb_build_object('_counterResult',result);
end $$;
create or replace function ml_private.stage3_close_card(s jsonb) returns jsonb language plpgsql immutable
set search_path=pg_catalog,ml_private as $$ declare stack jsonb:=s#>'{cardStack,stack}'; pending jsonb:=stack->-1; parent jsonb:=stack->-2; index_text text; a jsonb;begin
 perform ml_private.need(pending is not null,'没有待结算卡牌');perform ml_private.need(pending->'counter'='null'::jsonb,'反制尚未结束');
 if pending->'responseTo'<>'null'::jsonb then
  perform ml_private.need(parent->'serial'=pending->'responseTo','响应父牌已过期');
  if pending->>'countered'<>'true' then a:=pending->'responseActor';if not (parent->'cancelled' @> jsonb_build_array(a)) then parent:=jsonb_set(parent,'{cancelled}',(parent->'cancelled')||jsonb_build_array(a));end if;if pending->>'definition'='basic-002' then parent:=jsonb_set(parent,'{elbows}',(parent->'elbows')||jsonb_build_array(a));end if;stack:=jsonb_set(stack,array[(jsonb_array_length(stack)-2)::text],parent);end if;
 end if;
 s:=jsonb_set(s,'{cardStack,stack}',stack-(jsonb_array_length(stack)-1));s:=jsonb_set(s,'{resolving}',(s->'resolving')-(pending->>'card'));return jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(pending->'card'))||jsonb_build_object('_closed',pending);
end $$;

revoke all on all functions in schema ml_private from public;
DO $$ declare r text; begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;
