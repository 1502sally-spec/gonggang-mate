-- 11/5 실사용 테스트 피드백 반영 (docs/TASKS_C_1106.md C1~C6, docs/DECISIONS.md "2026-11-06 실사용 테스트 피드백 결정")
-- 실행: Supabase 대시보드 → SQL Editor에 이 파일 전체를 붙여넣고 Run (처음 한 번만)
-- 에러는 raise exception '화면에 보여 줄 문장' using hint = 'ApiError code' 모양으로 낸다 (api/supabaseHelpers.ts toApiError)
-- 함수를 고칠 때는 가장 최근 정의(*_design_features.sql 등)를 기준으로 create or replace 한다
--
-- C1. 프로필 사진 저장소: Storage 버킷 avatars, 내 폴더({user_id}/...)에만 올리기·바꾸기·지우기
-- C2. 약속 자동 완료: 끝난 약속을 5분마다 done으로 + 안내 메시지. 완료된 약속에도 '완료 및 후기' 버튼 유지
-- C3. 약속 날짜는 오늘부터 14일 후까지 (한국 날짜 기준, 앱 ConfirmAppointmentPopup과 같은 계산)
-- C4. 방장 넘기기: 방장이 나가거나 약속을 취소하면 가장 먼저 들어온 사람이 방장·게시글 작성자
-- C5. 회원 탈퇴 준비: 탈퇴한 사람의 메시지 표시, 남긴 후기·확정한 약속이 지워지지 않게 FK 변경, 탈퇴 전 정리 함수
-- C6. 신고 테이블, 이용약관 동의 시각

-- ───────────────────────── C1. 프로필 사진 저장소 ─────────────────────────

-- 공개 읽기 버킷(공개 URL을 users.photo_url에 저장). 2MB, jpeg/png/webp만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 경로 첫 폴더가 내 id인 파일만 (앱은 {uid}/{timestamp}.jpg로 올린다)
create policy "프로필 사진 내 폴더에 올리기" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "프로필 사진 내 폴더에서 바꾸기" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text)
) with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "프로필 사진 내 폴더에서 지우기" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text)
);
-- 파일 지우기(remove)·목록(list)은 지울 행을 읽을 수 있어야 해서 내 폴더 읽기도 연다. 사진 보기는 공개 URL이라 이 정책과 상관없다
create policy "프로필 사진 내 폴더 읽기" on storage.objects for select to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- ───────────────────────── C4·C5에 필요한 표 변경 ─────────────────────────

-- 알림 종류에 새 방장(host_changed) 추가. types/db.ts NotificationType과 같게 유지 (A가 수정)
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'new_message', 'join_request', 'join_accepted', 'new_member', 'appointment_confirmed',
  'appointment_soon', 'review_request', 'member_canceled', 'host_canceled', 'host_changed'
));

-- 탈퇴한 사람의 메시지. sender_id는 탈퇴하면 null이 되어 시스템 메시지와 구분이 안 되므로 따로 표시한다
alter table public.messages add column sender_deleted boolean not null default false;

-- 남긴 후기는 탈퇴해도 지우지 않는다 (작성자만 비운다). unique(appointment_id, reviewer_id, target_id)는 null끼리 겹치지 않고,
-- check (reviewer_id <> target_id)는 null이면 통과라서 그대로 둔다
alter table public.reviews alter column reviewer_id drop not null;
alter table public.reviews drop constraint reviews_reviewer_id_fkey;
alter table public.reviews add constraint reviews_reviewer_id_fkey
  foreign key (reviewer_id) references public.users (id) on delete set null;

-- 약속을 확정한 사람이 탈퇴해도 약속이 남는다
alter table public.appointments alter column created_by drop not null;
alter table public.appointments drop constraint appointments_created_by_fkey;
alter table public.appointments add constraint appointments_created_by_fkey
  foreign key (created_by) references public.users (id) on delete set null;

-- chat_rooms.host_id, posts.author_id는 on delete cascade 그대로 (명세 C5).
-- 탈퇴 전에 방장을 넘기므로 남은 사람이 있는 방은 지워지지 않는다.
-- 남은 사람이 없는 게시물 방과 탈퇴한 사람이 만든 1:1 방은 탈퇴할 때 그 안의 약속·후기·메시지와 함께 지워진다

-- 직접 보내는 메시지는 탈퇴 표시를 할 수 없다. 나머지는 *_design_features.sql과 같다
drop policy "참여한 방에 메시지 보내기" on public.messages;
create policy "참여한 방에 메시지 보내기" on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and type = 'text' and payload is null and not sender_deleted
  and public.is_room_member(room_id)
  and not exists (
    select 1 from public.chat_rooms r join public.posts p on p.id = r.post_id
    where r.id = room_id and p.status = 'closed'
  )
  and not exists (
    select 1 from public.chat_rooms r
    where r.id = room_id and r.kind = 'direct' and public.is_blocked_with(public.direct_partner_id(r.direct_key))
  )
);

-- ───────────────────────── C2. 약속 자동 완료 ─────────────────────────

-- 약속카드 하나: can_complete를 완료(done)된 약속에도 켠다 (완료 후에도 '완료 및 후기' 버튼 유지). 나머지는 *_design_features.sql과 같다
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
    'can_complete', a.status in ('confirmed', 'done') and a.start_at <= now(),
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

-- 끝난 약속(confirmed, end_at 지남)을 done으로 바꾸고 채팅방에 안내. 약속카드 탭 배지를 다시 켠다. pg_cron이 5분마다 부른다.
-- 바꾼 약속 수를 돌려준다. 앱에서는 부르지 않는다
-- (submit_review는 canceled만 막고 시작 이후면 허용해서 done 약속에도 후기를 쓸 수 있다. get_my_appointments는 status로 거르지 않아 done도 나온다)
create function public.complete_due_appointments() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  with due as (
    update public.appointments set status = 'done'
    where status = 'confirmed' and end_at <= now()
    returning id, room_id
  ), badge as (
    update public.appointment_members m set seen_at = null
    from due where m.appointment_id = due.id and m.canceled_at is null
  )
  insert into public.messages (room_id, sender_id, type, body)
  select due.room_id, null, 'system', '약속 시간이 끝났어요. 약속카드의 ''완료 및 후기''에서 후기를 남겨 주세요'
  from due;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 5분마다 실행. 대시보드에서 pg_cron을 이미 켰다면 아래 create extension은 그냥 넘어간다.
-- 같은 이름으로 다시 schedule하면 작업이 새로 생기지 않고 덮어쓴다
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('complete-appointments', '*/5 * * * *', 'select public.complete_due_appointments()');

-- ───────────────────────── C3. 약속 날짜 2주 제한 ─────────────────────────
-- 한국 날짜로 오늘~14일 후 (앱 ConfirmAppointmentPopup의 isTooFar와 같은 계산: 시작 날짜 ≤ 오늘 + APPOINTMENT_MAX_DAYS)

-- S14 '확정': 2주 검사를 더한다. 나머지는 *_design_features.sql과 같다
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
  if (p_start_at at time zone 'Asia/Seoul')::date > (now() at time zone 'Asia/Seoul')::date + 14 then
    raise exception '약속은 오늘부터 2주 안으로 잡을 수 있어요' using hint = 'invalid_input';
  end if;
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

-- S15 '일정 변경': 2주 검사를 더한다. 나머지는 *_design_features.sql과 같다
create or replace function public.update_appointment(
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
  if (p_start_at at time zone 'Asia/Seoul')::date > (now() at time zone 'Asia/Seoul')::date + 14 then
    raise exception '약속은 오늘부터 2주 안으로 잡을 수 있어요' using hint = 'invalid_input';
  end if;

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

-- ───────────────────────── C4. 방장 넘기기 ─────────────────────────

-- 한 사람을 채팅방에서 내보낸다. leave_room, cancel_appointment, 회원 탈퇴(prepare_account_deletion)가 같이 쓴다.
-- 앱에서 직접 부르지 않는다 (p_user_id를 받으므로)
-- 게시물 방:
--   1. 시작 전 약속에 참여 중이면 약속 참여도 취소. 약속 참여자가 0명이 되면 약속 canceled
--   2. chat_members에서 삭제
--   3. 방장이었으면 남은 사람 중 joined_at이 가장 이른 사람이 방장(chat_rooms.host_id)·게시글 작성자(posts.author_id) + host_changed 알림
--   4. 남은 사람이 없으면 게시글 closed, 시작 전 약속 canceled, 대기 중인 요청 거절 (지금의 '닫힌 방'과 같게)
--   시작한 약속(진행 중·done)은 그대로 둔다. 나가도 약속카드와 후기는 남는다
-- 1:1 방: 그냥 나간다
create function public.leave_room_internal(p_room_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.chat_rooms;
  v_nickname text;
  v_appointment_id uuid;
  v_new_host_id uuid;
  v_new_host_nickname text;
  v_left text;
begin
  -- 방을 먼저 잠근다 (확정·수락·다른 사람 나가기와 동시에 일어나도 방장이 꼬이지 않게)
  select * into v_room from public.chat_rooms where id = p_room_id for update;
  if v_room.id is null then raise exception '채팅방을 찾을 수 없어요' using hint = 'not_found'; end if;
  if not exists (select 1 from public.chat_members where room_id = p_room_id and user_id = p_user_id) then
    raise exception '이 채팅방 참여자가 아니에요' using hint = 'not_allowed';
  end if;
  select nickname into v_nickname from public.users where id = p_user_id;

  if v_room.kind = 'direct' then
    delete from public.chat_members where room_id = p_room_id and user_id = p_user_id;
    insert into public.messages (room_id, sender_id, type, body) values (p_room_id, null, 'system', v_nickname || '님이 나갔어요');
    return;
  end if;

  select a.id into v_appointment_id
  from public.appointments a join public.appointment_members m on m.appointment_id = a.id
  where a.room_id = p_room_id and a.status = 'confirmed' and a.start_at > now()
    and m.user_id = p_user_id and m.canceled_at is null
  for update of a;
  if v_appointment_id is not null then
    update public.appointment_members set canceled_at = now()
    where appointment_id = v_appointment_id and user_id = p_user_id;
    if not exists (select 1 from public.appointment_members where appointment_id = v_appointment_id and canceled_at is null) then
      update public.appointments set status = 'canceled' where id = v_appointment_id;
    end if;
  end if;

  delete from public.chat_members where room_id = p_room_id and user_id = p_user_id;
  -- 시스템 메시지 앞부분: 'OO님이 ' / 'OO님이 약속을 취소하고 ' + '나갔어요' / '나가서 ...'
  v_left := v_nickname || case when v_appointment_id is not null then '님이 약속을 취소하고 ' else '님이 ' end;

  -- 일반 참여자
  if v_room.host_id is distinct from p_user_id then
    insert into public.messages (room_id, sender_id, type, body) values (p_room_id, null, 'system', v_left || '나갔어요');
    if v_appointment_id is not null and v_room.host_id is not null then
      insert into public.notifications (user_id, type, ref_id) values (v_room.host_id, 'member_canceled', v_appointment_id);
    end if;
    return;
  end if;

  -- 방장: 가장 먼저 들어온 사람에게 넘긴다
  select m.user_id, u.nickname into v_new_host_id, v_new_host_nickname
  from public.chat_members m join public.users u on u.id = m.user_id
  where m.room_id = p_room_id
  order by m.joined_at, m.user_id
  limit 1;

  if v_new_host_id is null then
    update public.posts set status = 'closed' where id = v_room.post_id and status in ('open', 'confirmed');
    update public.appointments set status = 'canceled' where room_id = p_room_id and status = 'confirmed' and start_at > now();
    update public.join_requests set status = 'rejected', decided_at = now() where room_id = p_room_id and status = 'pending';
    insert into public.messages (room_id, sender_id, type, body) values (p_room_id, null, 'system', v_left || '나갔어요');
    return;
  end if;

  update public.chat_rooms set host_id = v_new_host_id where id = p_room_id;
  update public.posts set author_id = v_new_host_id where id = v_room.post_id;
  insert into public.messages (room_id, sender_id, type, body)
  values (p_room_id, null, 'system', v_left || '나가서 ' || v_new_host_nickname || '님이 새 방장이 됐어요');
  insert into public.notifications (user_id, type, ref_id) values (v_new_host_id, 'host_changed', p_room_id);
end;
$$;

-- S12 메뉴 '나가기': 방장도 나갈 수 있다 (방장 넘기기). 시작 전 약속이 있으면 약속 참여도 취소한다
create or replace function public.leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요' using hint = 'not_logged_in'; end if;
  perform public.leave_room_internal(p_room_id, auth.uid());
end;
$$;

-- S15 '약속 취소' (시작 전까지만): 방장·참여자 모두 약속에서 빠지고 채팅방에서 나간다.
-- 방장이면 방장을 넘기고 약속은 남은 사람끼리 유지 (leave_room_internal)
create or replace function public.cancel_appointment(p_appointment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_appointment public.appointments;
begin
  select * into v_appointment from public.appointments where id = p_appointment_id;
  if v_appointment.id is null then raise exception '약속을 찾을 수 없어요' using hint = 'not_found'; end if;
  -- leave_room_internal과 같은 순서(방 → 약속)로 잠근다
  perform 1 from public.chat_rooms where id = v_appointment.room_id for update;
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if v_appointment.status <> 'confirmed' then raise exception '이미 취소된 약속이에요' using hint = 'not_allowed'; end if;
  if v_appointment.start_at <= now() then raise exception '시작한 약속은 취소할 수 없어요' using hint = 'not_allowed'; end if;
  if not exists (
    select 1 from public.appointment_members
    where appointment_id = p_appointment_id and user_id = auth.uid() and canceled_at is null
  ) then
    raise exception '이 약속의 참여자가 아니에요' using hint = 'not_allowed';
  end if;

  perform public.leave_room_internal(v_appointment.room_id, auth.uid());
end;
$$;

-- S11: 내 채팅방 목록. last_message에 sender_deleted(탈퇴한 사용자)를 더한다. 나머지는 *_design_features.sql과 같다
create or replace function public.get_my_rooms(p_category text default null)
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
        'sender_deleted', x.sender_deleted,
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

-- ───────────────────────── C5. 회원 탈퇴 준비 ─────────────────────────

-- Edge Function delete-account가 auth 사용자를 지우기 직전에 부른다 (service_role만 실행 가능)
-- 1. 탈퇴할 사람의 메시지에 sender_deleted 표시 (앱이 '탈퇴한 사용자'로 보여 준다)
-- 2. 참여 중인 모든 방에서 C4 규칙으로 나가기 (방장이면 넘기기, 1:1 방은 그냥 나가기)
-- 3. 아직 본인이 작성자인 게시글(= 남은 사람이 없어 넘기지 못한 글)은 deleted
-- 여러 번 불러도 결과가 같다 (중간에 실패해서 다시 시도해도 된다)
create function public.prepare_account_deletion(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_room_id uuid;
begin
  update public.messages set sender_deleted = true where sender_id = p_user_id and not sender_deleted;

  for v_room_id in select m.room_id from public.chat_members m where m.user_id = p_user_id loop
    perform public.leave_room_internal(v_room_id, p_user_id);
  end loop;

  update public.join_requests j set status = 'rejected', decided_at = now()
  from public.chat_rooms r join public.posts p on p.id = r.post_id
  where j.room_id = r.id and j.status = 'pending' and p.author_id = p_user_id;
  update public.posts set status = 'deleted' where author_id = p_user_id and status <> 'deleted';
end;
$$;

-- ───────────────────────── C6. 신고, 이용약관 동의 ─────────────────────────

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references public.users (id) on delete set null,
  target_user_id uuid references public.users (id) on delete set null,
  target_type text not null check (target_type in ('message', 'post', 'user')),
  target_id uuid, -- message.id / post.id, user 신고면 null
  reason text not null check (reason in ('abuse', 'sexual', 'spam', 'fake', 'etc')),
  detail text check (char_length(detail) <= 500),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at);
-- 동시에 두 번 눌러도 한 건만 (아래 트리거가 먼저 '이미 신고했어요'로 막고, 이건 동시 실행 대비).
-- 탈퇴로 reporter_id·target_user_id가 null이 된 행은 빼야 서로 겹쳐서 탈퇴가 막히는 일이 없다
create unique index reports_one_per_target_idx on public.reports (
  reporter_id, target_type, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid), target_user_id
) where reporter_id is not null and target_user_id is not null;

-- 신고 넣기 전 검사: 대상 모양, 같은 대상 중복 신고
create function public.check_report() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.target_type = 'user' and (new.target_user_id is null or new.target_id is not null))
    or (new.target_type in ('message', 'post') and new.target_id is null) then
    raise exception '신고할 대상을 찾을 수 없어요' using hint = 'invalid_input';
  end if;
  if exists (
    select 1 from public.reports r
    where r.reporter_id = new.reporter_id and r.target_type = new.target_type
      and r.target_id is not distinct from new.target_id and r.target_user_id is not distinct from new.target_user_id
  ) then
    raise exception '이미 신고했어요' using hint = 'already_exists';
  end if;
  return new;
end;
$$;
create trigger check_report before insert on public.reports
  for each row execute function public.check_report();

-- 앱은 insert into reports (target_user_id, target_type, target_id, reason, detail)만 한다. 읽기·고치기는 운영팀이 대시보드에서
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant insert (target_user_id, target_type, target_id, reason, detail) on public.reports to authenticated;
create policy "내 이름으로 신고하기" on public.reports for insert to authenticated with check (reporter_id = (select auth.uid()));

-- 이용약관 동의 시각 (가입 때 앱이 now() 저장). 다른 사용자는 읽지 못한다
alter table public.users add column terms_agreed_at timestamptz;
grant insert (terms_agreed_at) on public.users to authenticated;
grant update (terms_agreed_at) on public.users to authenticated;

-- ───────────────────────── 권한 ─────────────────────────

revoke execute on function public.complete_due_appointments() from public, anon, authenticated;
revoke execute on function public.leave_room_internal(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
revoke execute on function public.check_report() from public, anon, authenticated;
revoke execute on function public.leave_room(uuid) from public, anon;
revoke execute on function public.cancel_appointment(uuid) from public, anon;
revoke execute on function public.confirm_appointment(uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function public.update_appointment(uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function public.get_my_rooms(text) from public, anon;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.leave_room(uuid) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
grant execute on function public.confirm_appointment(uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.update_appointment(uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.get_my_rooms(text) to authenticated;
