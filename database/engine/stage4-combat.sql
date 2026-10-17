create or replace function ml_private.stage4_combat_gear(s jsonb,a integer,definition text) returns text language sql stable
set search_path=pg_catalog,ml_private as $$ select v#>>'{}' from jsonb_array_elements(s#>array['stage3','equipment',a::text]) with ordinality q(v,ord) where ml_private.stage4_equipment_definition(s,v#>>'{}')=definition and ml_private.stage3_card_allowed(s,a,v#>>'{}',(s#>array['stage3','equipmentSources',v#>>'{}'])||jsonb_build_object('origin','equipment')) order by ord limit 1 $$;
create or replace function ml_private.stage4_gear_source(s jsonb,a integer,card text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select (s#>array['stage3','equipmentSources',card])||jsonb_build_object('actor',a,'faction',s#>array['players',a::text,'faction'],'origin','equipment') $$;
create or replace function ml_private.stage4_gear_permitted(s jsonb,a integer,target integer,card text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.stage4_on_board(s,target) and ml_private.stage3_card_allowed(s,target,ml_private.stage4_equipment_definition(s,card),ml_private.stage4_gear_source(s,a,card)) $$;
create or replace function ml_private.stage4_attack_effect(s jsonb,a integer,card text,effect jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare gear text;definition text;mods jsonb:=effect->'roleModifiers';begin
 if s->>'version'<>'web-v0.1.7' then return effect;end if;
 for gear in select v#>>'{}' from ml_private.arr(s#>array['stage3','equipment',a::text]) v loop definition:=ml_private.stage4_equipment_definition(s,gear);
  if (ml_private.rule_card(s,card)->>'type'='attack' and (definition in ('basic-053','basic-058') or definition='basic-056' and split_part(card,'#',1)='basic-009')) or ml_private.stage4_ignore_location(s,a) and definition='basic-069' then mods:=mods||coalesce(s#>array['stage3','equipmentSources',gear,'roleModifiers'],'[]');end if;
 end loop;return jsonb_set(effect,'{roleModifiers}',mods);
end $$;
create or replace function ml_private.stage4_card_range(s jsonb,a integer,d jsonb,cell text) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare origin text:=ml_private.game_data(s,'map')#>>array[s#>>array['players',a::text,'cell'],'region'];dest text:=ml_private.game_data(s,'map')#>>array[cell,'region'];plus boolean:=ml_private.stage4_combat_gear(s,a,'basic-058') is not null;r text;begin
 if d->>'range'='global' or origin=dest then return true;end if;
 if (d->>'range'='adjacent' or plus) and ml_private.neighbor_for_version(s->>'version',origin,dest) then return true;end if;
 if plus and d->>'range'='adjacent' then for r in select jsonb_object_keys(ml_private.version_catalog(s->>'version')#>'{mapDefinition,regions}') loop if ml_private.neighbor_for_version(s->>'version',origin,r) and ml_private.neighbor_for_version(s->>'version',r,dest) then return true;end if;end loop;end if;return false;
end $$;
create or replace function ml_private.stage4_card_attack(s jsonb,h jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s#>'{cardStack,stack,-1}';begin
 if c->'actor'=h->'source' and h->>'category'='attack' and ml_private.rule_card(s,c->>'definition')->>'type'='attack' then return c;end if;return null;
end $$;
create or replace function ml_private.stage4_prepare_hit(s jsonb,h jsonb,environment boolean) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=ml_private.stage4_card_attack(s,h);a integer:=(h->>'target')::int;guard text;remaining integer;begin
 if c is not null and coalesce(h->>'extra','false')<>'true' and h->'source'<>'null'::jsonb and ml_private.stage4_combat_gear(s,(h->>'source')::int,'basic-053') is not null then h:=h||jsonb_build_object('trueDamage',true);end if;
 guard:=ml_private.stage4_combat_gear(s,a,'basic-070');
 if guard is not null and not environment and h->>'category'='attack' and coalesce(h->>'directHp','false')<>'true' and (h->>'amount')::int>0 then
  remaining:=coalesce((s#>>array['stage4','durability',guard])::int,2)-1;s:=jsonb_set(s,array['stage4','durability',guard],to_jsonb(remaining));s:=ml_private.emit(s,'block','S'||(a+1)||' 无一骑抵挡本次普通攻击，剩余'||remaining||'次');
  if remaining=0 then s:=jsonb_set(s,array['stage3','equipment',a::text],(s#>array['stage3','equipment',a::text])-guard);s:=jsonb_set(s,'{stage3,equipmentSources}',(s#>'{stage3,equipmentSources}')-guard);s:=jsonb_set(s,'{stage4,copies}',(s#>'{stage4,copies}')-guard);s:=jsonb_set(s,'{stage4,durability}',(s#>'{stage4,durability}')-guard);s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(guard));s:=ml_private.emit(s,'break','S'||(a+1)||' 无一骑损坏');end if;return s||jsonb_build_object('_hit',null);
 end if;
 if guard is not null and c->>'definition'='basic-006' then return s||jsonb_build_object('_hit',null);end if;return s||jsonb_build_object('_hit',h);
end $$;
create or replace function ml_private.stage4_gear_mark(s jsonb,key text) returns jsonb language plpgsql immutable as $$ begin
 if s#>>array['stage4','gearMarks',key]='true' then return s||jsonb_build_object('_marked',false);end if;return jsonb_set(s,array['stage4','gearMarks',key],'true')||jsonb_build_object('_marked',true);
end $$;
create or replace function ml_private.stage4_after_damage(s jsonb,hits jsonb,environment boolean) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare tasks jsonb:='[]';root text:=coalesce(s#>>'{cardStack,stack,0,serial}','batch'||(s->>'batch'));h jsonb;a integer;target integer;owner integer;victim integer;pair jsonb;gear text;paid integer;attack jsonb;begin
 for h in select * from ml_private.arr(hits) loop a:=(h->>'source')::int;target:=(h->>'target')::int;
  if a is not null and a<>target then
   for pair in select * from ml_private.arr(jsonb_build_array(jsonb_build_array(a,target),jsonb_build_array(target,a))) loop owner:=(pair->>0)::int;victim:=(pair->>1)::int;
    if not ml_private.stage4_on_board(s,owner) or not ml_private.stage4_on_board(s,victim) then continue;end if;gear:=ml_private.stage4_combat_gear(s,owner,'basic-055');
    if gear is not null and ml_private.stage4_gear_permitted(s,owner,victim,gear) then s:=ml_private.stage4_gear_mark(s,root||':sugar:'||owner||':'||victim);
     if s->>'_marked'='true' then paid:=least(1,(s#>>array['players',victim::text,'ap'])::int);s:=jsonb_set(s,array['players',victim::text,'ap'],to_jsonb((s#>>array['players',victim::text,'ap'])::int-paid));s:=ml_private.emit(s,'ap','S'||(owner+1)||' 冰糖雪梨扣S'||(victim+1)||' '||paid||'AP');end if;s:=s-'_marked';
    end if;
   end loop;
  end if;
  if ml_private.stage4_on_board(s,target) and not environment and coalesce(h->>'reflected','false')<>'true' and a is not null and a<>target and ml_private.stage4_on_board(s,a) then gear:=ml_private.stage4_combat_gear(s,target,'basic-051');if gear is not null and ml_private.stage4_gear_permitted(s,target,a,gear) then tasks:=tasks||jsonb_build_array(ml_private.stage3_task('gear-reflect',jsonb_build_object('actor',target,'target',a,'card',gear)));end if;end if;
  if a is null or a=target or not ml_private.stage4_on_board(s,a) or not ml_private.stage4_on_board(s,target) then continue;end if;attack:=ml_private.stage4_card_attack(s,h);
  if attack is not null and coalesce(h->>'extra','false')<>'true' then
   gear:=ml_private.stage4_combat_gear(s,a,'basic-052');if gear is not null and (s#>>array['players',a::text,'ap'])::int>=1 and ml_private.stage4_gear_permitted(s,a,target,gear) then
    s:=ml_private.stage4_gear_mark(s,root||':chalk:'||a);if s->>'_marked'='true' then tasks:=tasks||jsonb_build_array(ml_private.stage3_task('gear-chalk',jsonb_build_object('actor',a,'target',target,'card',gear)));end if;s:=s-'_marked';end if;
   gear:=ml_private.stage4_combat_gear(s,a,'basic-062');if gear is not null and ml_private.stage4_gear_permitted(s,a,target,gear) then s:=jsonb_set(s,array['stage4','tongPending',target::text],ml_private.stage4_gear_source(s,a,gear));s:=ml_private.emit(s,'buff','S'||(target+1)||' 下个个人回合不能主动位移');end if;
  end if;
  gear:=ml_private.stage4_combat_gear(s,a,'basic-061');if gear is not null and ml_private.stage4_gear_permitted(s,a,target,gear) and coalesce(h->>'extra','false')<>'true' then s:=ml_private.stage4_gear_mark(s,root||':plant:'||a||':'||target);if s->>'_marked'='true' then tasks:=tasks||jsonb_build_array(ml_private.stage3_task('gear-plant',jsonb_build_object('actor',a,'target',target,'card',gear)));end if;s:=s-'_marked';end if;
 end loop;return s||jsonb_build_object('_gearTriggers',tasks||ml_private.stage4_reactive_injury(s,hits));
end $$;
create or replace function ml_private.stage4_combat_task(s jsonb,t jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare action text:=t->>'action';a integer:=coalesce((t->>'actor')::int,(s->>'active')::int);target integer:=(t->>'target')::int;c jsonb;cells jsonb;targets jsonb;boosted boolean;roll integer:=0;hit boolean;jobs jsonb:='[]';begin
 if action in ('gear-reflect','gear-chalk','gear-plant') then
  if not ml_private.stage4_on_board(s,a) or not ml_private.stage4_on_board(s,target) or not(s#>array['stage3','equipment',a::text] ? (t->>'card')) or not ml_private.stage4_gear_permitted(s,a,target,t->>'card') or action='gear-chalk' and (s#>>array['players',a::text,'ap'])::int<1 then return s||jsonb_build_object('_combatHandled',true);end if;
  if action='gear-plant' then select coalesce(jsonb_agg(v->'id' order by ord),'[]') into cells from jsonb_array_elements(ml_private.game_data(s,'cells')) with ordinality q(v,ord) where v->>'region' in ('云上学府','高唐农场') and ml_private.stage4_board_empty(s,target,v->>'id',jsonb_build_array(target));end if;
  if action<>'gear-plant' or jsonb_array_length(cells)>0 then s:=ml_private.select_choice(s,action,a,at,jsonb_build_object('source',target,'data',jsonb_build_object('card',t->'card'))||case when cells is not null then jsonb_build_object('cells',cells) else '{}'::jsonb end);end if;return s||jsonb_build_object('_combatHandled',true);
 elsif action='gear-cloak' then
  c:=s#>'{cardStack,stack,-1}';if c->'cancelled' @> jsonb_build_array(target) or not ml_private.stage4_on_board(s,target) or ml_private.stage4_combat_gear(s,target,'basic-049') is null then return s||jsonb_build_object('_combatHandled',true);end if;
  s:=ml_private.select_choice(s,'gear-cloak',target,at,jsonb_build_object('source',c->'actor','data',jsonb_build_object('serial',c->'serial')));return s||jsonb_build_object('_combatHandled',true);
 elsif action='ball-hit' then
  c:=s#>'{cardStack,stack,-1}';if not(c->'cancelled' @> jsonb_build_array(target)) and ml_private.stage4_on_board(s,target) and ml_private.stage3_card_allowed(s,target,c->>'definition',c->'effect') then s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',target,'amount',t#>'{data,amount}','source',c->'actor','category','attack')));s:=ml_private.stage3_prepend(s,s->'_triggers');s:=s-'_triggers';end if;return s||jsonb_build_object('_combatHandled',true);
 end if;
 if action<>'effect' or s#>>'{cardStack,stack,-1,definition}'<>'basic-009' then return s||jsonb_build_object('_combatHandled',false);end if;
 c:=s#>'{cardStack,stack,-1}';a:=(c->>'actor')::int;s:=ml_private.stage3_record_combo(s,a,c->>'definition');targets:=ml_private.stage4_map_targets(s,c);boosted:=ml_private.stage4_combat_gear(s,a,'basic-056') is not null;
 if jsonb_array_length(targets)>0 and coalesce(c#>>'{stage4,dodge}','false')<>'true' then s:=ml_private.die(s,'躲避球');roll:=(s->>'_roll')::int;s:=s-'_roll';end if;
 hit:=coalesce(c#>>'{stage4,dodge}','false')='true' or jsonb_array_length(targets)>0 and (case when boosted then roll<=5 else roll>=4 end);
 if hit then for target in select (v#>>'{}')::int from ml_private.arr(s->'order') v where targets @> jsonb_build_array(v) loop
  if not boosted and ml_private.stage4_combat_gear(s,target,'basic-049') is not null then jobs:=jobs||jsonb_build_array(ml_private.stage3_task('gear-cloak',jsonb_build_object('target',target,'serial',c->'serial')));end if;jobs:=jobs||jsonb_build_array(ml_private.stage3_task('ball-hit',jsonb_build_object('target',target,'serial',c->'serial','data',jsonb_build_object('amount',case when c#>>'{stage4,dodge}'='true' then 2 else 1 end))));
 end loop;end if;s:=ml_private.stage3_prepend(s,jobs||jsonb_build_array(ml_private.stage3_task('cleanup',jsonb_build_object('serial',c->'serial'))));return s||jsonb_build_object('_combatHandled',true);
end $$;
create or replace function ml_private.stage4_combat_choose(s jsonb,cmd jsonb,at double precision,timeout boolean) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s->'choice';a integer:=(c->>'actor')::int;target integer:=(c->>'source')::int;card text:=c#>>'{data,card}';pending jsonb;idx text;remaining integer;g jsonb;begin
 if timeout or not ml_private.stage4_on_board(s,a) then return s;end if;
 if c->>'kind'='gear-cloak' then
  if cmd->>'accept'='true' and ml_private.stage4_combat_gear(s,a,'basic-049') is not null then s:=ml_private.die(s,'帝汶斗篷');if (s->>'_roll')::int%2=1 then idx:=(jsonb_array_length(s#>'{cardStack,stack}')-1)::text;s:=jsonb_set(s,array['cardStack','stack',idx,'cancelled'],(s#>array['cardStack','stack',idx,'cancelled'])||jsonb_build_array(a));if s->'attack'<>'null'::jsonb and not(s#>'{attack,cancelled}' @> jsonb_build_array(a)) then s:=jsonb_set(s,'{attack,cancelled}',(s#>'{attack,cancelled}')||jsonb_build_array(a));end if;s:=ml_private.emit(s,'block','S'||(a+1)||' 帝汶斗篷取消躲避球全部效果');end if;s:=s-'_roll';end if;return s;
 end if;
 if not(s#>array['stage3','equipment',a::text] ? card) or not ml_private.stage4_on_board(s,target) or not ml_private.stage4_gear_permitted(s,a,target,card) then return s;end if;
 if c->>'kind'='gear-plant' then
  if cmd->>'cell' is not null then perform ml_private.need(c->'cells' ? (cmd->>'cell') and ml_private.stage4_board_empty(s,target,cmd->>'cell',jsonb_build_array(target)),'植物落点不合法');s:=ml_private.stage3_relocate(s,target,cmd->>'cell',false);s:=ml_private.stage3_prepend(s,s->'_relocationTasks');s:=s-'_relocationTasks';end if;return s;
 end if;
 if coalesce(cmd->>'accept','false')<>'true' then return s;end if;
 if c->>'kind'='gear-reflect' then
  remaining:=coalesce((s#>>array['stage4','durability',card])::int,3)-1;s:=jsonb_set(s,array['stage4','durability',card],to_jsonb(remaining));
  if remaining=0 then s:=jsonb_set(s,array['stage3','equipment',a::text],(s#>array['stage3','equipment',a::text])-card);s:=jsonb_set(s,'{stage3,equipmentSources}',(s#>'{stage3,equipmentSources}')-card);s:=jsonb_set(s,'{stage4,copies}',(s#>'{stage4,copies}')-card);s:=jsonb_set(s,'{stage4,durability}',(s#>'{stage4,durability}')-card);s:=jsonb_set(s,'{discard}',(s->'discard')||jsonb_build_array(card));s:=ml_private.emit(s,'break','S'||(a+1)||' 正装损坏');end if;
  s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',target,'amount',1,'source',a,'category','response','reflected',true)));
 else perform ml_private.need((s#>>array['players',a::text,'ap'])::int>=1,'粉笔需要1AP');s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((s#>>array['players',a::text,'ap'])::int-1));s:=ml_private.damage(s,jsonb_build_array(jsonb_build_object('target',target,'amount',1,'source',a,'category','response','extra',true)));end if;
 s:=ml_private.stage3_prepend(s,s->'_triggers');return s-'_triggers';
end $$;
