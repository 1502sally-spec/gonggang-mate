/** 가짜 후기 (api/reviews.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import { ApiError, type ReviewAnswers, type ReviewTarget } from '@/api/types';
import { findUser, requireMeId, toMini } from '@/api/mock/helpers';
import { copy, db, delay, newId, nowIso } from '@/api/mock/store';
import { HEART_THRESHOLD } from '@/constants/config';
import { REVIEW_ITEMS } from '@/types/db';

/** S17 상단: 후기를 남길 메이트 목록 (나와 약속을 취소한 사람 제외) */
export async function getReviewTargets(appointmentId: string): Promise<ReviewTarget[]> {
  await delay(200);
  const meId = requireMeId();
  const others = db.appointmentMembers
    .filter((m) => m.appointment_id === appointmentId && !m.canceled_at && m.user_id !== meId)
    .map((m) => m.user_id);
  const reviewed = db.reviews.filter((r) => r.appointment_id === appointmentId && r.reviewer_id === meId).map((r) => r.target_id);
  return copy(others.map((id) => ({ ...toMini(id), reviewed: reviewed.includes(id) })));
}

/** S17 '후기 남기기'. 체크 0개로도 저장 가능 (하트 미적립). 하트가 적립됐는지 돌려준다 */
export async function submitReview(appointmentId: string, targetId: string, answers: ReviewAnswers): Promise<{ heart_added: boolean }> {
  await delay();
  const meId = requireMeId();
  if (targetId === meId) throw new ApiError('자기 자신에게는 후기를 남길 수 없어요', 'invalid_input');
  const a = db.appointments.find((x) => x.id === appointmentId);
  if (!a || a.status === 'canceled') throw new ApiError('약속을 찾을 수 없어요', 'not_found');
  if (new Date(a.start_at).getTime() > Date.now()) throw new ApiError('약속이 시작된 뒤에 후기를 남길 수 있어요', 'not_allowed');
  const active = (id: string) => db.appointmentMembers.some((m) => m.appointment_id === appointmentId && m.user_id === id && !m.canceled_at);
  if (!active(meId) || !active(targetId)) throw new ApiError('함께한 메이트에게만 후기를 남길 수 있어요', 'not_allowed');
  if (db.reviews.some((r) => r.appointment_id === appointmentId && r.reviewer_id === meId && r.target_id === targetId)) {
    throw new ApiError('이미 후기를 남겼어요', 'already_exists');
  }
  db.reviews.push({ id: newId('rv'), appointment_id: appointmentId, reviewer_id: meId, target_id: targetId, created_at: nowIso(), ...answers });
  const checked = REVIEW_ITEMS.filter(({ key }) => answers[key]).length;
  const heart_added = checked >= HEART_THRESHOLD;
  if (heart_added) findUser(targetId).heart_count += 1;
  return { heart_added };
}
