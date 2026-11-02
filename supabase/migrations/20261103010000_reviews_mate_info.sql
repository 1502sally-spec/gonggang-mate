-- 후기·메이트 하트, 메이트 정보 (src/api/reviews.ts, users.ts) — PRD 7.4, S13, S17
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (처음 한 번만)
-- 에러는 raise exception '화면에 보여 줄 문장' using hint = 'ApiError code' 모양으로 낸다 (api/supabaseHelpers.ts toApiError)

-- S17 상단: 후기를 남길 메이트 목록 (나와 약속을 취소한 사람 제외). 내가 취소한 약속이면 빈 목록
create function public.get_review_targets(p_appointment_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'nickname', u.nickname, 'photo_url', u.photo_url,
    'reviewed', exists (
      select 1 from public.reviews rv
      where rv.appointment_id = m.appointment_id and rv.reviewer_id = auth.uid() and rv.target_id = m.user_id
    )
  ) order by u.nickname), '[]'::jsonb)
  from public.appointment_members m join public.users u on u.id = m.user_id
  where m.appointment_id = p_appointment_id and m.canceled_at is null and m.user_id <> auth.uid()
    and exists (
      select 1 from public.appointment_members me
      where me.appointment_id = p_appointment_id and me.user_id = auth.uid() and me.canceled_at is null
    );
$$;

-- S17 '후기 남기기': 한 약속에서 한 메이트에게 1회, 수정 불가. 4개(HEART_THRESHOLD) 이상 체크하면 받은 사람 하트 +1
create function public.submit_review(p_appointment_id uuid, p_target_id uuid, p_answers jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_appointment public.appointments;
  v_on_time boolean := coalesce((p_answers ->> 'on_time')::boolean, false);
  v_meet_again boolean := coalesce((p_answers ->> 'meet_again')::boolean, false);
  v_kind_manner boolean := coalesce((p_answers ->> 'kind_manner')::boolean, false);
  v_profile_match boolean := coalesce((p_answers ->> 'profile_match')::boolean, false);
  v_kept_budget boolean := coalesce((p_answers ->> 'kept_budget')::boolean, false);
  v_heart_added boolean;
begin
  if p_target_id = auth.uid() then raise exception '자기 자신에게는 후기를 남길 수 없어요' using hint = 'invalid_input'; end if;
  select * into v_appointment from public.appointments where id = p_appointment_id;
  if v_appointment.id is null or v_appointment.status = 'canceled' then raise exception '약속을 찾을 수 없어요' using hint = 'not_found'; end if;
  if v_appointment.end_at > now() then raise exception '약속이 끝난 뒤에 후기를 남길 수 있어요' using hint = 'not_allowed'; end if;
  if (
    select count(*) from public.appointment_members
    where appointment_id = p_appointment_id and user_id in (auth.uid(), p_target_id) and canceled_at is null
  ) <> 2 then
    raise exception '함께한 메이트에게만 후기를 남길 수 있어요' using hint = 'not_allowed';
  end if;

  insert into public.reviews (appointment_id, reviewer_id, target_id, on_time, meet_again, kind_manner, profile_match, kept_budget)
  values (p_appointment_id, auth.uid(), p_target_id, v_on_time, v_meet_again, v_kind_manner, v_profile_match, v_kept_budget)
  on conflict (appointment_id, reviewer_id, target_id) do nothing;
  if not found then raise exception '이미 후기를 남겼어요' using hint = 'already_exists'; end if;

  v_heart_added := (v_on_time::int + v_meet_again::int + v_kind_manner::int + v_profile_match::int + v_kept_budget::int) >= 4;
  if v_heart_added then
    update public.users set heart_count = heart_count + 1 where id = p_target_id;
  end if;
  return v_heart_added;
end;
$$;

-- S13: 메이트 정보. 후기는 누가 남겼는지 숨기고 항목별 합계만. 차단 관계면 볼 수 없다
create function public.get_mate_info(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if public.is_blocked_with(p_user_id) then raise exception '볼 수 없는 사용자예요' using hint = 'not_allowed'; end if;
  select jsonb_build_object(
    'id', u.id, 'nickname', u.nickname, 'gender', u.gender, 'bio', u.bio, 'photo_url', u.photo_url, 'heart_count', u.heart_count,
    'meet_count', (
      select count(*)::int
      from public.appointment_members m join public.appointments a on a.id = m.appointment_id
      where m.user_id = u.id and m.canceled_at is null and a.status <> 'canceled' and a.end_at < now()
    ),
    'review_counts', (
      select jsonb_build_object(
        'on_time', count(*) filter (where rv.on_time),
        'meet_again', count(*) filter (where rv.meet_again),
        'kind_manner', count(*) filter (where rv.kind_manner),
        'profile_match', count(*) filter (where rv.profile_match),
        'kept_budget', count(*) filter (where rv.kept_budget)
      )
      from public.reviews rv where rv.target_id = u.id
    )
  ) into v_result
  from public.users u where u.id = p_user_id;
  if v_result is null then raise exception '사용자를 찾을 수 없어요' using hint = 'not_found'; end if;
  return v_result;
end;
$$;

revoke execute on function public.get_review_targets(uuid) from public, anon;
revoke execute on function public.submit_review(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.get_mate_info(uuid) from public, anon;
grant execute on function public.get_review_targets(uuid) to authenticated;
grant execute on function public.submit_review(uuid, uuid, jsonb) to authenticated;
grant execute on function public.get_mate_info(uuid) to authenticated;
