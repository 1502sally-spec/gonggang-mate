-- 디자인 반영과 함께 추가된 기능 (11/3 결정, docs/DECISIONS.md)
-- 실행: Supabase 대시보드 → SQL Editor에 이 파일 전체를 붙여넣고 Run (처음 한 번만)
-- 에러는 raise exception '화면에 보여 줄 문장' using hint = 'ApiError code' 모양으로 낸다 (api/supabaseHelpers.ts toApiError)
--
-- 1. 현재 활동 여부: 최근 15분 안에 앱을 쓴 사람 = 활동 중 (마지막 접속 시각 자체는 공개하지 않는다)
-- 2. 후기 문항 변경(디자인): profile_match → communication, kept_budget → ice_breaker
-- 3. 메이트 하트: 5문항 중 3개 이상 체크하면 +1 (HEART_THRESHOLD = 3)
-- 4. 후기는 약속 '시작' 이후부터 쓸 수 있다 (약속카드 '완료 및 후기' 버튼)
-- 5. 일정 변경 (방장만, 시작 전): 시간·장소·활동을 바꾸고 채팅방에 "일정이 변경되었어요"
-- 6. 1:1 채팅방: 상대 프로필의 '1:1 채팅'. 같은 두 사람의 방은 하나. 대화와 게임만 (약속 확정 없음). 차단 사이엔 못 만든다

-- ───────────────────────── 1. 현재 활동 여부 ─────────────────────────

alter table public.users add column last_active_at timestamptz;
-- last_active_at은 다른 사용자가 읽지 못한다 (users의 select 권한은 칸 단위로 준 목록에 없음). '활동 중' 여부만 아래 함수들이 알려 준다

-- 앱이 켜져 있는 동안 몇 분마다 부른다 (src/app/_layout.tsx)
create function public.touch_active() returns void
language sql security definer set search_path = '' as $$
  update public.users set last_active_at = now() where id = auth.uid();
$$;

-- 최근 15분 안에 활동했는지. 아래 함수들 안에서만 쓴다 (config.ts ACTIVE_WITHIN_MINUTES와 같게 유지)
create function public.is_user_active(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.last_active_at > now() - interval '15 minutes' from public.users u where u.id = p_user_id), false);
$$;

-- S07 매칭 목록: 작성자 활동 여부(author_is_active)를 더한다. 나머지 규칙은 *_free_slots_posts.sql과 같다
drop function public.get_matching_posts(text);
create function public.get_matching_posts(p_category text)
returns table (
  id uuid, room_id uuid, category text, title text, content_preview text,
  weekday smallint, start_time text, end_time text, start_at timestamptz, end_at timestamptz,
  thumbnail_url text, author_id uuid, author_nickname text, author_photo_url text, author_is_active boolean,
  member_count int, is_mine boolean, my_request text, created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    p.id, r.id, p.category, p.title, left(p.content, 60),
    p.weekday, to_char(p.start_time, 'HH24:MI'), to_char(p.end_time, 'HH24:MI'), p.start_at, p.end_at,
    (select ph.url from public.post_photos ph where ph.post_id = p.id order by ph.sort_order limit 1),
    u.id, u.nickname, u.photo_url, public.is_user_active(u.id),
    (select count(*)::int from public.chat_members m where m.room_id = r.id),
    p.author_id = auth.uid(),
    case
      when exists (select 1 from public.chat_members m where m.room_id = r.id and m.user_id = auth.uid()) then 'accepted'
      else coalesce((
        select case j.status when 'pending' then 'pending' when 'rejected' then 'rejected' else 'none' end
        from public.join_requests j
        where j.room_id = r.id and j.requester_id = auth.uid()
        order by j.created_at desc limit 1
      ), 'none')
    end,
    p.created_at
  from public.posts p
  join public.chat_rooms r on r.post_id = p.id
  join public.users u on u.id = p.author_id
  where p.category = p_category
    and p.status = 'open'
    and p.end_at > now()
    and not public.is_blocked_with(p.author_id)
    and (
      p.author_id = auth.uid()
      or (
        select count(*) from public.free_slots f
        where f.user_id = auth.uid() and f.weekday = p.weekday
          and f.slot_start >= p.start_time and f.slot_start < p.end_time
      ) * 30 >= 30
    )
  order by p.created_at desc;
$$;

-- ───────────────────────── 2~4. 후기 문항, 하트 3개, 시작 후 작성 ─────────────────────────

alter table public.reviews rename column profile_match to communication;
alter table public.reviews rename column kept_budget to ice_breaker;

-- S17 '후기 남기기': 한 약속에서 한 메이트에게 1회, 수정 불가. 3개(HEART_THRESHOLD) 이상 체크하면 받은 사람 하트 +1
create or replace function public.submit_review(p_appointment_id uuid, p_target_id uuid, p_answers jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_appointment public.appointments;
  v_communication boolean := coalesce((p_answers ->> 'communication')::boolean, false);
  v_on_time boolean := coalesce((p_answers ->> 'on_time')::boolean, false);
  v_kind_manner boolean := coalesce((p_answers ->> 'kind_manner')::boolean, false);
  v_ice_breaker boolean := coalesce((p_answers ->> 'ice_breaker')::boolean, false);
  v_meet_again boolean := coalesce((p_answers ->> 'meet_again')::boolean, false);
  v_heart_added boolean;
begin
  if p_target_id = auth.uid() then raise exception '자기 자신에게는 후기를 남길 수 없어요' using hint = 'invalid_input'; end if;
  select * into v_appointment from public.appointments where id = p_appointment_id;
  if v_appointment.id is null or v_appointment.status = 'canceled' then raise exception '약속을 찾을 수 없어요' using hint = 'not_found'; end if;
  if v_appointment.start_at > now() then raise exception '약속이 시작된 뒤에 후기를 남길 수 있어요' using hint = 'not_allowed'; end if;
  if (
    select count(*) from public.appointment_members
    where appointment_id = p_appointment_id and user_id in (auth.uid(), p_target_id) and canceled_at is null
  ) <> 2 then
    raise exception '함께한 메이트에게만 후기를 남길 수 있어요' using hint = 'not_allowed';
  end if;

  insert into public.reviews (appointment_id, reviewer_id, target_id, communication, on_time, kind_manner, ice_breaker, meet_again)
  values (p_appointment_id, auth.uid(), p_target_id, v_communication, v_on_time, v_kind_manner, v_ice_breaker, v_meet_again)
  on conflict (appointment_id, reviewer_id, target_id) do nothing;
  if not found then raise exception '이미 후기를 남겼어요' using hint = 'already_exists'; end if;

  v_heart_added := (v_communication::int + v_on_time::int + v_kind_manner::int + v_ice_breaker::int + v_meet_again::int) >= 3;
  if v_heart_added then
    update public.users set heart_count = heart_count + 1 where id = p_target_id;
  end if;
  return v_heart_added;
end;
$$;

-- S13·S04: 메이트 정보. 후기는 누가 남겼는지 숨기고 항목별 합계만. 활동 여부(is_active) 추가. 차단 관계면 볼 수 없다
create or replace function public.get_mate_info(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if public.is_blocked_with(p_user_id) then raise exception '볼 수 없는 사용자예요' using hint = 'not_allowed'; end if;
  select jsonb_build_object(
    'id', u.id, 'nickname', u.nickname, 'gender', u.gender, 'bio', u.bio, 'photo_url', u.photo_url, 'heart_count', u.heart_count,
    'is_active', public.is_user_active(u.id),
    'meet_count', (
      select count(*)::int
      from public.appointment_members m join public.appointments a on a.id = m.appointment_id
      where m.user_id = u.id and m.canceled_at is null and a.status <> 'canceled' and a.end_at < now()
    ),
    'review_counts', (
      select jsonb_build_object(
        'communication', count(*) filter (where rv.communication),
        'on_time', count(*) filter (where rv.on_time),
        'kind_manner', count(*) filter (where rv.kind_manner),
        'ice_breaker', count(*) filter (where rv.ice_breaker),
        'meet_again', count(*) filter (where rv.meet_again)
      )
      from public.reviews rv where rv.target_id = u.id
    )
  ) into v_result
  from public.users u where u.id = p_user_id;
  if v_result is null then raise exception '사용자를 찾을 수 없어요' using hint = 'not_found'; end if;
  return v_result;
end;
$$;

-- ───────────────────────── 5. 약속카드 버튼 상태 + 일정 변경 ─────────────────────────

-- 약속카드 하나: can_reschedule(방장, 시작 전), can_complete(시작 후 = '완료 및 후기') 추가
create or replace function public.appointment_item(p_appointment_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id,
    'room_id', a.room_id,
    'category', p.category,
    'title', p.title,
    'start_at', a.start_at,
    'end_at', a.end_at,
    'place', a.place,
    'activity', a.activity,
    'status', a.status,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nickname', u.nickname, 'photo_url', u.photo_url) order by u.id = r.host_id desc, u.nickname), '[]'::jsonb)
      from public.appointment_members m join public.users u on u.id = m.user_id
      where m.appointment_id = a.id and m.canceled_at is null
    ),
    'is_host', r.host_id = auth.uid(),
    'can_cancel', a.status = 'confirmed' and a.start_at > now(),
    'can_reschedule', a.status = 'confirmed' and a.start_at > now() and r.host_id = auth.uid(),
    'can_complete', a.status = 'confirmed' and a.start_at <= now(),
    'review_done', not exists (
      select 1 from public.appointment_members m
      where m.appointment_id = a.id and m.canceled_at is null and m.user_id <> auth.uid()
        and not exists (
          select 1 from public.reviews rv
          where rv.appointment_id = a.id and rv.reviewer_id = auth.uid() and rv.target_id = m.user_id
        )
    )
  )
  from public.appointments a
  join public.chat_rooms r on r.id = a.room_id
  join public.posts p on p.id = a.post_id
  where a.id = p_appointment_id;
$$;

-- S15 '일정 변경' (방장만, 시작 전): 시간·장소·활동을 바꾸고 채팅방에 알린다. 참여자의 약속카드 배지를 다시 켠다
create function public.update_appointment(
  p_appointment_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_place text, p_activity text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_appointment public.appointments;
  v_room public.chat_rooms;
begin
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if v_appointment.id is null then raise exception '약속을 찾을 수 없어요' using hint = 'not_found'; end if;
  select * into v_room from public.chat_rooms where id = v_appointment.room_id;
  if v_room.host_id is distinct from auth.uid() then raise exception '방장만 일정을 바꿀 수 있어요' using hint = 'not_allowed'; end if;
  if v_appointment.status <> 'confirmed' then raise exception '취소된 약속이에요' using hint = 'not_allowed'; end if;
  if v_appointment.start_at <= now() then raise exception '시작한 약속은 바꿀 수 없어요' using hint = 'not_allowed'; end if;
  if char_length(trim(coalesce(p_place, ''))) = 0 then raise exception '장소를 입력해 주세요' using hint = 'invalid_input'; end if;
  if p_end_at <= p_start_at then raise exception '끝나는 시간은 시작 시간보다 늦어야 해요' using hint = 'invalid_input'; end if;
  if p_start_at <= now() then raise exception '이미 지난 시간으로는 바꿀 수 없어요' using hint = 'invalid_input'; end if;

  update public.appointments
  set start_at = p_start_at, end_at = p_end_at, place = trim(p_place), activity = trim(coalesce(p_activity, ''))
  where id = p_appointment_id;
  update public.appointment_members
  set notified_at = null, seen_at = case when user_id = auth.uid() then seen_at end -- 30분 전 알림은 방장도 다시 받는다. 배지는 다른 참여자만
  where appointment_id = p_appointment_id and canceled_at is null;
  insert into public.messages (room_id, sender_id, type, body) values (v_room.id, null, 'system', '일정이 변경되었어요');

  return public.appointment_item(p_appointment_id);
end;
$$;

-- ───────────────────────── 6. 1:1 채팅방 ─────────────────────────

-- 채팅방 종류: post(게시물 그룹 방) / direct(1:1 방). 1:1 방은 게시물이 없다
alter table public.chat_rooms alter column post_id drop not null;
alter table public.chat_rooms add column kind text not null default 'post' check (kind in ('post', 'direct'));
-- 같은 두 사람의 1:1 방은 하나 (두 id를 정렬해 이어 붙인 값)
alter table public.chat_rooms add column direct_key text unique;
alter table public.chat_rooms add constraint chat_rooms_kind_shape_check
  check ((kind = 'post' and post_id is not null and direct_key is null) or (kind = 'direct' and post_id is null and direct_key is not null));

-- 1:1 방의 상대 id. 참여자 목록이 아니라 direct_key에서 꺼내서, 상대가 방을 나갔어도(차단 후 나가기 포함) 알 수 있다
create function public.direct_partner_id(p_direct_key text) returns uuid
language sql stable set search_path = '' as $$
  select (case when split_part(p_direct_key, ':', 1) = auth.uid()::text then split_part(p_direct_key, ':', 2) else split_part(p_direct_key, ':', 1) end)::uuid;
$$;

-- 게임 실행·공유를 막는 '닫힌 방': 방장이 약속을 취소한 게시물 방 + 상대와 차단 관계인 1:1 방
create or replace function public.is_room_closed(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_rooms r left join public.posts p on p.id = r.post_id
    where r.id = p_room_id
      and (p.status = 'closed' or (r.kind = 'direct' and public.is_blocked_with(public.direct_partner_id(r.direct_key))))
  );
$$;

-- S13 '1:1 채팅': 방이 있으면 그 방, 없으면 새로 만든다. 나간 적이 있으면 다시 참여시킨다. 방 id를 돌려준다
create function public.open_direct_room(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_room_id uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요' using hint = 'not_logged_in'; end if;
  if p_user_id = auth.uid() then raise exception '나와는 채팅할 수 없어요' using hint = 'invalid_input'; end if;
  if not exists (select 1 from public.users where id = p_user_id) then raise exception '사용자를 찾을 수 없어요' using hint = 'not_found'; end if;
  if not exists (select 1 from public.users where id = auth.uid()) then raise exception '프로필을 먼저 저장해 주세요' using hint = 'not_allowed'; end if;
  if public.is_blocked_with(p_user_id) then raise exception '채팅할 수 없는 사용자예요' using hint = 'not_allowed'; end if;

  v_key := least(auth.uid()::text, p_user_id::text) || ':' || greatest(auth.uid()::text, p_user_id::text);
  select id into v_room_id from public.chat_rooms where direct_key = v_key;
  if v_room_id is null then
    insert into public.chat_rooms (kind, direct_key, host_id) values ('direct', v_key, auth.uid())
    on conflict (direct_key) do nothing
    returning id into v_room_id;
    if v_room_id is null then select id into v_room_id from public.chat_rooms where direct_key = v_key; end if;
  end if;
  insert into public.chat_members (room_id, user_id) values (v_room_id, auth.uid()), (v_room_id, p_user_id)
  on conflict (room_id, user_id) do nothing;
  return v_room_id;
end;
$$;

-- S14 '확정': 1:1 방에서는 확정할 수 없다는 검사를 더한다. 나머지는 *_appointments.sql과 같다
create or replace function public.confirm_appointment(
  p_room_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_place text, p_activity text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.chat_rooms;
  v_appointment_id uuid;
begin
  select * into v_room from public.chat_rooms where id = p_room_id for update;
  if v_room.id is null then raise exception '채팅방을 찾을 수 없어요' using hint = 'not_found'; end if;
  if v_room.kind = 'direct' then raise exception '1:1 채팅방에서는 약속을 확정할 수 없어요' using hint = 'not_allowed'; end if;
  if v_room.host_id is distinct from auth.uid() then raise exception '방장만 약속을 확정할 수 있어요' using hint = 'not_allowed'; end if;
  if char_length(trim(coalesce(p_place, ''))) = 0 then raise exception '장소를 입력해 주세요' using hint = 'invalid_input'; end if;
  if p_end_at <= p_start_at then raise exception '끝나는 시간은 시작 시간보다 늦어야 해요' using hint = 'invalid_input'; end if;
  if p_start_at <= now() then raise exception '이미 지난 시간으로는 확정할 수 없어요' using hint = 'invalid_input'; end if;
  if exists (select 1 from public.appointments where room_id = p_room_id and status <> 'canceled') then
    raise exception '이미 확정된 약속이에요' using hint = 'already_exists';
  end if;

  update public.posts set status = 'confirmed' where id = v_room.post_id and status = 'open';
  if not found then raise exception '약속을 확정할 수 없는 게시물이에요' using hint = 'not_allowed'; end if;

  insert into public.appointments (room_id, post_id, start_at, end_at, place, activity, created_by)
  values (p_room_id, v_room.post_id, p_start_at, p_end_at, trim(p_place), trim(coalesce(p_activity, '')), auth.uid())
  returning id into v_appointment_id;
  insert into public.appointment_members (appointment_id, user_id)
  select v_appointment_id, m.user_id from public.chat_members m where m.room_id = p_room_id;

  update public.join_requests set status = 'rejected', decided_at = now() where room_id = p_room_id and status = 'pending';
  insert into public.messages (room_id, sender_id, type, body) values (p_room_id, null, 'system', '약속이 확정되었어요');
  insert into public.notifications (user_id, type, ref_id)
  select m.user_id, 'appointment_confirmed', v_appointment_id from public.chat_members m
  where m.room_id = p_room_id and m.user_id <> auth.uid();

  return public.appointment_item(v_appointment_id);
end;
$$;

-- S11: 내 채팅방 목록. 1:1 방도 함께 (kind, partner). 1:1 방은 카테고리가 없어 '전체'(p_category = null)에서만 나온다
drop function public.get_my_rooms(text);
create function public.get_my_rooms(p_category text default null)
returns table (
  id uuid, kind text, post_id uuid, category text, title text, partner jsonb, members jsonb, member_count int,
  last_message jsonb, unread_count int, is_host boolean, pending_request_count int
)
language sql stable security definer set search_path = '' as $$
  select
    r.id, r.kind, p.id, p.category,
    case when r.kind = 'direct' then coalesce(pu.nickname, '알 수 없는 사용자') else p.title end, -- 상대가 탈퇴하면 pu가 없다
    case when pu.id is not null then jsonb_build_object('id', pu.id, 'nickname', pu.nickname, 'photo_url', pu.photo_url) end,
    (
      select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nickname', u.nickname, 'photo_url', u.photo_url) order by m.joined_at), '[]'::jsonb)
      from public.chat_members m join public.users u on u.id = m.user_id
      where m.room_id = r.id
    ),
    (select count(*)::int from public.chat_members m where m.room_id = r.id),
    lm.msg,
    (
      select count(*)::int from public.messages x
      where x.room_id = r.id and x.sender_id is distinct from auth.uid()
        and x.created_at > coalesce((select y.created_at from public.messages y where y.id = me.last_read_message_id), '-infinity')
    ),
    r.kind = 'post' and r.host_id = auth.uid(),
    case when r.kind = 'post' and r.host_id = auth.uid()
      then (select count(*)::int from public.join_requests j where j.room_id = r.id and j.status = 'pending')
      else 0 end
  from public.chat_members me
  join public.chat_rooms r on r.id = me.room_id
  left join public.posts p on p.id = r.post_id
  left join lateral (
    select u.id, u.nickname, u.photo_url
    from public.users u
    where r.kind = 'direct' and u.id = public.direct_partner_id(r.direct_key)
  ) pu on true
  left join lateral (
    select
      jsonb_build_object(
        'sender_nickname', su.nickname,
        'body', case when x.type = 'game_result' then '게임 결과를 공유했어요' else x.body end,
        'created_at', x.created_at
      ) as msg,
      x.created_at
    from public.messages x left join public.users su on su.id = x.sender_id
    where x.room_id = r.id
    order by x.created_at desc
    limit 1
  ) lm on true
  where me.user_id = auth.uid()
    and (
      (r.kind = 'post' and p.status not in ('deleted', 'closed') and (p_category is null or p.category = p_category))
      or (r.kind = 'direct' and p_category is null and not public.is_blocked_with(pu.id))
    )
  order by lm.created_at desc nulls last;
$$;

-- S12: 채팅방 상단 정보. 1:1 방은 post = null, partner = 상대, is_host = false
create or replace function public.get_room(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_room_member(p_room_id) then raise exception '이 채팅방 참여자가 아니에요' using hint = 'not_allowed'; end if;
  return (
    select jsonb_build_object(
      'id', r.id,
      'kind', r.kind,
      'post', case when p.id is null then null else jsonb_build_object(
        'id', p.id, 'title', p.title, 'category', p.category, 'content', p.content,
        'range', jsonb_build_object('weekday', p.weekday, 'start', to_char(p.start_time, 'HH24:MI'), 'end', to_char(p.end_time, 'HH24:MI')),
        'start_at', p.start_at, 'end_at', p.end_at
      ) end,
      'partner', (
        select jsonb_build_object('id', u.id, 'nickname', u.nickname, 'photo_url', u.photo_url)
        from public.users u
        where r.kind = 'direct' and u.id = public.direct_partner_id(r.direct_key)
      ),
      'host', (select jsonb_build_object('id', u.id, 'nickname', u.nickname, 'photo_url', u.photo_url) from public.users u where u.id = r.host_id),
      'members', (
        select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nickname', u.nickname, 'photo_url', u.photo_url) order by m.joined_at), '[]'::jsonb)
        from public.chat_members m join public.users u on u.id = m.user_id
        where m.room_id = r.id
      ),
      'is_host', r.kind = 'post' and r.host_id = auth.uid(),
      'appointment_id', (select a.id from public.appointments a where a.room_id = r.id and a.status <> 'canceled' limit 1)
    )
    from public.chat_rooms r left join public.posts p on p.id = r.post_id
    where r.id = p_room_id
  );
end;
$$;

-- S12 메뉴 '나가기': 1:1 방은 누구나 나갈 수 있다 (다시 '1:1 채팅'을 누르면 다시 들어온다). 나머지는 *_appointments.sql과 같다
create or replace function public.leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text;
  v_appointment_id uuid;
  v_nickname text;
begin
  select kind into v_kind from public.chat_rooms where id = p_room_id;
  if v_kind = 'post' and exists (select 1 from public.chat_rooms where id = p_room_id and host_id = auth.uid()) then
    raise exception '방장은 나갈 수 없어요. 게시물을 삭제해 주세요' using hint = 'not_allowed';
  end if;
  select a.id into v_appointment_id
  from public.appointments a join public.appointment_members m on m.appointment_id = a.id
  where a.room_id = p_room_id and a.status = 'confirmed' and a.start_at > now()
    and m.user_id = auth.uid() and m.canceled_at is null;
  if v_appointment_id is not null then
    perform public.cancel_appointment(v_appointment_id);
    return;
  end if;

  delete from public.chat_members where room_id = p_room_id and user_id = auth.uid();
  if not found then raise exception '이 채팅방 참여자가 아니에요' using hint = 'not_allowed'; end if;
  select nickname into v_nickname from public.users where id = auth.uid();
  insert into public.messages (room_id, sender_id, type, body) values (p_room_id, null, 'system', v_nickname || '님이 나갔어요');
end;
$$;

-- 1:1 방에서 차단 관계가 되면 서로 메시지를 보낼 수 없다 (게시물 방의 '닫힌 방' 규칙은 그대로)
drop policy "참여한 방에 메시지 보내기" on public.messages;
create policy "참여한 방에 메시지 보내기" on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and type = 'text' and payload is null and public.is_room_member(room_id)
  and not exists (
    select 1 from public.chat_rooms r join public.posts p on p.id = r.post_id
    where r.id = room_id and p.status = 'closed'
  )
  and not exists (
    select 1 from public.chat_rooms r
    where r.id = room_id and r.kind = 'direct' and public.is_blocked_with(public.direct_partner_id(r.direct_key))
  )
);

-- ───────────────────────── 권한 ─────────────────────────

revoke execute on function public.touch_active() from public, anon;
revoke execute on function public.is_user_active(uuid) from public, anon, authenticated;
revoke execute on function public.get_matching_posts(text) from public, anon;
revoke execute on function public.update_appointment(uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function public.direct_partner_id(text) from public, anon;
revoke execute on function public.open_direct_room(uuid) from public, anon;
revoke execute on function public.get_my_rooms(text) from public, anon;
grant execute on function public.touch_active() to authenticated;
grant execute on function public.get_matching_posts(text) to authenticated;
grant execute on function public.update_appointment(uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.direct_partner_id(text) to authenticated; -- 메시지 보내기 policy에서 쓴다
grant execute on function public.open_direct_room(uuid) to authenticated;
grant execute on function public.get_my_rooms(text) to authenticated;
