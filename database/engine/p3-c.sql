-- C batch approved 2026-10-19. Private authority; only v14 receives new state.
create or replace function ml_private.p3c_enabled(s jsonb) returns boolean language sql immutable set search_path=pg_catalog,ml_private as $$select coalesce(s->>'version'='web-v0.1.14',false)$$;
create or replace function ml_private.p3c_valid(s jsonb) returns boolean language sql immutable set search_path=pg_catalog,ml_private as $$
 select not ml_private.p3c_enabled(s) or coalesce((select bool_and(coalesce(jsonb_typeof(s#>array['stage3','c',k])='array' and jsonb_array_length(s#>array['stage3','c',k])=4 and not exists(select 1 from jsonb_array_elements(s#>array['stage3','c',k]) v where jsonb_typeof(v)<>'boolean'),false)) from unnest(array['feather','blocked','used','sleep']) k),false)
$$;
create or replace function ml_private.p3c_start(s jsonb,a integer) returns jsonb language plpgsql immutable set search_path=pg_catalog,ml_private as $$declare c jsonb;begin
 if not ml_private.p3c_enabled(s) then return s;end if;
 c:=coalesce(s#>'{stage3,c}','{"feather":[false,false,false,false],"blocked":[false,false,false,false],"used":[false,false,false,false],"sleep":[false,false,false,false]}');
 c:=jsonb_set(c,array['feather',a::text],'false');c:=jsonb_set(c,array['blocked',a::text],'false');c:=jsonb_set(c,array['used',a::text],'false');return jsonb_set(s,'{stage3,c}',c);
end $$;
create or replace function ml_private.p3c_end(s jsonb,a integer) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$begin
 if not ml_private.p3c_enabled(s) then return s;end if;
 s:=jsonb_set(s,array['stage3','c','sleep',a::text],to_jsonb(s#>>array['players',a::text,'character']='character-047' and ml_private.stage4_on_board(s,a) and s#>>array['stage3','c','used',a::text]='false'));
 return jsonb_set(s,array['stage3','c','feather',a::text],'false');
end $$;
create or replace function ml_private.p3c_sleep(s jsonb,a integer,allowed boolean) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare ready boolean;begin
 if not ml_private.p3c_enabled(s) then return s;end if;ready:=s#>>array['stage3','c','sleep',a::text]='true';s:=jsonb_set(s,array['stage3','c','sleep',a::text],'false');
 if ready and allowed and s#>>array['players',a::text,'character']='character-047' and ml_private.stage4_on_board(s,a) then s:=ml_private.stage3_gain_ap(s,a,2);s:=s-'_gain';s:=ml_private.emit(s,'skill','S'||(a+1)||' 睡觉：额外获得2AP');end if;return s;
end $$;
create or replace function ml_private.p3c_mark_card(s jsonb,a integer) returns jsonb language plpgsql immutable set search_path=pg_catalog,ml_private as $$begin
 if ml_private.p3c_enabled(s) and (s->>'active')::int=a and s#>>array['players',a::text,'character']='character-047' then s:=jsonb_set(s,array['stage3','c','used',a::text],'true');end if;return s;
end $$;
create or replace function ml_private.p3c_mark_food(s jsonb,targets jsonb) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare c jsonb:=s#>'{cardStack,stack,-1}';begin
 if ml_private.p3c_enabled(s) and jsonb_array_length(targets)>0 and ml_private.rule_card(s,c->>'definition')->>'type'='food' then s:=jsonb_set(s,array['cardStack','stack',(jsonb_array_length(s#>'{cardStack,stack}')-1)::text,'cFood'],'true');end if;return s;
end $$;
create or replace function ml_private.p3c_food_tasks(s jsonb,closed jsonb) returns jsonb language plpgsql stable set search_path=pg_catalog,ml_private as $$declare tasks jsonb;begin
 if not ml_private.p3c_enabled(s) or closed->>'cFood' is distinct from 'true' then return s;end if;
 select coalesce(jsonb_agg(ml_private.stage3_task('primitive-food',jsonb_build_object('actor',a)) order by ord),'[]') into tasks from jsonb_array_elements(s->'order') with ordinality q(a,ord)
 where s#>>array['players',a#>>'{}','character']='character-047' and ml_private.stage4_on_board(s,(a#>>'{}')::int);return ml_private.stage3_prepend(s,tasks);
end $$;
create or replace function ml_private.p3c_food_task(s jsonb,a integer,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin
 if ml_private.p3c_enabled(s) and s#>>array['players',a::text,'character']='character-047' and ml_private.stage4_on_board(s,a) then return ml_private.select_choice(s,'primitive-food',a,at);end if;return s;
end $$;
create or replace function ml_private.p3c_feather(s jsonb,a integer) returns boolean language sql immutable set search_path=pg_catalog,ml_private as $$select coalesce(ml_private.p3c_enabled(s) and s#>>array['players',a::text,'character']='character-046' and s#>>array['stage3','c','feather',a::text]='true',false)$$;
create or replace function ml_private.p3c_effect(s jsonb,a integer,card text,effect jsonb) returns jsonb language sql stable set search_path=pg_catalog,ml_private as $$
 select case when ml_private.p3c_feather(s,a) and ml_private.rule_card(s,card)->>'type'='attack' then jsonb_set(effect,'{roleModifiers}',(effect->'roleModifiers')||jsonb_build_array(jsonb_build_object('actor',a,'kind','active-range'))) else effect end
$$;
create or replace function ml_private.p3c_skill(s jsonb,a integer) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$begin
 perform ml_private.need(ml_private.p3c_enabled(s) and s#>>array['players',a::text,'character']='character-046' and ml_private.stage4_on_board(s,a) and not ml_private.p3c_feather(s,a),'手长当前不可发动');
 s:=jsonb_set(s,array['stage3','c','feather',a::text],'true');return ml_private.emit(s,'skill','S'||(a+1)||' 手长：本个人回合攻击牌不限距离');
end $$;
create or replace function ml_private.p3c_move(s jsonb,a integer,cost integer) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$declare roll integer;begin
 if not ml_private.p3c_enabled(s) or s#>>array['players',a::text,'character']<>'character-046' then return s||jsonb_build_object('_cMoveFailed',false);end if;
 s:=ml_private.die(s,'脚短');roll:=(s->>'_roll')::int;s:=s-'_roll';if roll>2 then return s||jsonb_build_object('_cMoveFailed',false);end if;
 s:=jsonb_set(s,array['players',a::text,'moved'],'true');s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((s#>>array['players',a::text,'ap'])::int-cost));s:=jsonb_set(s,array['stage3','basicUsed',a::text],to_jsonb((s#>>array['stage3','basicUsed',a::text])::int+1));s:=jsonb_set(s,array['stage3','c','blocked',a::text],'true');
 s:=ml_private.emit(s,'skill','S'||(a+1)||' 脚短失败，支付'||cost||'AP，本个人回合不能再发动基础移动');return s||jsonb_build_object('_cMoveFailed',true);
end $$;
