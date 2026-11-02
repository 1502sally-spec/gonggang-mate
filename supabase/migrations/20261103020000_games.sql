-- 게임 결과 (src/api/games.ts) — PRD S16. 무작위 결과는 서버가 정한다
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (처음 한 번만)
-- 에러는 raise exception '화면에 보여 줄 문장' using hint = 'ApiError code' 모양으로 낸다 (api/supabaseHelpers.ts toApiError)
-- 결과 모양은 src/lib/gameResult.ts와 약속한 형식이다

-- 방장이 약속을 취소해 닫힌 채팅방인지. 아래 함수들 안에서만 쓴다
create function public.is_room_closed(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_rooms r join public.posts p on p.id = r.post_id
    where r.id = p_room_id and p.status = 'closed'
  );
$$;

-- 입력한 항목 목록을 다듬어서 돌려준다 (공백 제거). 사다리·돌림판에서 쓴다
create function public.clean_game_items(p_items jsonb) returns text[]
language plpgsql immutable set search_path = '' as $$
declare
  v_items text[];
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return array[]::text[]; end if;
  select coalesce(array_agg(trim(e.value) order by e.ord), array[]::text[]) into v_items
  from jsonb_array_elements_text(p_items) with ordinality as e(value, ord);
  if exists (select 1 from unnest(v_items) i where char_length(i) not between 1 and 100) then
    raise exception '항목은 1~100자로 입력해 주세요' using hint = 'invalid_input';
  end if;
  return v_items;
end;
$$;

-- S16 '시작': 서버가 결과를 정한다. '다시 하기'면 또 부른다. 채팅방의 누구나 실행할 수 있다
create function public.run_game(p_room_id uuid, p_type text, p_participant_ids uuid[], p_options jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_count int := coalesce(array_length(p_participant_ids, 1), 0);
  v_options jsonb := coalesce(p_options, '{}'::jsonb);
  v_items text[];
  v_number int;
  v_result jsonb;
  v_run public.game_runs;
begin
  if not public.is_room_member(p_room_id) then raise exception '이 채팅방 참여자가 아니에요' using hint = 'not_allowed'; end if;
  if public.is_room_closed(p_room_id) then raise exception '닫힌 채팅방이에요' using hint = 'not_allowed'; end if;
  if v_count < 2 then raise exception '참여자는 2명 이상이어야 해요' using hint = 'invalid_input'; end if;
  if (select count(distinct p) from unnest(p_participant_ids) p) <> v_count
    or (select count(*) from public.chat_members m where m.room_id = p_room_id and m.user_id = any(p_participant_ids)) <> v_count then
    raise exception '채팅방 참여자만 고를 수 있어요' using hint = 'invalid_input';
  end if;

  case p_type
    when 'ladder' then
      v_items := public.clean_game_items(v_options -> 'items');
      if coalesce(array_length(v_items, 1), 0) <> v_count then
        raise exception '참여자 수만큼 항목을 입력해 주세요' using hint = 'invalid_input';
      end if;
      v_options := jsonb_build_object('items', to_jsonb(v_items));
      select jsonb_build_object('pairs', jsonb_agg(jsonb_build_object('user_id', p.id, 'item', i.item) order by p.ord)) into v_result
      from unnest(p_participant_ids) with ordinality as p(id, ord)
      join (select x as item, row_number() over (order by random()) as ord from unnest(v_items) x) i on i.ord = p.ord;

    when 'draw' then
      v_number := coalesce((v_options ->> 'winners')::int, 1);
      if v_number < 1 or v_number >= v_count then
        raise exception '당첨 인원은 참여자 수보다 적어야 해요' using hint = 'invalid_input';
      end if;
      v_options := jsonb_build_object('winners', v_number);
      select jsonb_build_object('winner_ids', jsonb_agg(s.id)) into v_result
      from (select p as id from unnest(p_participant_ids) p order by random() limit v_number) s;

    when 'order' then
      v_options := '{}'::jsonb;
      select jsonb_build_object('order_ids', jsonb_agg(s.id)) into v_result
      from (select p as id from unnest(p_participant_ids) p order by random()) s;

    when 'wheel' then
      v_items := public.clean_game_items(v_options -> 'items');
      if coalesce(array_length(v_items, 1), 0) = 0 then -- 기본값: 참여자 이름
        select array_agg(u.nickname order by p.ord) into v_items
        from unnest(p_participant_ids) with ordinality as p(id, ord) join public.users u on u.id = p.id;
      end if;
      if array_length(v_items, 1) not between 2 and 10 then
        raise exception '항목은 2~10개여야 해요' using hint = 'invalid_input';
      end if;
      v_options := jsonb_build_object('items', to_jsonb(v_items));
      select jsonb_build_object('item', x) into v_result from unnest(v_items) x order by random() limit 1;

    when 'teams' then
      v_number := coalesce((v_options ->> 'teams')::int, 2);
      if v_number < 2 or v_number > v_count then
        raise exception '팀 수는 2 이상, 참여자 수 이하여야 해요' using hint = 'invalid_input';
      end if;
      v_options := jsonb_build_object('teams', v_number);
      select jsonb_build_object('teams', jsonb_agg(t.members order by t.team)) into v_result
      from (
        select (s.rn - 1) % v_number as team, jsonb_agg(s.id) as members
        from (select p as id, row_number() over (order by random()) as rn from unnest(p_participant_ids) p) s
        group by 1
      ) t;

    else
      raise exception '없는 게임이에요' using hint = 'invalid_input';
  end case;

  insert into public.game_runs (room_id, run_by, type, participants, options, result)
  values (p_room_id, auth.uid(), p_type, p_participant_ids, v_options, v_result)
  returning * into v_run;
  return to_jsonb(v_run);
end;
$$;

-- S16 '결과 채팅방에 공유하기' (실행한 사람만, 한 번만) → game_result 메시지. 보낸 사람 = 실행한 사람
create function public.share_game(p_game_run_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.game_runs;
begin
  select * into v_run from public.game_runs where id = p_game_run_id for update;
  if v_run.id is null then raise exception '게임 결과를 찾을 수 없어요' using hint = 'not_found'; end if;
  if v_run.run_by is distinct from auth.uid() or not public.is_room_member(v_run.room_id) then
    raise exception '게임을 실행한 사람만 공유할 수 있어요' using hint = 'not_allowed';
  end if;
  if public.is_room_closed(v_run.room_id) then raise exception '닫힌 채팅방이에요' using hint = 'not_allowed'; end if;
  if v_run.shared then raise exception '이미 공유한 결과예요' using hint = 'already_exists'; end if;

  update public.game_runs set shared = true where id = p_game_run_id;
  insert into public.messages (room_id, sender_id, type, body, payload)
  values (
    v_run.room_id, auth.uid(), 'game_result',
    case v_run.type -- api/games.ts GAME_LABELS와 같게 유지
      when 'ladder' then '사다리 타기'
      when 'draw' then '당첨자 추첨'
      when 'order' then '순서 정하기'
      when 'wheel' then '돌림판'
      when 'teams' then '팀 나누기'
    end || ' 결과',
    jsonb_build_object('game_run_id', v_run.id, 'type', v_run.type, 'options', v_run.options, 'result', v_run.result)
  );
end;
$$;

revoke execute on function public.is_room_closed(uuid) from public, anon, authenticated;
revoke execute on function public.clean_game_items(jsonb) from public, anon, authenticated;
revoke execute on function public.run_game(uuid, text, uuid[], jsonb) from public, anon;
revoke execute on function public.share_game(uuid) from public, anon;
grant execute on function public.run_game(uuid, text, uuid[], jsonb) to authenticated;
grant execute on function public.share_game(uuid) to authenticated;
