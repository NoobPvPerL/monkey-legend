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
