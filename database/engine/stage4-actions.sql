create or replace function ml_private.stage4_equipment_skill(s jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare a integer:=(cmd->>'actor')::int;p jsonb:=s->'players'->a;kind text:=cmd->>'kind';card text;watch jsonb;cell text:=cmd->>'cell';target integer:=(cmd->>'target')::int;cards jsonb:=coalesce(cmd->'cards','[]');cost integer;begin
 if kind='terrain' then perform ml_private.need(ml_private.stage4_on_board(s,a) and ml_private.stage4_combat_gear(s,a,'basic-069') is not null and jsonb_typeof(cmd->'accept')='boolean','唐车设置不可用或选项无效');s:=jsonb_set(s,array['stage4','terrainIgnore',a::text],cmd->'accept');return ml_private.emit(s,'terrain','S'||(a+1)||' 唐车'||case when cmd->>'accept'='true' then '忽略' else '恢复' end||'地点效果')||jsonb_build_object('_equipmentSkill',true);end if;
 if kind not in ('watch','flight','gift') then return s||jsonb_build_object('_equipmentSkill',false);end if;
 perform ml_private.need(kind='gift' or not ml_private.stage3_mount_blocked(s,a),'当前不能主动位移或发动该坐骑');
 if kind='watch' then
  card:=ml_private.stage4_combat_gear(s,a,'basic-060');watch:=s#>array['stage4','watches',card];
  perform ml_private.need(card is not null and watch->>'previous' is not null and watch->'usedTurn' is distinct from s#>'{stage3,turn}','手表尚无上一开始格或本回合已使用');
  perform ml_private.need(ml_private.stage4_board_empty(s,a,watch->>'previous',jsonb_build_array(a)) and watch->>'previous'<>p->>'cell','手表原格当前不可进入');
  s:=jsonb_set(s,array['stage4','watches',card,'usedTurn'],s#>'{stage3,turn}');s:=ml_private.stage3_relocate(s,a,watch->>'previous',true);s:=jsonb_set(s,'{queue}',(s->'queue')||(s->'_relocationTasks'));s:=ml_private.emit(s-'_relocationTasks','skill','S'||(a+1)||' 手表回到上次个人开始格');
 elsif kind='flight' then
  perform ml_private.need(ml_private.stage4_combat_gear(s,a,'basic-074') is not null and p->>'moved'<>'true','子腾未装备或基础移动次数已用');
  perform ml_private.need(cell is not null and cell<>p->>'cell' and ml_private.stage4_board_empty(s,a,cell,jsonb_build_array(a)),'请选择合法传送空格');
  cost:=ml_private.stage3_fixed_cost(s,a,ml_private.stage4_location_move_cost(s,a))+1;perform ml_private.need((p->>'ap')::int>=cost,'子腾需要'||cost||'AP');
  s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((p->>'ap')::int-cost));s:=jsonb_set(s,array['stage3','basicUsed',a::text],to_jsonb((s#>>array['stage3','basicUsed',a::text])::int+1));s:=jsonb_set(s,array['players',a::text,'moved'],to_jsonb((s#>>array['stage3','basicUsed',a::text])::int>=case when s#>>array['stage3','doubleMove',a::text]='true' then 2 else 1 end));
  s:=ml_private.stage3_relocate(s,a,cell,true);s:=jsonb_set(s,'{queue}',(s->'queue')||(s->'_relocationTasks'));s:=ml_private.emit(s-'_relocationTasks','cost','S'||(a+1)||' 子腾传送支付'||cost||'AP，不掷移动骰');
 else
  perform ml_private.need(ml_private.stage4_combat_gear(s,a,'basic-075') is not null,'未装备快速车');
  perform ml_private.need(target<>a and ml_private.stage4_on_board(s,target) and jsonb_array_length(cards)>0 and (select count(distinct v) from ml_private.arr(cards) v)=jsonb_array_length(cards) and p->'hand' @> cards,'送牌对象或实体手牌不合法');
  s:=jsonb_set(s,array['players',a::text,'hand'],(select coalesce(jsonb_agg(v order by ord),'[]') from jsonb_array_elements(p->'hand') with ordinality q(v,ord) where not(cards @> jsonb_build_array(v))));s:=jsonb_set(s,array['players',target::text,'hand'],(s#>array['players',target::text,'hand'])||cards);s:=ml_private.emit(s,'transfer','S'||(a+1)||' 快速车送S'||(target+1)||' '||jsonb_array_length(cards)||'张手牌');
 end if;return s||jsonb_build_object('_equipmentSkill',true);
end $$;
