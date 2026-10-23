create or replace function ml_private.p3_monkey_effect(s jsonb,a integer,card text,effect jsonb) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ begin
 if s->>'version'='web-v0.1.12' and s#>>array['players',a::text,'character']='character-013' and ml_private.game_data(s,'cardTags')->split_part(card,'#',1) ? '外星' and (ml_private.rule_card(s,card)->>'type'='attack' or split_part(card,'#',1)='basic-048') then
 return jsonb_set(effect,'{roleModifiers}',(effect->'roleModifiers')||jsonb_build_array(jsonb_build_object('actor',a,'kind','damage')));end if;return effect;
end $$;
create or replace function ml_private.p3_mayi_targets(s jsonb,a integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare region text;result jsonb;begin
 if s->>'version'<>'web-v0.1.12' or s#>>array['players',a::text,'character']<>'character-025' or not ml_private.stage4_on_board(s,a) then return '[]';end if;
 region:=ml_private.region_at(s->>'version',s#>>array['players',a::text,'cell']);
 select coalesce(jsonb_agg(p->'seat' order by ord),'[]') into result from jsonb_array_elements(s->'players') with ordinality q(p,ord)
 where ml_private.stage4_on_board(s,(p->>'seat')::int) and ((p->>'seat')::int=a or s->>'mode'='team' and p->'team'=s#>array['players',a::text,'team'])
 and ml_private.character_effect_allowed(jsonb_build_object('origin','role-active','actor',a,'roleModifiers','[]'::jsonb),(p->>'seat')::int,p->>'character')
 and (ml_private.region_at(s->>'version',p->>'cell')=region or ml_private.neighbor_for_version(s->>'version',region,ml_private.region_at(s->>'version',p->>'cell')));return result;
end $$;
create or replace function ml_private.p3_mayi_skill(s jsonb,cmd jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare a integer:=(cmd->>'actor')::int;targets jsonb;target integer;label text;begin
 perform ml_private.need(s->>'version'='web-v0.1.12' and s#>>array['players',a::text,'character']='character-025' and ml_private.stage4_on_board(s,a),'樱岛麻衣仅限本版本马懿使用');
 perform ml_private.need((s#>>array['players',a::text,'ap'])::int>=3,'樱岛麻衣需要3AP');targets:=ml_private.p3_mayi_targets(s,a);perform ml_private.need(jsonb_array_length(targets)>0,'当前没有合法治疗目标');
 s:=jsonb_set(s,array['players',a::text,'ap'],to_jsonb((s#>>array['players',a::text,'ap'])::int-3));
 select string_agg('S'||((x#>>'{}')::int+1),'、' order by ord) into label from jsonb_array_elements(targets) with ordinality q(x,ord);
 s:=ml_private.emit(s,'skill','S'||(a+1)||' 樱岛麻衣，支付3AP，治疗'||label);
 for target in select (x#>>'{}')::int from ml_private.arr(targets) x loop s:=ml_private.heal(s,target,1,false);end loop;return s;
end $$;
create or replace function ml_private.p3_prepare_hit(s jsonb,h jsonb,environment boolean) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare a integer:=(h->>'source')::int;pending jsonb:=s#>'{cardStack,stack,-1}';card text:=h->>'originCard';begin
 if s->>'version'<>'web-v0.1.12' or environment or (h->>'amount')::int<=0 or a is null or s#>>array['players',a::text,'character']<>'character-013' then return s||jsonb_build_object('_hit',h);end if;
 if card is null and (pending->>'actor')::int=a and h->>'category'='attack' and coalesce(h->>'extra','false')<>'true' and coalesce(h->>'reflected','false')<>'true' then card:=pending->>'definition';end if;
 if card is null or not (ml_private.game_data(s,'cardTags')->split_part(card,'#',1) ? '外星') then return s||jsonb_build_object('_hit',h);end if;
 if not ml_private.character_effect_allowed(jsonb_build_object('origin','card','actor',a,'roleModifiers',jsonb_build_array(jsonb_build_object('actor',a,'kind','damage'))),(h->>'target')::int,s#>>array['players',h->>'target','character']) then return s||jsonb_build_object('_hit',null);end if;
 s:=ml_private.emit(s,'skill','S'||(a+1)||' 武士刀：外星伤害+1');return s||jsonb_build_object('_hit',h||jsonb_build_object('amount',(h->>'amount')::int+1));
end $$;
