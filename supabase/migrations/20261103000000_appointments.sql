-- 약속 확정·취소, 약속카드 (src/api/appointments.ts) — PRD 7.3, S14, S15
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (처음 한 번만)
-- 에러는 raise exception '화면에 보여 줄 문장' using hint = 'ApiError code' 모양으로 낸다 (api/supabaseHelpers.ts toApiError)

-- 약속카드 하나 (api/types.ts AppointmentItem 모양). 아래 함수들 안에서만 쓴다
create function public.appointment_item(p_appointment_id uuid) returns jsonb
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

-- S14 '확정' (방장만): 지금 방 참여자 전원에게 약속카드 발급, 매칭 목록에서 내리기, 대기 중인 요청 자동 거절
create function public.confirm_appointment(
  p_room_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_place text, p_activity text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_room public.chat_rooms;
  v_appointment_id uuid;
begin
  select * into v_room from public.chat_rooms where id = p_room_id for update; -- 확정 중에 다른 사람이 수락되어 들어오지 못하게 잠근다
  if v_room.id is null then raise exception '채팅방을 찾을 수 없어요' using hint = 'not_found'; end if;
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

-- S15: 내 약속카드. 끝나는 시각 기준으로 다가오는 약속 / 지난 약속. 내가 취소한 약속은 어디에도 안 나온다
create function public.get_my_appointments() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'upcoming', coalesce(jsonb_agg(s.item order by s.start_at) filter (where s.end_at > now()), '[]'::jsonb),
    'past', coalesce(jsonb_agg(s.item order by s.start_at desc) filter (where s.end_at <= now()), '[]'::jsonb)
  )
  from (
    select a.start_at, a.end_at, public.appointment_item(a.id) as item
    from public.appointment_members m join public.appointments a on a.id = m.appointment_id
    where m.user_id = auth.uid() and m.canceled_at is null
  ) s;
$$;

-- S15 '약속 취소' (시작 전까지만)
-- 참여자: 약속에서 빠지고 채팅방에서 나간다. 방장: 약속 전체 취소 + 채팅방 닫힘 + 남은 참여자에게 알림
create function public.cancel_appointment(p_appointment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_appointment public.appointments;
  v_room public.chat_rooms;
  v_nickname text;
begin
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if v_appointment.id is null then raise exception '약속을 찾을 수 없어요' using hint = 'not_found'; end if;
  if v_appointment.status <> 'confirmed' then raise exception '이미 취소된 약속이에요' using hint = 'not_allowed'; end if;
  if v_appointment.start_at <= now() then raise exception '시작한 약속은 취소할 수 없어요' using hint = 'not_allowed'; end if;

  update public.appointment_members set canceled_at = now()
  where appointment_id = p_appointment_id and user_id = auth.uid() and canceled_at is null;
  if not found then raise exception '이 약속의 참여자가 아니에요' using hint = 'not_allowed'; end if;

  select * into v_room from public.chat_rooms where id = v_appointment.room_id;

  if v_room.host_id = auth.uid() then
    update public.appointments set status = 'canceled' where id = p_appointment_id;
    update public.posts set status = 'closed' where id = v_appointment.post_id;
    update public.appointment_members set seen_at = null where appointment_id = p_appointment_id and canceled_at is null; -- 약속카드 탭 배지로 알린다
    insert into public.messages (room_id, sender_id, type, body) values (v_room.id, null, 'system', '방장이 약속을 취소했어요');
    insert into public.notifications (user_id, type, ref_id)
    select m.user_id, 'host_canceled', p_appointment_id from public.appointment_members m
    where m.appointment_id = p_appointment_id and m.canceled_at is null;
    return;
  end if;

  delete from public.chat_members where room_id = v_room.id and user_id = auth.uid();
  select nickname into v_nickname from public.users where id = auth.uid();
  insert into public.messages (room_id, sender_id, type, body) values (v_room.id, null, 'system', v_nickname || '님이 약속을 취소하고 나갔어요');
  insert into public.notifications (user_id, type, ref_id) values (v_room.host_id, 'member_canceled', p_appointment_id);
end;
$$;

-- S12 메뉴 '나가기' (방장은 못 나감): 시작 전 약속이 있으면 약속 취소와 같게 처리해서 약속카드에 남지 않게 한다
create or replace function public.leave_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_appointment_id uuid;
  v_nickname text;
begin
  if exists (select 1 from public.chat_rooms where id = p_room_id and host_id = auth.uid()) then
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

-- 방장이 약속을 취소해 닫힌 채팅방에는 메시지를 보낼 수 없다
drop policy "참여한 방에 메시지 보내기" on public.messages;
create policy "참여한 방에 메시지 보내기" on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and type = 'text' and payload is null and public.is_room_member(room_id)
  and not exists (
    select 1 from public.chat_rooms r join public.posts p on p.id = r.post_id
    where r.id = room_id and p.status = 'closed'
  )
);

revoke execute on function public.appointment_item(uuid) from public, anon, authenticated;
revoke execute on function public.confirm_appointment(uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function public.get_my_appointments() from public, anon;
revoke execute on function public.cancel_appointment(uuid) from public, anon;
grant execute on function public.confirm_appointment(uuid, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.get_my_appointments() to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
