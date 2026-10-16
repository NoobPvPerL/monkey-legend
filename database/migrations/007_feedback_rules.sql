-- Owner-approved Issue #13 follow-ups. Only new web-v0.1.2 matches change.
create or replace function ml_private.rule_card(s jsonb,card text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.card(card)||case when s->>'version'='web-v0.1.2' and split_part(card,'#',1) in ('basic-003','basic-004','basic-005') then '{"group":true}'::jsonb else '{}'::jsonb end $$;

create or replace function ml_private.resolve_attack(s jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare attack jsonb:=s->'attack'; d jsonb:=ml_private.card(attack->>'card'); hits jsonb:='[]'; targets jsonb; p jsonb; a integer:=(attack->>'actor')::int; t integer; actor integer; roll integer:=0; paid integer; amount integer; before_hp jsonb; triggers jsonb; healing integer:=0; begin
 select coalesce(jsonb_agg(x),'[]') into targets from ml_private.arr(attack->'targets') x where not (attack->'cancelled' @> jsonb_build_array(x));
 if jsonb_array_length(targets)>0 and d->>'id' in ('basic-006','basic-009') then s:=ml_private.die(s,d->>'name'); roll:=(s->>'_roll')::int; s:=s-'_roll'; end if;
 for t in select ml_private.n(x)::int from ml_private.arr(targets) x loop p:=s->'players'->t;
  if d ? 'power' then amount:=greatest(0,(d->>'power')::int-(p->>'ap')::int); paid:=least((d->>'power')::int,(p->>'ap')::int); p:=p||jsonb_build_object('ap',(p->>'ap')::int-paid); s:=ml_private.put_player(s,t,p); s:=ml_private.emit(s,'ap',ml_private.name(s,t)||' 被扣'||paid||'AP → '||(p->>'ap')); if amount>0 then hits:=hits||jsonb_build_array(jsonb_build_object('target',t,'amount',amount,'source',a,'category','attack')); end if;
  elsif d->>'id'='basic-008' then
   if (p->>'ap')::int=0 then hits:=hits||jsonb_build_array(jsonb_build_object('target',t,'amount',1,'source',a,'category','attack'));
   else paid:=case when s->>'version'='web-v0.1.2' then (p->>'ap')::int else least(2,(p->>'ap')::int) end; s:=ml_private.put_player(s,t,p||jsonb_build_object('ap',(p->>'ap')::int-paid)); s:=ml_private.put_player(s,a,(s->'players'->a)||jsonb_build_object('ap',(s->'players'->a->>'ap')::int+paid)); s:=ml_private.emit(s,'ap',ml_private.name(s,a)||' 从'||ml_private.name(s,t)||'吸收'||paid||'AP'); end if;
  elsif roll>=4 then hits:=hits||jsonb_build_array(jsonb_build_object('target',t,'amount',1,'source',a,'category','attack')); end if;
 end loop;
 for actor in select ml_private.n(x)::int from ml_private.arr(attack->'elbows') x loop p:=s->'players'->a;
  if (p->>'ap')::int=0 then hits:=hits||jsonb_build_array(jsonb_build_object('target',a,'amount',1,'source',actor,'category','response'));
  else paid:=least(2,(p->>'ap')::int); s:=ml_private.put_player(s,a,p||jsonb_build_object('ap',(p->>'ap')::int-paid)); s:=ml_private.put_player(s,actor,(s->'players'->actor)||jsonb_build_object('ap',(s->'players'->actor->>'ap')::int+paid)); s:=ml_private.emit(s,'ap',ml_private.name(s,actor)||' 肘击反吸'||paid||'AP'); end if;
 end loop;
 before_hp:=s->'players'; s:=ml_private.damage(s,hits); triggers:=s->'_triggers'; s:=s-'_triggers';
 if d->>'id'='basic-006' and (s->'players'->a->>'hp')::int>0 then for t in select ml_private.n(x)::int from ml_private.arr(targets) x loop healing:=healing+(before_hp->t->>'hp')::int-(s->'players'->t->>'hp')::int; end loop; s:=ml_private.heal(s,a,healing); end if;
 if roll>0 and roll<4 then s:=ml_private.emit(s,'miss',(d->>'name')||' 未命中'); end if;
 return s||jsonb_build_object('queue',triggers||jsonb_build_array(jsonb_build_object('kind','cleanup'))||(s->'queue'));
end $$;

create or replace function ml_private.targets(s jsonb,a integer,card text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare d jsonb:=ml_private.rule_card(s,card); p jsonb; ids jsonb:='[]'; x integer; lemon integer; ar text; br text; begin
 if d is null or d->>'type'<>'attack' then return ids; end if;
 ar:=ml_private.data('map')->(s->'players'->a->>'cell')->>'region';
 for p in select * from ml_private.arr(s->'players') loop
  x:=(p->>'seat')::int; br:=ml_private.data('map')->(p->>'cell')->>'region';
  if (p->>'hp')::int>0 and ml_private.enemy(s,a,x) and not (coalesce((d->>'group')::boolean,false) and p->>'character'='character-027' and jsonb_array_length(p->'hand')=1)
   and (d->>'range'='global' or ar=br or (d->>'range'='adjacent' and ml_private.neighbor(ar,br))) then ids:=ids||to_jsonb(x); if p->>'character'='character-004' then lemon:=x; end if; end if;
 end loop;
 if not coalesce((d->>'group')::boolean,false) and lemon is not null then return jsonb_build_array(lemon); end if; return ids;
end $$;

create or replace function ml_private.select_choice(s jsonb,kind text,a integer,at double precision,extra jsonb default '{}') returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare paused boolean:=kind not in ('draw-start','draw-end'); serial integer:=(s->>'choiceSerial')::int+1; begin
 if paused then s:=ml_private.pause(s,at); else s:=ml_private.resume(s,at); end if;
 s:=s||jsonb_build_object('phase','choice','choiceSerial',serial,'choice',jsonb_build_object('id',serial,'kind',kind,'actor',a,'deadline',at+least(case when kind='discard' and s->>'version'='web-v0.1.2' then 20000 else 10000 end,case when paused then (case when kind='discard' and s->>'version'='web-v0.1.2' then 20000 else 10000 end) else ml_private.budget(s,at) end),'paused',paused)||extra);
 return ml_private.emit(s,'choice',ml_private.name(s,a)||' 等待选择：'||kind);
end $$;

create or replace function ml_private.dispatch(previous jsonb,cmd jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare s jsonb:=previous; a integer; p jsonb; d jsonb; c jsonb; m jsonb; v jsonb; typ text:=cmd->>'type'; card text:=cmd->>'card'; cells jsonb; cell text; cost integer; left_steps integer; deadline double precision; guard integer:=0; changed boolean:=false; targets jsonb; txt text; begin
 perform ml_private.need(jsonb_typeof(cmd)='object','命令必须为对象');
 perform ml_private.need(jsonb_typeof(cmd->'actor')='number' and (cmd->>'actor')::numeric=trunc((cmd->>'actor')::numeric) and (cmd->>'actor')::int between 0 and 3 and jsonb_typeof(cmd->'revision')='number' and (cmd->>'revision')::numeric=trunc((cmd->>'revision')::numeric) and (cmd->>'revision')::bigint>=0,'座位/命令版本必须为有效整数');
 perform ml_private.need(typ in ('play','move','step','stop','end','choose','tick'),'未知命令');
 if typ='play' then perform ml_private.need(jsonb_typeof(cmd->'card')='string' and jsonb_typeof(cmd->'targets')='array','出牌/目标输入无效'); for v in select * from ml_private.arr(cmd->'targets') loop perform ml_private.need(jsonb_typeof(v)='number' and (v#>>'{}')::numeric=trunc((v#>>'{}')::numeric) and ml_private.n(v) between 0 and 3,'目标输入无效'); end loop; end if;
 if typ='step' then perform ml_private.need(jsonb_typeof(cmd->'path')='array','路径必须为数组'); for v in select * from ml_private.arr(cmd->'path') loop perform ml_private.need(jsonb_typeof(v)='string','路径格无效'); end loop; end if;
 if typ='choose' then
  perform ml_private.need(jsonb_typeof(cmd->'choice')='number' and (cmd->>'choice')::numeric=trunc((cmd->>'choice')::numeric) and (cmd->>'choice')::bigint>0,'选择编号无效');
  if cmd ? 'accept' then perform ml_private.need(jsonb_typeof(cmd->'accept')='boolean','发动选项必须为布尔值'); end if;
  if cmd ? 'card' then perform ml_private.need(jsonb_typeof(cmd->'card') in ('string','null'),'响应牌输入无效'); end if;
  if cmd ? 'cell' then perform ml_private.need(jsonb_typeof(cmd->'cell') in ('string','null'),'传送格输入无效'); end if;
  if cmd ? 'cards' then perform ml_private.need(jsonb_typeof(cmd->'cards')='array','弃牌必须为数组'); for v in select * from ml_private.arr(cmd->'cards') loop perform ml_private.need(jsonb_typeof(v)='string','弃牌输入无效'); end loop; end if;
 end if;
 perform ml_private.need(at>=(s->>'time')::double precision,'时钟必须单调'); perform ml_private.need(cmd->'revision'=s->'revision','命令版本过期'); perform ml_private.need(jsonb_typeof(cmd->'id')='string' and length(cmd->>'id')>0 and not (s->'seen' ? (cmd->>'id')),'重复命令'); perform ml_private.need(s->>'phase'<>'over','对局已经结束');
 a:=(cmd->>'actor')::int;
 if typ='tick' then
  while s->>'phase'<>'over' loop deadline:=coalesce((s#>>'{choice,deadline}')::double precision,(s#>>'{clock,since}')::double precision+(s#>>'{clock,remaining}')::double precision); exit when deadline is null or deadline>at;
   guard:=guard+1; perform ml_private.need(guard<1000,'超时流程未收敛'); s:=ml_private.expire(s,deadline); changed:=true;
  end loop;
  if not changed then return jsonb_build_object('state',previous,'ok',true); end if;
 else
  perform ml_private.need(not (case when s->'choice'<>'null'::jsonb then at>=(s#>>'{choice,deadline}')::double precision else s#>'{clock,since}'<>'null'::jsonb and ml_private.budget(s,at)=0 end),'命令已超时');
  if typ='choose' then perform ml_private.need(s->'choice'<>'null'::jsonb,'当前没有选择窗口'); s:=ml_private.choose(s,cmd,at);
  else
   p:=s->'players'->a; perform ml_private.need(a=(s->>'active')::int and (p->>'hp')::int>0,'只有当前存活行动者可操作'); perform ml_private.need(s->'choice'='null'::jsonb,'请先完成当前选择');
   case typ
    when 'step' then
     perform ml_private.need(s->>'phase'='moving' and s->'movement'<>'null'::jsonb,'尚未开始移动'); perform ml_private.need(jsonb_array_length(cmd->'path')>0,'移动路径不能为空'); m:=s->'movement';
     for cell in select x#>>'{}' from ml_private.arr(cmd->'path') x loop
      perform ml_private.need(ml_private.data('map') ? cell and ml_private.distance(p->>'cell',cell)=1,'只能正交移动到棋盘内相邻格'); cost:=case when ml_private.data('map')->cell->>'terrain'='water' then 2 else 1 end; left_steps:=(m->>'remaining')::int-cost;
      perform ml_private.need(left_steps>=0,'移动步数不足'); perform ml_private.need(ml_private.escape(s,a,cell,left_steps),'此路径会困在占用格');
      p:=p||jsonb_build_object('cell',cell); m:=m||jsonb_build_object('remaining',left_steps,'path',(m->'path')||to_jsonb(cell)); if not ml_private.occupied(s,cell,a) then m:=m||jsonb_build_object('lastEmpty',cell); end if;
      s:=ml_private.put_player(s,a,p); s:=ml_private.emit(s,'move',ml_private.name(s,a)||' → '||cell||'，消耗'||cost||'步，余'||left_steps);
     end loop;
     s:=jsonb_set(s,'{movement}',m); if (m->>'remaining')::int=0 then s:=ml_private.settle_movement(s); s:=s||jsonb_build_object('movement',null,'phase','action'); end if;
    when 'stop' then perform ml_private.need(s->'movement'<>'null'::jsonb,'尚未开始移动'); perform ml_private.need(not ml_private.occupied(s,p->>'cell',a),'不能停在占用格'); s:=ml_private.settle_movement(s); s:=s||jsonb_build_object('movement',null,'phase','action'); s:=ml_private.emit(s,'move','主动结束移动，未用额度作废');
    when 'end' then perform ml_private.need(s->'movement'='null'::jsonb or not ml_private.occupied(s,p->>'cell',a),'不能在占用格结束行动'); s:=ml_private.end_turn(s,at);
    else
     perform ml_private.need(s->>'phase'='action','请先完成移动');
     if typ='move' then perform ml_private.need(not (p->>'moved')::boolean,'本个人回合已使用基础移动'); perform ml_private.need((p->>'ap')::int>=1,'移动需要1AP'); s:=ml_private.put_player(s,a,p||jsonb_build_object('ap',(p->>'ap')::int-case when s->>'version'='web-v0.1.1' then 1 else 0 end,'moved',true)); s:=ml_private.die(s,'基础移动'); left_steps:=ceil((s->>'_roll')::numeric/2)::int; s:=s-'_roll'; s:=s||jsonb_build_object('movement',jsonb_build_object('remaining',left_steps,'lastEmpty',p->'cell','origin',p->'cell','path',jsonb_build_array(p->'cell'))||case when s->>'version'='web-v0.1.2' then jsonb_build_object('costDue',true) else '{}'::jsonb end,'phase','moving'); s:=ml_private.emit(s,'cost',ml_private.name(s,a)||case when s->>'version'='web-v0.1.2' then ' 移动结束扣费，获得' else ' 移动支付1AP，获得' end||left_steps||'步');
     elsif typ='play' then
      d:=ml_private.rule_card(s,card); targets:=cmd->'targets'; perform ml_private.need(p->'hand' ? card,'手中没有该实体牌'); perform ml_private.need(d is not null and d->>'type'<>'response','响应牌只能在对应窗口使用'); cost:=(d->>'cost')::int; perform ml_private.need((p->>'ap')::int>=cost,'行动点不足');
      if d->>'type'='attack' then perform ml_private.need((p->>'attacks')::int<2,'本回合最多两张攻击'); perform ml_private.need(jsonb_array_length(targets) between 1 and case when coalesce((d->>'group')::boolean,false) then case when s->>'version'='web-v0.1.2' then 3 else 2 end else 1 end and (select count(distinct x) from ml_private.arr(targets) x)=jsonb_array_length(targets),'目标数量无效'); perform ml_private.need(ml_private.targets(s,a,card) @> targets,'目标不合法：检查范围、队伍、lemon嘲讽或群体免疫');
      else perform ml_private.need(targets='[]'::jsonb,'补给只能对自己'); end if;
      if s->>'version'='web-v0.1.2' then s:=jsonb_set(s,'{clock}',jsonb_build_object('remaining',60000,'since',at)); end if;
      p:=p||jsonb_build_object('ap',(p->>'ap')::int-cost,'hand',(p->'hand')-card); s:=ml_private.put_player(s,a,p); s:=jsonb_set(s,'{resolving}',(s->'resolving')||to_jsonb(card)); txt:=ml_private.name(s,a)||' 使用'||(d->>'name')||'，支付'||cost||'AP'; if d->>'type'='attack' then txt:=txt||'，目标'||(select string_agg(ml_private.name(s,ml_private.n(x)::int),'、') from ml_private.arr(targets) x); end if; s:=ml_private.emit(s,'play',txt,jsonb_build_object('actor',a,'card',card,'targets',targets));
      if d->>'type'='attack' then
       s:=ml_private.put_player(s,a,p||jsonb_build_object('attacks',(p->>'attacks')::int+1));
       select coalesce(jsonb_agg(jsonb_build_object('kind','response','actor',x)),'[]') into cells from ml_private.arr(s->'order') x where targets @> jsonb_build_array(x);
       s:=s||jsonb_build_object('attack',jsonb_build_object('actor',a,'card',card,'targets',targets,'cancelled','[]'::jsonb,'elbows','[]'::jsonb),'phase','resolving','queue',(s->'queue')||cells||jsonb_build_array(jsonb_build_object('kind','resolve'))); s:=ml_private.pump(s,at);
      else s:=ml_private.heal(s,a,case when d->>'id'='basic-046' then 2 else 1 end,true);
       if d->>'id'='basic-045' then p:=s->'players'->a; cost:=least(1,2-(p->>'shield')::int); p:=p||jsonb_build_object('shield',(p->>'shield')::int+cost); s:=ml_private.put_player(s,a,p); s:=ml_private.emit(s,'shield',ml_private.name(s,a)||' 获得'||cost||'护盾 → '||(p->>'shield')); end if;
       if d->>'id'='basic-047' then s:=ml_private.draw(s,a,2); end if; s:=s||jsonb_build_object('discard',(s->'discard')||(s->'resolving'),'resolving','[]'::jsonb); s:=ml_private.finish(s,false,at);
      end if;
     else raise exception '未知命令'; end if;
   end case;
  end if;
 end if;
 s:=s||jsonb_build_object('seen',(s->'seen')||to_jsonb(cmd->>'id'),'revision',(s->>'revision')::bigint+1,'time',at); perform ml_private.validate(s); return jsonb_build_object('state',s,'ok',true);
exception when others then return jsonb_build_object('state',previous,'ok',false,'error',sqlerrm);
end $$;

revoke all on all functions in schema ml_private from public,anon,authenticated;
