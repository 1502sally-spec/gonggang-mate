/** 가짜 약속 (api/appointments.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import { ApiError, type AppointmentItem, type ConfirmAppointmentInput, type MyAppointments } from '@/api/types';
import { findRoom, findUser, requireMeId, requireMember, roomMemberIds, toMini } from '@/api/mock/helpers';
import { addSystemMessage, copy, db, delay, newId, nowIso } from '@/api/mock/store';
import type { Appointment } from '@/types/db';

/** S14 '확정' (방장만) */
export async function confirmAppointment(roomId: string, input: ConfirmAppointmentInput): Promise<AppointmentItem> {
  await delay();
  const meId = requireMeId();
  const room = findRoom(roomId);
  if (room.kind === 'direct') throw new ApiError('1:1 채팅방에서는 약속을 확정할 수 없어요', 'not_allowed');
  if (room.host_id !== meId) throw new ApiError('방장만 약속을 확정할 수 있어요', 'not_allowed');
  if (!input.place.trim()) throw new ApiError('장소를 입력해 주세요', 'invalid_input');
  if (db.appointments.some((a) => a.room_id === roomId && a.status !== 'canceled')) throw new ApiError('이미 확정된 약속이에요', 'already_exists');

  const post = db.posts.find((p) => p.id === room.post_id)!;
  const appointment: Appointment = {
    id: newId('a'),
    room_id: roomId,
    post_id: post.id,
    start_at: input.start_at,
    end_at: input.end_at,
    place: input.place.trim(),
    activity: input.activity.trim(),
    status: 'confirmed',
    created_by: meId,
    created_at: nowIso(),
  };
  db.appointments.push(appointment);
  roomMemberIds(roomId).forEach((userId) =>
    db.appointmentMembers.push({ appointment_id: appointment.id, user_id: userId, notified_at: null, seen_at: null, canceled_at: null }),
  );
  post.status = 'confirmed';
  db.joinRequests.forEach((j) => {
    if (j.room_id === roomId && j.status === 'pending') Object.assign(j, { status: 'rejected', decided_at: nowIso() });
  });
  addSystemMessage(roomId, '약속이 확정되었어요');
  return copy(toItem(appointment, meId));
}

/** S15 '일정 변경' (방장만, 시작 전): 시간·장소·활동을 바꾸고 채팅방에 "일정이 변경되었어요" */
export async function updateAppointment(appointmentId: string, input: ConfirmAppointmentInput): Promise<AppointmentItem> {
  await delay();
  const meId = requireMeId();
  const a = db.appointments.find((x) => x.id === appointmentId);
  if (!a) throw new ApiError('약속을 찾을 수 없어요', 'not_found');
  const room = findRoom(a.room_id);
  if (room.host_id !== meId) throw new ApiError('방장만 일정을 바꿀 수 있어요', 'not_allowed');
  if (a.status !== 'confirmed') throw new ApiError('취소된 약속이에요', 'not_allowed');
  if (new Date(a.start_at).getTime() <= Date.now()) throw new ApiError('시작한 약속은 바꿀 수 없어요', 'not_allowed');
  if (!input.place.trim()) throw new ApiError('장소를 입력해 주세요', 'invalid_input');
  if (new Date(input.end_at) <= new Date(input.start_at)) throw new ApiError('끝나는 시간은 시작 시간보다 늦어야 해요', 'invalid_input');
  if (new Date(input.start_at).getTime() <= Date.now()) throw new ApiError('이미 지난 시간으로는 바꿀 수 없어요', 'invalid_input');
  Object.assign(a, { start_at: input.start_at, end_at: input.end_at, place: input.place.trim(), activity: input.activity.trim() });
  db.appointmentMembers.forEach((m) => {
    if (m.appointment_id === a.id && !m.canceled_at && m.user_id !== meId) m.seen_at = null;
  });
  addSystemMessage(a.room_id, '일정이 변경되었어요');
  return copy(toItem(a, meId));
}

/** S15: 내 약속카드 (다가오는 약속 / 지난 약속). 내가 취소한 약속은 어디에도 안 남음 */
export async function getMyAppointments(): Promise<MyAppointments> {
  await delay();
  const meId = requireMeId();
  const mine = db.appointmentMembers.filter((m) => m.user_id === meId && !m.canceled_at).map((m) => m.appointment_id);
  const items = db.appointments.filter((a) => mine.includes(a.id)).map((a) => toItem(a, meId));
  const now = Date.now();
  return copy({
    upcoming: items.filter((a) => new Date(a.end_at).getTime() > now).sort((a, b) => a.start_at.localeCompare(b.start_at)),
    past: items.filter((a) => new Date(a.end_at).getTime() <= now).sort((a, b) => b.start_at.localeCompare(a.start_at)),
  });
}

/** S15 '약속 취소' (확인 팝업 후). 방장이면 약속 전체 취소 */
export async function cancelAppointment(appointmentId: string): Promise<void> {
  await delay();
  const meId = requireMeId();
  const a = db.appointments.find((x) => x.id === appointmentId);
  if (!a) throw new ApiError('약속을 찾을 수 없어요', 'not_found');
  requireMember(a.room_id, meId);
  if (new Date(a.start_at).getTime() <= Date.now()) throw new ApiError('시작한 약속은 취소할 수 없어요', 'not_allowed');
  const room = findRoom(a.room_id);
  const nickname = findUser(meId).nickname;
  const member = db.appointmentMembers.find((m) => m.appointment_id === a.id && m.user_id === meId);
  if (member) member.canceled_at = nowIso();

  if (room.host_id === meId) {
    a.status = 'canceled';
    addSystemMessage(room.id, '방장이 약속을 취소했어요');
    const post = db.posts.find((p) => p.id === room.post_id);
    if (post) post.status = 'closed';
    db.appointmentMembers.forEach((m) => {
      if (m.appointment_id === a.id && !m.canceled_at) m.seen_at = null;
    });
    return;
  }
  db.members = db.members.filter((m) => !(m.room_id === room.id && m.user_id === meId));
  addSystemMessage(room.id, `${nickname}님이 약속을 취소하고 나갔어요`);
}

/** 하단 탭 약속카드 숫자 배지: 아직 확인 안 한 약속 수 (방장이 취소한 약속 포함) */
export async function getUnseenAppointmentCount(): Promise<number> {
  const meId = requireMeId();
  return db.appointmentMembers.filter((m) => m.user_id === meId && !m.canceled_at && !m.seen_at).length;
}

/** S15 탭을 열면 배지를 없앤다 */
export async function markAppointmentsSeen(): Promise<void> {
  const meId = requireMeId();
  db.appointmentMembers.forEach((m) => {
    if (m.user_id === meId && !m.seen_at) m.seen_at = nowIso();
  });
}

function toItem(a: Appointment, meId: string): AppointmentItem {
  const room = findRoom(a.room_id);
  const post = db.posts.find((p) => p.id === a.post_id)!;
  const memberIds = db.appointmentMembers.filter((m) => m.appointment_id === a.id && !m.canceled_at).map((m) => m.user_id);
  const others = memberIds.filter((id) => id !== meId);
  const reviewed = db.reviews.filter((r) => r.appointment_id === a.id && r.reviewer_id === meId).map((r) => r.target_id);
  return {
    id: a.id,
    room_id: a.room_id,
    category: post.category,
    title: post.title,
    start_at: a.start_at,
    end_at: a.end_at,
    place: a.place,
    activity: a.activity,
    status: a.status,
    members: memberIds.map(toMini),
    is_host: room.host_id === meId,
    can_cancel: a.status === 'confirmed' && new Date(a.start_at).getTime() > Date.now(),
    can_reschedule: a.status === 'confirmed' && new Date(a.start_at).getTime() > Date.now() && room.host_id === meId,
    can_complete: a.status === 'confirmed' && new Date(a.start_at).getTime() <= Date.now(),
    review_done: others.every((id) => reviewed.includes(id)),
  };
}
