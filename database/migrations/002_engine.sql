-- Pure JSONB rule engine. None of these functions is exposed to players.
create or replace function ml_private.need(ok boolean, message text) returns void
language plpgsql set search_path=pg_catalog,ml_private as $$ begin
 if ok is distinct from true then raise exception using message=message; end if;
end $$;
create or replace function ml_private.finish(s jsonb,forced boolean,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare groups jsonb:='[]'; rows jsonb:='[]'; ids jsonb; p jsonb; rowj jsonb; a integer; alive_count integer; hp integer; max_hp integer; kills integer; dmg integer; elim bigint; survivors integer:=0; i integer; j integer; cmp bigint; leftj jsonb; rightj jsonb; winners jsonb:='[]'; rankn integer; tied boolean; begin
 if s->>'mode'='ffa' then for a in 0..3 loop groups:=groups||jsonb_build_array(jsonb_build_array(a)); end loop;
 else groups:=jsonb_build_array((select jsonb_agg(member->'seat') from ml_private.arr(s->'players') member where member->>'team'='A'),(select jsonb_agg(member->'seat') from ml_private.arr(s->'players') member where member->>'team'='B')); end if;
 for ids in select * from ml_private.arr(groups) loop
  alive_count:=0; hp:=0; max_hp:=0; kills:=0; dmg:=0; elim:=0;
  for a in select ml_private.n(x)::int from ml_private.arr(ids) x loop p:=s->'players'->a;
   alive_count:=alive_count+case when (p->>'hp')::int>0 then 1 else 0 end; hp:=hp+(p->>'hp')::int; max_hp:=max_hp+(p->>'maxHp')::int; kills:=kills+(p->>'kills')::int; dmg:=dmg+(p->>'damage')::int; elim:=greatest(elim,coalesce((p->>'eliminated')::bigint,1000000000000000)); end loop;
  if alive_count>0 then survivors:=survivors+1; end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('label',case when s->>'mode'='ffa' then ml_private.name(s,(ids->>0)::int) else (s->'players'->(ids->>0)::int->>'team')||'队' end,'players',ids,'rank',0,'alive',alive_count,'hp',hp,'maxHp',max_hp,'kills',kills,'damage',dmg,'_elim',elim));
 end loop;
 if not forced and survivors>1 then return s; end if;
 -- Stable insertion sort, using exact integer cross multiplication for HP ratios.
 for i in 1..jsonb_array_length(rows)-1 loop j:=i;
  while j>0 loop leftj:=rows->(j-1); rightj:=rows->j;
   if (leftj->>'alive')::int>0 and (rightj->>'alive')::int>0 then
    cmp:=(rightj->>'alive')::bigint-(leftj->>'alive')::bigint;
    if cmp=0 then cmp:=(rightj->>'hp')::bigint*(leftj->>'maxHp')::bigint-(leftj->>'hp')::bigint*(rightj->>'maxHp')::bigint; end if;
    if cmp=0 then cmp:=(rightj->>'kills')::bigint-(leftj->>'kills')::bigint; end if;
    if cmp=0 then cmp:=(rightj->>'damage')::bigint-(leftj->>'damage')::bigint; end if;
   elsif (leftj->>'alive')::int>0 then cmp:=-1; elsif (rightj->>'alive')::int>0 then cmp:=1; else cmp:=(rightj->>'_elim')::bigint-(leftj->>'_elim')::bigint; end if;
   exit when cmp<=0;
   rows:=jsonb_set(rows,array[(j-1)::text],rightj); rows:=jsonb_set(rows,array[j::text],leftj); j:=j-1;
  end loop;
 end loop;
 for i in 0..jsonb_array_length(rows)-1 loop
  rowj:=rows->i; rankn:=i+1;
  if i>0 then leftj:=rows->(i-1);
   if ((leftj->>'alive')::int=0 and (rowj->>'alive')::int=0 and leftj->'_elim'=rowj->'_elim') or
   ((leftj->>'alive')::int>0 and (rowj->>'alive')::int>0 and leftj->'alive'=rowj->'alive' and (leftj->>'hp')::bigint*(rowj->>'maxHp')::bigint=(rowj->>'hp')::bigint*(leftj->>'maxHp')::bigint and leftj->'kills'=rowj->'kills' and leftj->'damage'=rowj->'damage') then rankn:=(leftj->>'rank')::int; end if;
  end if;
  rows:=jsonb_set(rows,array[i::text],rowj||jsonb_build_object('rank',rankn));
 end loop;
 tied:=survivors=0 or (select count(*) from ml_private.arr(rows) r where (r->>'rank')::int=1)>1;
 if not tied then for rowj in select * from ml_private.arr(rows) loop if (rowj->>'rank')::int=1 then winners:=winners||(rowj->'players'); end if; end loop; end if;
 select jsonb_agg(r-'_elim') into rows from ml_private.arr(rows) r;
 s:=s||jsonb_build_object('result',jsonb_build_object('reason',case when tied then 'draw' when forced then 'round-limit' else 'natural' end,'winners',winners,'ranking',rows),'phase','over','choice',null,'queue','[]'::jsonb,'movement',null);
 s:=ml_private.pause(s,at); return ml_private.emit(s,'result',case when tied then '对局结束：平局' else '对局结束：'||(rows->0->>'label')||' 获胜' end,s->'result');
end $$;
create or replace function ml_private.resolve_attack(s jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare attack jsonb:=s->'attack'; d jsonb:=ml_private.card(attack->>'card'); hits jsonb:='[]'; targets jsonb; p jsonb; a integer:=(attack->>'actor')::int; t integer; actor integer; roll integer:=0; paid integer; amount integer; before_hp jsonb; triggers jsonb; healing integer:=0; begin
 select coalesce(jsonb_agg(x),'[]') into targets from ml_private.arr(attack->'targets') x where not (attack->'cancelled' @> jsonb_build_array(x));
 if jsonb_array_length(targets)>0 and d->>'id' in ('basic-006','basic-009') then s:=ml_private.die(s,d->>'name'); roll:=(s->>'_roll')::int; s:=s-'_roll'; end if;
 for t in select ml_private.n(x)::int from ml_private.arr(targets) x loop p:=s->'players'->t;
  if d ? 'power' then amount:=greatest(0,(d->>'power')::int-(p->>'ap')::int); paid:=least((d->>'power')::int,(p->>'ap')::int); p:=p||jsonb_build_object('ap',(p->>'ap')::int-paid); s:=ml_private.put_player(s,t,p); s:=ml_private.emit(s,'ap',ml_private.name(s,t)||' 被扣'||paid||'AP → '||(p->>'ap')); if amount>0 then hits:=hits||jsonb_build_array(jsonb_build_object('target',t,'amount',amount,'source',a,'category','attack')); end if;
  elsif d->>'id'='basic-008' then
   if (p->>'ap')::int=0 then hits:=hits||jsonb_build_array(jsonb_build_object('target',t,'amount',1,'source',a,'category','attack'));
   else paid:=least(2,(p->>'ap')::int); s:=ml_private.put_player(s,t,p||jsonb_build_object('ap',(p->>'ap')::int-paid)); s:=ml_private.put_player(s,a,(s->'players'->a)||jsonb_build_object('ap',(s->'players'->a->>'ap')::int+paid)); s:=ml_private.emit(s,'ap',ml_private.name(s,a)||' 从'||ml_private.name(s,t)||'吸收'||paid||'AP'); end if;
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
create or replace function ml_private.start_round(s jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare a integer; p jsonb; hits jsonb:='[]'; amount integer; r integer:=(s->>'round')::int; bomb jsonb:='null'; begin
 if (s#>>'{forecast,round}')::int=r then bomb:=s#>'{forecast,bomb}'; end if;
 s:=s||jsonb_build_object('safe',ml_private.safe(r),'bomb',bomb,'forecast',null);
 s:=ml_private.emit(s,'round','第'||r||'轮开始，安全格'||jsonb_array_length(s->'safe')||'，轰炸：'||coalesce(bomb#>>'{}','无'));
 for a in 0..3 loop p:=s->'players'->a; if (p->>'hp')::int>0 then p:=p||jsonb_build_object('skillUsed',false,'rewarded','[]'::jsonb);
  if (p->>'ap')::int<5 then p:=p||jsonb_build_object('ap',(p->>'ap')::int+3); s:=ml_private.put_player(s,a,p); s:=ml_private.emit(s,'ap',ml_private.name(s,a)||' 轮开始获得3AP → '||(p->>'ap')); end if; s:=ml_private.put_player(s,a,p);
  amount:=case when s->'safe' ? (p->>'cell') then 0 when r<=3 then 0 when r<=7 then 1 else 2 end+case when ml_private.data('map')->(p->>'cell')->'region'=bomb then 1 else 0 end;
  hits:=hits||jsonb_build_array(jsonb_build_object('target',a,'amount',amount,'source',null,'category','environment'));
 end if; end loop;
 s:=ml_private.pause(s,at); s:=jsonb_set(s,'{phase}','"resolving"'); s:=ml_private.damage(s,hits,true);
 s:=s||jsonb_build_object('queue',(s->'queue')||(s->'_triggers')||jsonb_build_array(jsonb_build_object('kind','after-env'))); s:=s-'_triggers'; return ml_private.pump(s,at);
end $$;
create or replace function ml_private.next_turn(s jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare active integer:=(s->>'active')::int; cursor integer:=(s->>'cursor')::int+1; r integer:=(s->>'round')::int; candidates jsonb; bomb jsonb:='null'; begin
 s:=ml_private.pause(s,at); s:=ml_private.put_player(s,active,(s->'players'->active)||jsonb_build_object('moved',false,'attacks',0));
 while cursor<4 and (s->'players'->(s->'order'->>cursor)::int->>'hp')::int<=0 loop cursor:=cursor+1; end loop;
 s:=jsonb_set(s,'{cursor}',to_jsonb(cursor));
 if cursor<4 then return s||jsonb_build_object('queue',jsonb_build_array(jsonb_build_object('kind','turn-start','actor',s->'order'->cursor))||(s->'queue')); end if;
 if r=12 then return ml_private.finish(s,true,at); end if;
 if r>=2 then candidates:=ml_private.candidates(r+1);
  if jsonb_array_length(s#>'{random,bombs}')>0 then bomb:=s#>'{random,bombs,0}'; s:=jsonb_set(s,'{random,bombs}',(s#>'{random,bombs}')-0);
  else s:=ml_private.int(s,jsonb_array_length(candidates)); bomb:=candidates->(s->>'_int')::int; s:=s-'_int'; end if;
  perform ml_private.need(candidates @> jsonb_build_array(bomb),'轰炸区域无效');
 end if;
 s:=s||jsonb_build_object('forecast',jsonb_build_object('round',r+1,'safe',ml_private.safe(r+1),'bomb',bomb));
 s:=ml_private.emit(s,'forecast','预告第'||(r+1)||'轮：安全格'||jsonb_array_length(ml_private.safe(r+1))||'，轰炸'||coalesce(bomb#>>'{}','无'),s->'forecast');
 s:=s||jsonb_build_object('round',r+1,'cursor',0); return ml_private.start_round(s,at);
end $$;
create or replace function ml_private.pump(s jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare task jsonb; a integer; p jsonb; countn integer; cards jsonb; kind text; cells jsonb; cursor integer; guard integer:=0; begin
 while s->'choice'='null'::jsonb and s->>'phase'<>'over' and jsonb_array_length(s->'queue')>0 loop
  guard:=guard+1; perform ml_private.need(guard<200,'内部流程未收敛'); task:=s->'queue'->0; s:=jsonb_set(s,'{queue}',(s->'queue')-0); a:=coalesce((task->>'actor')::int,(s->>'active')::int); p:=s->'players'->a;
  case task->>'kind'
   when 'after-env' then s:=ml_private.finish(s,false,at); if s->>'phase'<>'over' then cursor:=0; while (s->'players'->(s->'order'->>cursor)::int->>'hp')::int<=0 loop cursor:=cursor+1; end loop; s:=s||jsonb_build_object('cursor',cursor,'queue',jsonb_build_array(jsonb_build_object('kind','turn-start','actor',s->'order'->cursor))||(s->'queue')); end if;
   when 'turn-start' then
    s:=s||jsonb_build_object('active',a,'phase','resolving','clock',jsonb_build_object('remaining',60000,'since',at)); p:=p||jsonb_build_object('moved',false,'attacks',0); s:=ml_private.put_player(s,a,p);
    if p->>'character'='character-031' and (p->>'ap')::int<6 then p:=p||jsonb_build_object('ap',6); s:=ml_private.put_player(s,a,p); s:=ml_private.emit(s,'ap',ml_private.name(s,a)||' 行动开始补至6AP'); end if;
    s:=ml_private.emit(s,'turn',ml_private.name(s,a)||' 开始行动'); if (s->>'round')::int>1 then s:=ml_private.draw(s,a,2); end if;
    s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','action'))||(s->'queue')); if p->>'character'='character-027' then s:=ml_private.select_choice(s,'draw-start',a,at); end if;
   when 'action' then s:=jsonb_set(s,'{phase}','"action"'); s:=ml_private.resume(s,at);
   when 'end-draw' then s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','discard'))||(s->'queue')); if p->>'character'='character-027' and (p->>'hp')::int>0 and ml_private.budget(s,at)>0 then s:=ml_private.select_choice(s,'draw-end',a,at); end if;
   when 'discard' then countn:=jsonb_array_length(p->'hand')-greatest(0,floor((p->>'hp')::numeric)::int); s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','next'))||(s->'queue')); if (p->>'hp')::int>0 and countn>0 then s:=ml_private.select_choice(s,'discard',a,at,jsonb_build_object('count',countn,'cards',p->'hand')); end if;
   when 'next' then s:=ml_private.next_turn(s,at);
   when 'response' then if s->'attack'<>'null'::jsonb and (p->>'hp')::int>0 then
    select coalesce(jsonb_agg(c),'[]') into cards from ml_private.arr(p->'hand') c where (ml_private.card(c#>>'{}')->>'id'='basic-001' or (ml_private.card(c#>>'{}')->>'id'='basic-002' and ml_private.card(s#>>'{attack,card}')->>'id'='basic-008')) and (p->>'ap')::int>=(ml_private.card(c#>>'{}')->>'cost')::int;
    if jsonb_array_length(cards)>0 then s:=ml_private.select_choice(s,'response',a,at,jsonb_build_object('cards',cards)); end if; end if;
   when 'resolve' then s:=ml_private.resolve_attack(s);
   when 'cleanup' then s:=s||jsonb_build_object('discard',(s->'discard')||(s->'resolving'),'resolving','[]'::jsonb,'attack',null); s:=ml_private.finish(s,false,at);
    if s->>'phase'<>'over' then if (s->'players'->(s->>'active')::int->>'hp')::int>0 then s:=jsonb_set(s,'{phase}','"action"'); s:=ml_private.resume(s,at); else s:=jsonb_set(s,'{queue}',jsonb_build_array(jsonb_build_object('kind','next'))||(s->'queue')); end if; end if;
   when 'trigger' then
    if (p->>'hp')::int<=0 then continue; end if; kind:=task->>'trigger';
    if kind='lemon-reward' then if task ? 'source' and not (s->'players'->(task->>'source')::int->'rewarded' @> jsonb_build_array(a)) then s:=ml_private.select_choice(s,kind,a,at,jsonb_build_object('source',task->'source')); end if;
    elsif not (p->>'skillUsed')::boolean then
     if (kind='lemon-support' and (p->>'ap')::int>=1) or (kind='runner-roll' and (p->>'ap')::int>=2) then s:=ml_private.select_choice(s,kind,a,at); end if;
     if kind='teleport' then cells:=ml_private.teleport_cells(s,a); if jsonb_array_length(cells)>0 then s:=ml_private.select_choice(s,kind,a,at,jsonb_build_object('cells',cells)); end if; end if;
    end if;
   else raise exception '未知内部任务';
  end case;
 end loop; return s;
end $$;
create or replace function ml_private.end_turn(s jsonb,at double precision,timeout boolean default false) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare a integer:=(s->>'active')::int; begin
 if s->'movement'<>'null'::jsonb then s:=ml_private.put_player(s,a,(s->'players'->a)||jsonb_build_object('cell',s#>'{movement,lastEmpty}')); s:=jsonb_set(s,'{movement}','null'); s:=ml_private.emit(s,'move','移动结束，落点'||(s->'players'->a->>'cell')||'，剩余额度作废'); end if;
 s:=s||jsonb_build_object('phase','resolving','queue',(s->'queue')||jsonb_build_array(jsonb_build_object('kind',case when timeout then 'discard' else 'end-draw' end))); return ml_private.pump(s,at);
end $$;
create or replace function ml_private.choose(s jsonb,cmd jsonb,at double precision,timeout boolean default false) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s->'choice'; a integer:=(c->>'actor')::int; p jsonb:=s->'players'->a; kind text:=c->>'kind'; card text:=cmd->>'card'; cell text:=cmd->>'cell'; cards jsonb; actor integer; paid integer; begin
 perform ml_private.need(cmd->'choice'=c->'id','选择窗口已过期'); perform ml_private.need((cmd->>'actor')::int=a,'请交给待选择的座位操作');
 case kind
  when 'draw-start','draw-end' then if coalesce((cmd->>'accept')::boolean,false) then s:=ml_private.draw(s,a,1); end if;
  when 'response' then if card is not null and card<>'' then perform ml_private.need(c->'cards' ? card,'此牌不能响应'); paid:=(ml_private.card(card)->>'cost')::int; p:=p||jsonb_build_object('ap',(p->>'ap')::int-paid,'hand',(p->'hand')-card); s:=ml_private.put_player(s,a,p); s:=s||jsonb_build_object('resolving',(s->'resolving')||to_jsonb(card)); s:=jsonb_set(s,'{attack,cancelled}',(s#>'{attack,cancelled}')||to_jsonb(a)); if ml_private.card(card)->>'id'='basic-002' then s:=jsonb_set(s,'{attack,elbows}',(s#>'{attack,elbows}')||to_jsonb(a)); end if; s:=ml_private.emit(s,'response',ml_private.name(s,a)||' 使用'||(ml_private.card(card)->>'name')||'，支付'||paid||'AP'); else s:=ml_private.emit(s,'response',ml_private.name(s,a)||' 放弃响应'); end if;
  when 'lemon-reward' then if coalesce((cmd->>'accept')::boolean,false) then actor:=(c->>'source')::int; s:=ml_private.put_player(s,actor,(s->'players'->actor)||jsonb_build_object('rewarded',(s->'players'->actor->'rewarded')||to_jsonb(a))); s:=ml_private.draw(s,a,1); end if;
  when 'lemon-support' then if coalesce((cmd->>'accept')::boolean,false) then perform ml_private.need((p->>'ap')::int>=1 and not (p->>'skillUsed')::boolean,'支援不可用'); s:=ml_private.put_player(s,a,p||jsonb_build_object('ap',(p->>'ap')::int-1,'skillUsed',true)); for actor in 0..3 loop if (s->'players'->actor->>'hp')::int>0 and (actor=a or (s->>'mode'='team' and s->'players'->actor->>'team'=p->>'team')) then s:=ml_private.draw(s,actor,1); end if; end loop; s:=ml_private.emit(s,'skill',ml_private.name(s,a)||' 支援，支付1AP'); end if;
  when 'runner-roll' then if coalesce((cmd->>'accept')::boolean,false) then perform ml_private.need((p->>'ap')::int>=2 and not (p->>'skillUsed')::boolean,'恢复判定不可用'); s:=ml_private.put_player(s,a,p||jsonb_build_object('skillUsed',true)); s:=ml_private.die(s,'跑者恢复'); paid:=(s->>'_roll')::int; s:=s-'_roll'; if paid>=4 then s:=jsonb_set(s,'{choice}','null'); return ml_private.select_choice(s,'runner-pay',a,at); end if; end if;
  when 'runner-pay' then if coalesce((cmd->>'accept')::boolean,false) then perform ml_private.need((p->>'ap')::int>=2,'恢复费用不足'); s:=ml_private.put_player(s,a,p||jsonb_build_object('ap',(p->>'ap')::int-2)); s:=ml_private.heal(s,a,1); s:=ml_private.emit(s,'skill',ml_private.name(s,a)||' 恢复支付2AP'); end if;
  when 'teleport' then if cell is not null and cell<>'' then perform ml_private.need(c->'cells' ? cell and ml_private.teleport_cells(s,a) ? cell,'传送须为距离≤3的空陆地'); s:=ml_private.put_player(s,a,p||jsonb_build_object('cell',cell,'skillUsed',true)); s:=ml_private.emit(s,'teleport',ml_private.name(s,a)||' 传送至'||cell||case when s->'safe' ? cell then '' else '（毒圈外）' end); end if;
  when 'discard' then cards:=coalesce(cmd->'cards','[]'); perform ml_private.need(jsonb_array_length(cards)=(c->>'count')::int and (select count(distinct x) from ml_private.arr(cards) x)=jsonb_array_length(cards) and p->'hand' @> cards,'请选择准确数量的不同手牌弃置'); select coalesce(jsonb_agg(x),'[]') into p from ml_private.arr(p->'hand') x where not (cards @> jsonb_build_array(x)); s:=ml_private.put_player(s,a,(s->'players'->a)||jsonb_build_object('hand',p)); s:=s||jsonb_build_object('discard',(s->'discard')||cards); s:=ml_private.emit(s,case when timeout then 'timeout-discard' else 'discard' end,ml_private.name(s,a)||case when timeout then ' 超时代弃' else ' 自选弃牌' end||jsonb_array_length(cards)||'张',cards);
  else raise exception '未知选择';
 end case;
 if timeout then s:=ml_private.emit(s,'timeout',ml_private.name(s,a)||' 选择超时：'||kind); end if;
 s:=s||jsonb_build_object('choice',null,'phase','resolving'); return ml_private.pump(s,at);
end $$;
create or replace function ml_private.expire(s jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare c jsonb:=s->'choice'; cmd jsonb; cards jsonb; begin
 if c<>'null'::jsonb and at>=(c->>'deadline')::double precision then
  if not (c->>'paused')::boolean and ml_private.budget(s,at)=0 then s:=s||jsonb_build_object('choice',null,'queue','[]'::jsonb,'clock',jsonb_build_object('remaining',0,'since',null)); s:=ml_private.emit(s,'timeout','60秒行动预算用完'); return ml_private.end_turn(s,at,true); end if;
  select coalesce(jsonb_agg(x),'[]') into cards from (select x from ml_private.arr(s->'players'->(c->>'actor')::int->'hand') x order by x limit (c->>'count')::int) q;
  cmd:=jsonb_build_object('id','timeout','revision',s->'revision','actor',c->'actor','type','choose','choice',c->'id','accept',false,'card',null,'cell',null);
  if c->>'kind'='discard' then cmd:=cmd||jsonb_build_object('cards',cards); end if; return ml_private.choose(s,cmd,at,true);
 end if;
 if c='null'::jsonb and s#>'{clock,since}'<>'null'::jsonb and ml_private.budget(s,at)=0 then s:=ml_private.pause(s,at); s:=ml_private.emit(s,'timeout','60秒行动预算用完'); return ml_private.end_turn(s,at,true); end if;
 return s;
end $$;
create or replace function ml_private.validate(s jsonb) returns void language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare p jsonb; zones jsonb; a integer; b integer; begin
 perform ml_private.need(s->>'version'='web-v0.1.1' and jsonb_array_length(s->'players')=4 and (s->>'round')::int between 1 and 12,'状态版本/轮次/人数无效');
 perform ml_private.need((select jsonb_agg(x order by x) from ml_private.arr(s->'order') x)='[0,1,2,3]'::jsonb and (select jsonb_agg(member->'character' order by member->'character') from ml_private.arr(s->'players') member)=(select jsonb_agg(x order by x) from ml_private.arr(ml_private.data('characterIds')) x),'角色/顺序无效');
 zones:=(s->'deck')||(s->'discard')||(s->'resolving');
 for a in 0..3 loop p:=s->'players'->a; zones:=zones||(p->'hand');
  perform ml_private.need((p->>'hp')::numeric=trunc((p->>'hp')::numeric) and (p->>'hp')::int between 0 and (p->>'maxHp')::int and p->'maxHp'=ml_private.data('characters')->(p->>'character')->'hp','生命状态无效');
  perform ml_private.need((p->>'ap')::numeric=trunc((p->>'ap')::numeric) and (p->>'ap')::int>=0 and (p->>'shield')::numeric=trunc((p->>'shield')::numeric) and (p->>'shield')::int between 0 and 2,'AP/护盾无效');
  perform ml_private.need(ml_private.data('map') ? (p->>'cell'),'位置无效');
  if (p->>'hp')::int=0 then perform ml_private.need((p->>'ap')::int=0 and (p->>'shield')::int=0 and p->'hand'='[]'::jsonb and p->'eliminated'<>'null'::jsonb,'淘汰清理无效'); end if;
  for b in 0..a-1 loop if (p->>'hp')::int>0 and (s->'players'->b->>'hp')::int>0 and p->'cell'=s->'players'->b->'cell' then perform ml_private.need(s->>'phase'='moving' and s->'movement'<>'null'::jsonb,'稳定落点不能重叠'); end if; end loop;
 end loop;
 perform ml_private.need((select jsonb_agg(x order by x) from ml_private.arr(zones) x)=(select jsonb_agg(x order by x) from ml_private.arr(ml_private.data('allCards')) x),'64张实体不守恒或实体重复');
 perform ml_private.need((s#>>'{clock,remaining}')::double precision>=0,'计时预算无效');
end $$;
create or replace function ml_private.data(k text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select value from ml_private.catalog where key=k $$;
create or replace function ml_private.arr(a jsonb) returns setof jsonb language sql immutable
set search_path=pg_catalog as $$ select value from jsonb_array_elements(coalesce(a,'[]'::jsonb)) $$;
create or replace function ml_private.n(a jsonb) returns bigint language sql immutable
set search_path=pg_catalog as $$ select (a#>>'{}')::bigint $$;
create or replace function ml_private.player(s jsonb,a integer) returns jsonb language sql immutable
set search_path=pg_catalog as $$ select s->'players'->a $$;
create or replace function ml_private.put_player(s jsonb,a integer,p jsonb) returns jsonb language sql immutable
set search_path=pg_catalog as $$ select jsonb_set(s,array['players',a::text],p) $$;
create or replace function ml_private.card(c text) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select ml_private.data('cards')->split_part(c,'#',1) $$;
create or replace function ml_private.name(s jsonb,a integer) returns text language sql stable
set search_path=pg_catalog,ml_private as $$ select 'S'||(a+1)||' '||(ml_private.data('characters')->(s->'players'->a->>'character')->>'name') $$;
create or replace function ml_private.enemy(s jsonb,a integer,b integer) returns boolean language sql immutable
set search_path=pg_catalog as $$ select a<>b and (s->>'mode'='ffa' or s->'players'->a->>'team'<>s->'players'->b->>'team') $$;
create or replace function ml_private.emit(s jsonb,t text,txt text,d jsonb default null) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select s||jsonb_build_object('eventSerial',(s->>'eventSerial')::bigint+1,'events',(s->'events')||(jsonb_build_object('seq',(s->>'eventSerial')::bigint+1,'type',t,'text',txt)||case when d is null then '{}'::jsonb else jsonb_build_object('data',d) end))
$$;
create or replace function ml_private.entropy(n bigint) returns bigint language plpgsql volatile
set search_path=pg_catalog as $$ declare v bigint; lim bigint; begin
 if n<1 or n>4294967296 then raise exception '随机范围无效'; end if;
 lim:=floor(4294967296::numeric/n)*n;
 loop v:=('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint; exit when v<lim; end loop;
 return v%n;
end $$;
create or replace function ml_private.int(s jsonb,bound integer) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare v bigint; t bigint; seed bigint; lim bigint; begin
 if coalesce((s#>>'{random,secure}')::boolean,false) then return s||jsonb_build_object('_int',ml_private.entropy(bound)); end if;
 lim:=floor(4294967296::numeric/bound)*bound;
 loop
  seed:=((s#>>'{random,seed}')::bigint+1831565813)%4294967296;
  s:=jsonb_set(s,'{random,seed}',to_jsonb(seed));
  t:=mod((seed # (seed>>15))::numeric*(seed|1),4294967296)::bigint;
  t:=t # mod(t::numeric+mod((t # (t>>7))::numeric*(t|61),4294967296),4294967296)::bigint;
  v:=t # (t>>14); exit when v<lim;
 end loop;
 return s||jsonb_build_object('_int',v%bound);
end $$;
create or replace function ml_private.shuffle(s jsonb,items jsonb) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare i integer; j integer; a jsonb:=items; x jsonb; begin
 i:=jsonb_array_length(a)-1;
 while i>0 loop s:=ml_private.int(s,i+1); j:=(s->>'_int')::integer; x:=a->i; a:=jsonb_set(a,array[i::text],a->j); a:=jsonb_set(a,array[j::text],x); i:=i-1; end loop;
 return (s-'_int')||jsonb_build_object('_shuffle',a);
end $$;
create or replace function ml_private.die(s jsonb,reason text) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare v integer; begin
 if jsonb_array_length(s#>'{random,dice}')>0 then v:=(s#>>'{random,dice,0}')::integer; s:=jsonb_set(s,'{random,dice}',(s#>'{random,dice}')-0);
 else s:=ml_private.int(s,6); v:=(s->>'_int')::integer+1; s:=s-'_int'; end if;
 perform ml_private.need(v between 1 and 6,'骰子无效');
 return ml_private.emit(s,'dice',reason||'：d6 = '||v,to_jsonb(v))||jsonb_build_object('_roll',v);
end $$;
create or replace function ml_private.budget(s jsonb,at double precision) returns double precision language sql immutable
set search_path=pg_catalog as $$ select greatest(0,(s#>>'{clock,remaining}')::double precision-case when s#>'{clock,since}'='null'::jsonb then 0 else greatest(0,at-(s#>>'{clock,since}')::double precision) end) $$;
create or replace function ml_private.pause(s jsonb,at double precision) returns jsonb language sql immutable
set search_path=pg_catalog,ml_private as $$ select s||jsonb_build_object('clock',jsonb_build_object('remaining',ml_private.budget(s,at),'since',null)) $$;
create or replace function ml_private.resume(s jsonb,at double precision) returns jsonb language sql immutable
set search_path=pg_catalog as $$ select case when s#>'{clock,since}'='null'::jsonb then jsonb_set(s,'{clock,since}',to_jsonb(at)) else s end $$;
create or replace function ml_private.safe(r integer) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$
 select coalesce(jsonb_agg(c->'id'),'[]') from ml_private.arr(ml_private.data('cells')) c where
 r<=3 or (r<=5 and (c->>'col')::int between 2 and 7) or (r>5 and r<=7 and (c->>'col')::int between 3 and 6)
 or (r>7 and r<=9 and (c->>'row')::int between 2 and 3 and (c->>'col')::int between 3 and 6)
 or (r>9 and (c->>'row')::int between 2 and 3 and (c->>'col')::int between 3 and 5)
$$;
create or replace function ml_private.distance(a text,b text) returns integer language sql stable
set search_path=pg_catalog,ml_private as $$ select abs((ml_private.data('map')->a->>'row')::int-(ml_private.data('map')->b->>'row')::int)+abs((ml_private.data('map')->a->>'col')::int-(ml_private.data('map')->b->>'col')::int) $$;
create or replace function ml_private.neighbor(a text,b text) returns boolean language sql stable
set search_path=pg_catalog,ml_private as $$ select a<>b and exists(select 1 from ml_private.arr(ml_private.data('cells')) x, ml_private.arr(ml_private.data('cells')) y where x->>'region'=a and y->>'region'=b and ml_private.distance(x->>'id',y->>'id')=1) $$;
create or replace function ml_private.candidates(r integer) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(to_jsonb(region) order by first_pos),'[]') from (select c->>'region' region,min(ord) first_pos from jsonb_array_elements(ml_private.data('cells')) with ordinality x(c,ord) where ml_private.safe(r) ? (c->>'id') group by c->>'region') q $$;
create or replace function ml_private.occupied(s jsonb,cell text,except_actor integer default -1) returns boolean language sql immutable
set search_path=pg_catalog,ml_private as $$ select exists(select 1 from ml_private.arr(s->'players') p where (p->>'hp')::int>0 and p->>'cell'=cell and (p->>'seat')::int<>except_actor) $$;
create or replace function ml_private.teleport_cells(s jsonb,a integer) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select coalesce(jsonb_agg(c->'id'),'[]') from ml_private.arr(ml_private.data('cells')) c where c->>'terrain'='land' and ml_private.distance(s->'players'->a->>'cell',c->>'id')<=3 and not ml_private.occupied(s,c->>'id') $$;
create or replace function ml_private.escape(s jsonb,a integer,cell text,left_steps integer) returns boolean language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare c jsonb; cost integer; begin
 if not ml_private.occupied(s,cell,a) then return true; end if;
 for c in select * from ml_private.arr(ml_private.data('cells')) loop
  cost:=case when c->>'terrain'='water' then 2 else 1 end;
  if cost<=left_steps and ml_private.distance(cell,c->>'id')=1 and ml_private.escape(s,a,c->>'id',left_steps-cost) then return true; end if;
 end loop; return false;
end $$;
create or replace function ml_private.legal_steps(s jsonb) returns jsonb language sql stable
set search_path=pg_catalog,ml_private as $$ select case when s->>'phase'<>'moving' or s->'movement'='null'::jsonb then '[]'::jsonb else
 (select coalesce(jsonb_agg(c->'id'),'[]') from ml_private.arr(ml_private.data('cells')) c where ml_private.distance(s->'players'->(s->>'active')::int->>'cell',c->>'id')=1 and ml_private.escape(s,(s->>'active')::int,c->>'id',(s#>>'{movement,remaining}')::int-case when c->>'terrain'='water' then 2 else 1 end) and (s#>>'{movement,remaining}')::int>=case when c->>'terrain'='water' then 2 else 1 end) end $$;
create or replace function ml_private.targets(s jsonb,a integer,card text) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare d jsonb:=ml_private.card(card); p jsonb; ids jsonb:='[]'; x integer; lemon integer; ar text; br text; begin
 if d is null or d->>'type'<>'attack' then return ids; end if;
 ar:=ml_private.data('map')->(s->'players'->a->>'cell')->>'region';
 for p in select * from ml_private.arr(s->'players') loop
  x:=(p->>'seat')::int; br:=ml_private.data('map')->(p->>'cell')->>'region';
  if (p->>'hp')::int>0 and ml_private.enemy(s,a,x) and not (coalesce((d->>'group')::boolean,false) and p->>'character'='character-027' and jsonb_array_length(p->'hand')=1)
   and (d->>'range'='global' or ar=br or (d->>'range'='adjacent' and ml_private.neighbor(ar,br))) then ids:=ids||to_jsonb(x); if p->>'character'='character-004' then lemon:=x; end if; end if;
 end loop;
 if not coalesce((d->>'group')::boolean,false) and lemon is not null then return jsonb_build_array(lemon); end if; return ids;
end $$;
create or replace function ml_private.draw(s jsonb,a integer,num integer) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a; i integer; actual integer:=0; supplied jsonb; begin
 if (p->>'hp')::int<=0 then return s; end if;
 for i in 1..num loop
  if jsonb_array_length(s->'deck')=0 and jsonb_array_length(s->'discard')>0 then
   supplied:=s#>'{random,reshuffles,0}';
   if supplied is not null then
    perform ml_private.need((select jsonb_agg(x order by x) from ml_private.arr(supplied) x)=(select jsonb_agg(x order by x) from ml_private.arr(s->'discard') x),'重洗实体不匹配');
    s:=jsonb_set(s,'{random,reshuffles}',(s#>'{random,reshuffles}')-0); s:=jsonb_set(s,'{deck}',supplied);
   elsif coalesce((s#>>'{random,sortedReshuffles}')::boolean,false) then s:=jsonb_set(s,'{deck}',(select jsonb_agg(x order by x) from ml_private.arr(s->'discard') x));
   else s:=ml_private.shuffle(s,s->'discard'); s:=jsonb_set(s,'{deck}',s->'_shuffle')-'_shuffle'; end if;
   s:=s||jsonb_build_object('discard','[]'::jsonb,'reshuffleCount',(s->>'reshuffleCount')::int+1); s:=ml_private.emit(s,'shuffle','抽牌堆空：将弃牌重洗（结算区保留）');
  end if;
  exit when jsonb_array_length(s->'deck')=0;
  p:=p||jsonb_build_object('hand',(p->'hand')||jsonb_build_array(s->'deck'->0)); s:=jsonb_set(s,'{deck}',(s->'deck')-0); actual:=actual+1;
 end loop;
 s:=ml_private.put_player(s,a,p); return ml_private.emit(s,'draw',ml_private.name(s,a)||' 摸'||actual||'张',jsonb_build_object('actor',a,'count',actual));
end $$;
create or replace function ml_private.heal(s jsonb,a integer,amount integer,food boolean default false) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare p jsonb:=s->'players'->a; old integer:=(p->>'hp')::int; hp integer:=old; begin
 if hp>0 and not (food and p->>'character'='character-027') then hp:=least((p->>'maxHp')::int,hp+amount); end if;
 s:=ml_private.put_player(s,a,p||jsonb_build_object('hp',hp)); return ml_private.emit(s,'heal',ml_private.name(s,a)||' 回复'||(hp-old)||'生命');
end $$;
create or replace function ml_private.select_choice(s jsonb,kind text,a integer,at double precision,extra jsonb default '{}') returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare paused boolean:=kind not in ('draw-start','draw-end'); serial integer:=(s->>'choiceSerial')::int+1; begin
 if paused then s:=ml_private.pause(s,at); else s:=ml_private.resume(s,at); end if;
 s:=s||jsonb_build_object('phase','choice','choiceSerial',serial,'choice',jsonb_build_object('id',serial,'kind',kind,'actor',a,'deadline',at+least(10000,case when paused then 10000 else ml_private.budget(s,at) end),'paused',paused)||extra);
 return ml_private.emit(s,'choice',ml_private.name(s,a)||' 等待选择：'||kind);
end $$;
create or replace function ml_private.damage(s jsonb,hits jsonb,environment boolean default false) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare h jsonb; p jsonb; a integer; src integer; blocked integer; loss integer; injured jsonb:='[]'; triggers jsonb:='[]'; begin
 s:=jsonb_set(s,'{batch}',to_jsonb((s->>'batch')::int+1));
 for h in select * from ml_private.arr(hits) loop
  a:=(h->>'target')::int; p:=s->'players'->a; if (p->>'hp')::int<=0 or (h->>'amount')::int<=0 then continue; end if;
  blocked:=case when environment then 0 else least((p->>'shield')::int,(h->>'amount')::int) end; loss:=least((p->>'hp')::int,(h->>'amount')::int-blocked);
  p:=p||jsonb_build_object('shield',(p->>'shield')::int-blocked,'hp',(p->>'hp')::int-loss); s:=ml_private.put_player(s,a,p); src:=(h->>'source')::int;
  if src is not null and ml_private.enemy(s,src,a) then s:=ml_private.put_player(s,src,(s->'players'->src)||jsonb_build_object('damage',(s->'players'->src->>'damage')::int+loss,'kills',(s->'players'->src->>'kills')::int+case when (p->>'hp')::int=0 and loss>0 then 1 else 0 end)); end if;
  s:=ml_private.emit(s,'damage',ml_private.name(s,a)||' '||case when environment then '环境' else '普通' end||'伤害'||(h->>'amount')||'，护盾抵挡'||blocked||'，实际失血'||loss,h||jsonb_build_object('blocked',blocked,'loss',loss,'batch',s->'batch'));
  if loss>0 then injured:=injured||jsonb_build_array(h||jsonb_build_object('loss',loss)); end if;
 end loop;
 for a in 0..3 loop p:=s->'players'->a; if (p->>'hp')::int=0 and p->'eliminated'='null'::jsonb then
  s:=s||jsonb_build_object('discard',(s->'discard')||(p->'hand')); p:=p||jsonb_build_object('eliminated',s->'batch','ap',0,'shield',0,'hand','[]'::jsonb); s:=ml_private.put_player(s,a,p); s:=ml_private.emit(s,'eliminate',ml_private.name(s,a)||' 淘汰（批次'||(s->>'batch')||'）'); end if; end loop;
 for a in select ml_private.n(x)::int from ml_private.arr(s->'order') x loop
  p:=s->'players'->a; select x into h from ml_private.arr(injured) x where (x->>'target')::int=a limit 1;
  if h is null or (p->>'hp')::int<=0 then continue; end if; src:=(h->>'source')::int;
  if p->>'character'='character-004' then
   if src is not null and h->>'category'='attack' and ml_private.enemy(s,src,a) and (s->'players'->src->>'hp')::int>0 and not (p->'rewarded' @> jsonb_build_array(src)) then triggers:=triggers||jsonb_build_array(jsonb_build_object('kind','trigger','actor',src,'trigger','lemon-reward','source',a)); end if;
   triggers:=triggers||jsonb_build_array(jsonb_build_object('kind','trigger','actor',a,'trigger','lemon-support'));
  elsif p->>'character'='character-031' then triggers:=triggers||jsonb_build_array(jsonb_build_object('kind','trigger','actor',a,'trigger','runner-roll'));
  elsif p->>'character'='character-037' then triggers:=triggers||jsonb_build_array(jsonb_build_object('kind','trigger','actor',a,'trigger','teleport')); end if;
 end loop; return s||jsonb_build_object('_triggers',triggers);
end $$;
create or replace function ml_private.create_game(setup jsonb,at double precision) returns jsonb language plpgsql volatile
set search_path=pg_catalog,ml_private as $$ declare s jsonb; chars jsonb; pair jsonb; teams jsonb; deck jsonb; firstn integer; a integer; c jsonb; id text; players jsonb:='[]'; randomj jsonb; begin
 perform ml_private.need(jsonb_typeof(setup)='object' and setup->>'mode' in ('ffa','team') and at>=0,'开局输入无效');
 perform ml_private.need((select jsonb_agg(x order by x) from ml_private.arr(setup->'seats') x)='[0,1,2,3]'::jsonb,'必须有四个固定座位');
 perform ml_private.need(jsonb_typeof(setup->'seed')='number' and (setup->>'seed')::numeric=trunc((setup->>'seed')::numeric) and (setup->>'seed')::numeric between 0 and 4294967295,'种子必须为uint32');
 randomj:=jsonb_build_object('seed',setup->'seed','dice',coalesce(setup->'dice','[]'),'bombs',coalesce(setup->'bombs','[]'),'reshuffles',coalesce(setup->'reshuffles','[]'),'sortedReshuffles',coalesce(setup->'sortedReshuffles','false'));
 if coalesce((setup->>'secure')::boolean,false) then randomj:=randomj||jsonb_build_object('secure',true); end if;
 s:=jsonb_build_object('random',randomj);
 if setup ? 'characters' then chars:=setup->'characters'; else s:=ml_private.shuffle(s,ml_private.data('characterIds')); chars:=s->'_shuffle'; s:=s-'_shuffle'; end if;
 perform ml_private.need((select jsonb_agg(x order by x) from ml_private.arr(chars) x)=(select jsonb_agg(x order by x) from ml_private.arr(ml_private.data('characterIds')) x),'四角色必须完整且唯一');
 s:=ml_private.shuffle(s,'[0,1,2,3]'); pair:=jsonb_build_array(s->'_shuffle'->0,s->'_shuffle'->1); s:=s-'_shuffle';
 teams:=setup->'teams'; if teams is null then teams:='[]'; for a in 0..3 loop teams:=teams||to_jsonb(case when pair @> jsonb_build_array(a) then 'A' else 'B' end); end loop; end if;
 if setup->>'mode'='team' then perform ml_private.need(jsonb_array_length(teams)=4 and (select count(*) from ml_private.arr(teams) x where x='"A"')=2 and (select count(*) from ml_private.arr(teams) x where x='"B"')=2,'团战必须2对2'); end if;
 if setup ? 'first' then firstn:=(setup->>'first')::int; else s:=ml_private.int(s,4); firstn:=(s->>'_int')::int; s:=s-'_int'; end if; perform ml_private.need(firstn between 0 and 3,'首位无效');
 if setup ? 'deck' then deck:=setup->'deck'; else s:=ml_private.shuffle(s,ml_private.data('allCards')); deck:=s->'_shuffle'; s:=s-'_shuffle'; end if;
 perform ml_private.need((select jsonb_agg(x order by x) from ml_private.arr(deck) x)=(select jsonb_agg(x order by x) from ml_private.arr(ml_private.data('allCards')) x),'牌堆必须64实体完整排列');
 for a in 0..3 loop id:=chars->>a; c:=ml_private.data('characters')->id;
  players:=players||jsonb_build_array(jsonb_build_object('seat',a,'character',id,'team',case when setup->>'mode'='team' then teams->>a else 'S'||(a+1) end,'faction',c->'faction','hp',c->'hp','maxHp',c->'hp','ap',5,'shield',0,'cell',c->'spawn','hand','[]'::jsonb,'moved',false,'attacks',0,'skillUsed',false,'rewarded','[]'::jsonb,'kills',0,'damage',0,'eliminated',null));
 end loop;
 s:=s||jsonb_build_object('version','web-v0.1.1','revision',0,'time',at,'mode',setup->'mode','players',players,'order',(select jsonb_agg((firstn+i)%4) from generate_series(0,3) i),'cursor',0,'active',firstn,'round',1,'phase','resolving','deck',deck,'discard','[]'::jsonb,'resolving','[]'::jsonb,'queue','[]'::jsonb,'choice',null,'choiceSerial',0,'attack',null,'movement',null,'safe',ml_private.safe(1),'bomb',null,'forecast',null,'clock',jsonb_build_object('remaining',60000,'since',null),'events','[]'::jsonb,'eventSerial',0,'batch',0,'reshuffleCount',0,'seen','[]'::jsonb,'result',null);
 s:=ml_private.emit(s,'setup','四人'||case when setup->>'mode'='ffa' then '各自为战' else '2对2' end||' · web-v0.1.1'); for a in 0..3 loop s:=ml_private.draw(s,a,4); end loop;
 s:=ml_private.start_round(s,at); perform ml_private.validate(s); return s;
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
     s:=jsonb_set(s,'{movement}',m); if (m->>'remaining')::int=0 then s:=s||jsonb_build_object('movement',null,'phase','action'); end if;
    when 'stop' then perform ml_private.need(s->'movement'<>'null'::jsonb,'尚未开始移动'); perform ml_private.need(not ml_private.occupied(s,p->>'cell',a),'不能停在占用格'); s:=s||jsonb_build_object('movement',null,'phase','action'); s:=ml_private.emit(s,'move','主动结束移动，未用额度作废');
    when 'end' then perform ml_private.need(s->'movement'='null'::jsonb or not ml_private.occupied(s,p->>'cell',a),'不能在占用格结束行动'); s:=ml_private.end_turn(s,at);
    else
     perform ml_private.need(s->>'phase'='action','请先完成移动');
     if typ='move' then perform ml_private.need(not (p->>'moved')::boolean,'本个人回合已使用基础移动'); perform ml_private.need((p->>'ap')::int>=1,'移动需要1AP'); s:=ml_private.put_player(s,a,p||jsonb_build_object('ap',(p->>'ap')::int-1,'moved',true)); s:=ml_private.die(s,'基础移动'); left_steps:=ceil((s->>'_roll')::numeric/2)::int; s:=s-'_roll'; s:=s||jsonb_build_object('movement',jsonb_build_object('remaining',left_steps,'lastEmpty',p->'cell','origin',p->'cell','path',jsonb_build_array(p->'cell')),'phase','moving'); s:=ml_private.emit(s,'cost',ml_private.name(s,a)||' 移动支付1AP，获得'||left_steps||'步');
     elsif typ='play' then
      d:=ml_private.card(card); targets:=cmd->'targets'; perform ml_private.need(p->'hand' ? card,'手中没有该实体牌'); perform ml_private.need(d is not null and d->>'type'<>'response','响应牌只能在对应窗口使用'); cost:=(d->>'cost')::int; perform ml_private.need((p->>'ap')::int>=cost,'行动点不足');
      if d->>'type'='attack' then perform ml_private.need((p->>'attacks')::int<2,'本回合最多两张攻击'); perform ml_private.need(jsonb_array_length(targets) between 1 and case when coalesce((d->>'group')::boolean,false) then 2 else 1 end and (select count(distinct x) from ml_private.arr(targets) x)=jsonb_array_length(targets),'目标数量无效'); perform ml_private.need(ml_private.targets(s,a,card) @> targets,'目标不合法：检查范围、队伍、lemon嘲讽或群体免疫');
      else perform ml_private.need(targets='[]'::jsonb,'补给只能对自己'); end if;
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
create or replace function ml_private.public_view(s jsonb,viewer integer) returns jsonb language plpgsql stable
set search_path=pg_catalog,ml_private as $$ declare result jsonb; players jsonb:='[]'; p jsonb; c jsonb:=s->'choice'; events jsonb; legal jsonb:='{}'; card text; begin
 perform ml_private.need(viewer between 0 and 3,'无效视图身份');
 for p in select * from ml_private.arr(s->'players') loop players:=players||jsonb_build_array((p-'hand')||jsonb_build_object('handCount',jsonb_array_length(p->'hand'))||case when (p->>'seat')::int=viewer then jsonb_build_object('hand',p->'hand') else '{}'::jsonb end); end loop;
 if c<>'null'::jsonb then c:=jsonb_strip_nulls(jsonb_build_object('id',c->'id','kind',c->'kind','actor',c->'actor','deadline',c->'deadline','source',c->'source'))||case when (c->>'actor')::int=viewer then (s->'choice')-'paused'-'id'-'kind'-'actor'-'deadline'-'source' else '{}'::jsonb end; end if;
 select coalesce(jsonb_agg(e-'data'),'[]') into events from ml_private.arr(s->'events') e;
 result:=s-'players'-'deck'-'random'-'queue'-'seen'-'time'-'cursor'-'choiceSerial'-'eventSerial'-'batch'-'reshuffleCount';
 result:=result||jsonb_build_object('players',players,'deckCount',jsonb_array_length(s->'deck'),'choice',c,'events',events);
 for card in select x#>>'{}' from ml_private.arr(s->'players'->viewer->'hand') x loop legal:=legal||jsonb_build_object(card,ml_private.targets(s,viewer,card)); end loop;
 return result||jsonb_build_object('actions',jsonb_build_object('targets',legal,'steps',case when viewer=(s->>'active')::int then ml_private.legal_steps(s) else '[]'::jsonb end));
end $$;
