-- Stage 3 private draft foundation. No room, profile, default rule or public RPC changes.
DO $$ BEGIN IF coalesce((public.ml_health()->>'engineRevision')::int,0)<12 THEN RAISE EXCEPTION 'Apply 012 before 013'; END IF; END $$;
-- Private preparation state only. No public start path is enabled by this file.
create or replace function ml_private.draft_offer(s jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare a integer; pool jsonb; candidates jsonb:='[]'; i integer; serial integer; begin
 if (s->>'cursor')::int=4 then return s||jsonb_build_object('status','complete','offer',null);end if;
 a:=(s->'order'->>(s->>'cursor')::int)::int;pool:=s->'pools'->(s->'teams'->>a);
 perform ml_private.need(jsonb_array_length(pool)>=3,'角色池不足三个候选，不能开始选择');
 for i in 0..2 loop s:=ml_private.int(s,jsonb_array_length(pool));candidates:=candidates||jsonb_build_array(pool->(s->>'_int')::int);pool:=pool-(s->>'_int')::int;s:=s-'_int';end loop;
 serial:=(s->>'offerSerial')::int+1;
 return s||jsonb_build_object('offerSerial',serial,'offer',jsonb_build_object('id',serial,'actor',a,'candidates',candidates,'deadline',at+30000),'events',(s->'events')||jsonb_build_array(jsonb_build_object('seq',jsonb_array_length(s->'events')+1,'kind','offer','actor',a,'at',at)));
end $$;
create or replace function ml_private.validate_draft(s jsonb) returns void language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare chosen jsonb; a integer; i integer; o jsonb:=s->'offer'; pool jsonb; begin
 perform ml_private.need(s->>'status' in ('choosing','complete') and s->>'version'='draft-v1' and s->>'catalogVersion'='web-v0.1.4' and jsonb_array_length(s->'selected')=4 and (select jsonb_agg(x order by x) from ml_private.arr(s->'order') x)='[0,1,2,3]'::jsonb,'选角状态版本或座位无效');
 select coalesce(jsonb_agg(x),'[]') into chosen from ml_private.arr(s->'selected') x where x<>'null'::jsonb;
 perform ml_private.need(jsonb_array_length(chosen)=(s->>'cursor')::int and (select count(distinct x) from ml_private.arr(chosen) x)=jsonb_array_length(chosen) and not exists(select 1 from ml_private.arr(chosen) x where not ((ml_private.version_catalog('web-v0.1.4')#>'{sourceCatalog,characters}') ? (x#>>'{}'))),'已选角色无效或重复');
 for i in 0..3 loop a:=(s->'order'->>i)::int;perform ml_private.need((s->'selected'->a<>'null'::jsonb)=(i<(s->>'cursor')::int),'选角顺序不一致');end loop;
 for pool in select value from jsonb_each(s->'pools') loop perform ml_private.need(not exists(select 1 from ml_private.arr(pool) x where chosen @> jsonb_build_array(x)),'已选角色没有移出牌池');end loop;
 if s->>'status'='complete' then perform ml_private.need((s->>'cursor')::int=4 and o='null'::jsonb,'选角结束状态无效');
 else
  perform ml_private.need((s->>'cursor')::int between 0 and 3 and o<>'null'::jsonb and o->'actor'=s->'order'->(s->>'cursor')::int and o->'id'=s->'offerSerial' and jsonb_array_length(o->'candidates')=3 and (select count(distinct x) from ml_private.arr(o->'candidates') x)=3 and s->'pools'->(s->'teams'->>(o->>'actor')::int) @> (o->'candidates') and (o->>'deadline')::double precision<'Infinity'::double precision,'当前候选或选择期限无效');
 end if;
end $$;
create or replace function ml_private.create_draft(setup jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare s jsonb; pool jsonb; i integer; a integer; overlap_count integer; key text; begin
 perform ml_private.need(jsonb_typeof(setup)='object','选角输入必须为对象');
 perform ml_private.need(at>=0 and at<'Infinity'::double precision,'选角时钟无效');
 perform ml_private.need(jsonb_typeof(setup->'order')='array' and (select jsonb_agg(x order by x) from ml_private.arr(setup->'order') x)='[0,1,2,3]'::jsonb,'选角需要四个固定座位的行动顺序');
 perform ml_private.need(setup->>'mode' in ('ffa','team'),'选角模式无效');perform ml_private.need(jsonb_typeof(setup->'teams')='array' and jsonb_array_length(setup->'teams')=4,'选角阵营需要四个座位');
 if setup->>'mode'='team' then perform ml_private.need((select count(*) from ml_private.arr(setup->'teams') x where x='"机械猴子"')=2 and (select count(*) from ml_private.arr(setup->'teams') x where x='"帝汶家族"')=2,'选角须先分配两名机械猴子和两名帝汶家族');
 else perform ml_private.need(setup->'teams'='["S1","S2","S3","S4"]'::jsonb,'各自为战的选角身份无效');end if;
 perform ml_private.need(jsonb_typeof(setup->'pools')='object','角色阵营池尚未完整配置');
 perform ml_private.need((select jsonb_agg(k order by k) from jsonb_object_keys(setup->'pools') k)=(select jsonb_agg(x order by x) from (select distinct x from ml_private.arr(setup->'teams') x) t),'角色阵营池尚未完整配置');
 for pool in select value from jsonb_each(setup->'pools') loop
  perform ml_private.need(jsonb_typeof(pool)='array' and jsonb_array_length(pool)>=3 and (select count(distinct x) from ml_private.arr(pool) x)=jsonb_array_length(pool) and not exists(select 1 from ml_private.arr(pool) x where not ((ml_private.version_catalog('web-v0.1.4')#>'{sourceCatalog,characters}') ? (x#>>'{}'))),'角色池必须包含至少三个不同的已登记角色');
 end loop;
 for i in 0..3 loop
  a:=(setup->'order'->>i)::int;pool:=setup->'pools'->(setup->'teams'->>a);
  select count(*) into overlap_count from jsonb_array_elements(setup->'order') with ordinality t(other,n) where n<=i and exists(select 1 from ml_private.arr(setup->'pools'->(setup->'teams'->>(other#>>'{}')::int)) x where pool @> jsonb_build_array(x));
  perform ml_private.need(jsonb_array_length(pool)>=3+overlap_count,'角色池可能不足三个候选，请补齐阵营或中立分配');
 end loop;
 perform ml_private.need(jsonb_typeof(setup->'random'->'seed')='number' and (setup#>>'{random,seed}')::numeric=trunc((setup#>>'{random,seed}')::numeric) and (setup#>>'{random,seed}')::numeric between 0 and 4294967295,'选角随机源无效');
 s:=jsonb_build_object('mode',setup->'mode','order',setup->'order','teams',setup->'teams','pools',setup->'pools','random',setup->'random','version','draft-v1','catalogVersion','web-v0.1.4','revision',0,'time',at,'status','choosing','cursor',0,'offerSerial',0,'offer',null,'selected','[null,null,null,null]'::jsonb,'events','[]'::jsonb,'requests','[]'::jsonb);
 s:=ml_private.draft_offer(s,at);perform ml_private.validate_draft(s);return s;
end $$;
create or replace function ml_private.draft_pick(s jsonb,chosen_id text,at double precision,timed_out boolean) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare o jsonb:=s->'offer'; key text; pool jsonb; begin
 perform ml_private.need(o->'candidates' ? chosen_id and not (s->'selected' ? chosen_id),'角色不在本次候选或已经被选中');
 s:=jsonb_set(s,array['selected',o->>'actor'],to_jsonb(chosen_id));
 for key,pool in select * from jsonb_each(s->'pools') loop s:=jsonb_set(s,array['pools',key],pool-chosen_id);end loop;
 s:=s||jsonb_build_object('events',(s->'events')||jsonb_build_array(jsonb_build_object('seq',jsonb_array_length(s->'events')+1,'kind','pick','actor',o->'actor','character',chosen_id,'at',at,'timedOut',timed_out)),'cursor',(s->>'cursor')::int+1);
 return ml_private.draft_offer(s,at);
end $$;
create or replace function ml_private.dispatch_draft(previous jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare s jsonb:=previous; receipt jsonb; o jsonb; changed boolean:=false; begin
 perform ml_private.need(jsonb_typeof(cmd)='object','选角命令必须为对象');perform ml_private.need(cmd->>'type' in ('pick','tick'),'未知选角命令');
 perform ml_private.need(not exists(select 1 from jsonb_object_keys(cmd) k where k not in ('id','revision','actor','type') and (cmd->>'type'<>'pick' or k not in ('offer','character'))),'选角命令含不允许的字段');
 perform ml_private.need(jsonb_typeof(cmd->'id')='string' and length(cmd->>'id') between 1 and 100 and not (cmd->>'id' ~ '[^A-Za-z0-9_-]') and jsonb_typeof(cmd->'actor')='number' and (cmd->>'actor')::numeric=trunc((cmd->>'actor')::numeric) and (cmd->>'actor')::int between 0 and 3 and jsonb_typeof(cmd->'revision')='number' and (cmd->>'revision')::numeric=trunc((cmd->>'revision')::numeric) and (cmd->>'revision')::numeric between 0 and 9007199254740991,'选角命令身份或编号无效');
 if cmd->>'type'='pick' then perform ml_private.need(jsonb_typeof(cmd->'offer')='number' and (cmd->>'offer')::numeric=trunc((cmd->>'offer')::numeric) and (cmd->>'offer')::numeric between 1 and 9007199254740991 and jsonb_typeof(cmd->'character')='string','选角选择输入无效');end if;
 perform ml_private.need(at>=(previous->>'time')::double precision and at<'Infinity'::double precision,'选角时钟必须单调');
 select r into receipt from ml_private.arr(previous->'requests') r where r->>'id'=cmd->>'id';
 if receipt is not null then perform ml_private.need(receipt->'payload'=cmd,'同一请求编号不能替换内容');return jsonb_build_object('state',previous,'ok',true,'duplicate',true);end if;
 perform ml_private.need(previous->>'status'='choosing','选角已经结束');perform ml_private.need(cmd->'revision'=previous->'revision','选角状态版本过期');
 if cmd->>'type'='tick' then
  while s->'offer'<>'null'::jsonb and at>=(s#>>'{offer,deadline}')::double precision loop o:=s->'offer';s:=ml_private.int(s,3);s:=ml_private.draft_pick(s,o->'candidates'->>(s->>'_int')::int,(o->>'deadline')::double precision,true);s:=s-'_int';changed:=true;end loop;
  if not changed then return jsonb_build_object('state',previous,'ok',true);end if;
 else
  o:=s->'offer';perform ml_private.need(o<>'null'::jsonb and at<(o->>'deadline')::double precision,'选角已经超时，请先同步时钟');
  perform ml_private.need(cmd->'actor'=o->'actor' and cmd->'offer'=o->'id','请由当前选角者操作有效窗口');s:=ml_private.draft_pick(s,cmd->>'character',at,false);
 end if;
 s:=s||jsonb_build_object('revision',(s->>'revision')::int+1,'time',at,'requests',(s->'requests')||jsonb_build_array(jsonb_build_object('id',cmd->'id','payload',cmd)));perform ml_private.validate_draft(s);return jsonb_build_object('state',s,'ok',true);
exception when others then return jsonb_build_object('state',previous,'ok',false,'error',sqlerrm);
end $$;
create or replace function ml_private.draft_view(s jsonb,viewer integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare o jsonb:=s->'offer'; begin
 perform ml_private.need(viewer is null or viewer between 0 and 3,'选角视图身份无效');
 if o<>'null'::jsonb and viewer is not null and viewer<>(o->>'actor')::int then o:=o-'candidates';end if;
 return jsonb_build_object('version',s->'version','catalogVersion',s->'catalogVersion','revision',s->'revision','mode',s->'mode','status',s->'status','order',s->'order','teams',s->'teams','selected',s->'selected','offer',o,'events',s->'events');
end $$;

revoke all on all functions in schema ml_private from public;
DO $$ declare r text; begin foreach r in array array['anon','authenticated'] loop execute format('revoke all on all functions in schema ml_private from %I',r);end loop;end $$;
