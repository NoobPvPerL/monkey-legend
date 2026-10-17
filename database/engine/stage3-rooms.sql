create or replace function ml_private.stage3_create_draft(mode text,random_state jsonb,at double precision) returns jsonb language plpgsql volatile set search_path=pg_catalog,ml_private as $$ declare s jsonb:=jsonb_build_object('random',random_state);firstn integer;pair jsonb;teams jsonb:='[]';pools jsonb:='{}';ids jsonb:=ml_private.stage3_content()->'characterIds';pool jsonb;family text;a integer;begin
 s:=ml_private.int(s,4);firstn:=(s->>'_int')::int;s:=s-'_int';s:=ml_private.shuffle(s,'[0,1,2,3]');pair:=jsonb_build_array(s->'_shuffle'->0,s->'_shuffle'->1);s:=s-'_shuffle';
 for a in 0..3 loop family:=case when mode='team' then case when pair @> jsonb_build_array(a) then '机械猴子' else '帝汶家族' end else 'S'||(a+1) end;teams:=teams||jsonb_build_array(family);end loop;
 for family in select distinct x#>>'{}' from ml_private.arr(teams) x loop
 select jsonb_agg(id order by ord) into pool from jsonb_array_elements(ids) with ordinality q(id,ord) where mode='ffa' or ml_private.stage3_content()#>>array['characters',id#>>'{}','faction'] in (family,'中立');pools:=jsonb_set(pools,array[family],pool);end loop;
 return ml_private.create_draft(jsonb_build_object('mode',mode,'order',(select jsonb_agg((firstn+i)%4 order by i) from generate_series(0,3) i),'teams',teams,'pools',pools,'random',s->'random','catalogVersion','web-v0.1.6'),at);
end $$;
create or replace function ml_private.stage3_complete_draft(r ml_private.rooms,at bigint) returns ml_private.rooms language plpgsql volatile set search_path=pg_catalog,ml_private as $$ declare setup jsonb;start_at double precision;teams jsonb;begin
 if r.status<>'drafting' or r.draft->>'status'<>'complete' then return r;end if;
 start_at:=(r.draft#>>'{events,-1,at}')::double precision;
 select jsonb_agg(to_jsonb(case when x#>>'{}'='机械猴子' then 'A' else 'B' end) order by ord) into teams from jsonb_array_elements(r.draft->'teams') with ordinality q(x,ord);
 setup:=jsonb_build_object('mode',r.mode,'ruleVersion','web-v0.1.6','seed',r.draft#>'{random,seed}','seats','[0,1,2,3]'::jsonb,'characters',r.draft->'selected','first',r.draft#>'{order,0}','secure',coalesce(r.draft#>'{random,secure}','false'),'dice',r.draft#>'{random,dice}','bombs',r.draft#>'{random,bombs}','reshuffles',r.draft#>'{random,reshuffles}','sortedReshuffles',r.draft#>'{random,sortedReshuffles}');
 if r.mode='team' then setup:=setup||jsonb_build_object('teams',teams);end if;
 r.game:=ml_private.create_game(setup,start_at);r.status:='playing';r.revision:=r.revision+1;r.updated_at:=at;return r;
end $$;
