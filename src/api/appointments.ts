/**
 * 약속 (S14 약속 확정, S15 약속카드) — PRD 7.3 + 10/31 회의 결정
 * 확정·취소는 여러 테이블을 같이 바꾸므로 서버 함수(RPC)로 한다: supabase/migrations/*_appointments.sql
 *
 * - 확정: 방장만. 확정 시점의 채팅방 참여자 전원이 약속 참여자. 게시물 status → 'confirmed' (매칭 목록에서 내려감)
 *         대기 중인 채팅 요청은 자동 거절
 * - 참여자 취소: 약속에서 빠지고 채팅방에서 나감. 시작 전까지만
 * - 방장 취소: 약속 전체 취소 + 채팅방 닫힘 + 참여자 전원 알림 (지금은 약속카드 탭 배지)
 * - TODO(C): 30분 전 알림은 서버 예약 작업 (푸시 방식은 담당자 결정)
 */
import * as mock from '@/api/mock/appointments';
import { requireAuthUser, sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import type { AppointmentItem, ConfirmAppointmentInput, MyAppointments } from '@/api/types';

/** S14 '확정' (방장만) */
export async function confirmAppointment(roomId: string, input: ConfirmAppointmentInput): Promise<AppointmentItem> {
  if (USE_MOCK_API) return mock.confirmAppointment(roomId, input);
  const { data, error } = await sb().rpc('confirm_appointment', {
    p_room_id: roomId,
    p_start_at: input.start_at,
    p_end_at: input.end_at,
    p_place: input.place,
    p_activity: input.activity,
  });
  if (error) throw toApiError(error, '약속을 확정하지 못했어요');
  return data as AppointmentItem;
}

/** S15: 내 약속카드 (다가오는 약속 / 지난 약속). 내가 취소한 약속은 어디에도 안 남음 */
export async function getMyAppointments(): Promise<MyAppointments> {
  if (USE_MOCK_API) return mock.getMyAppointments();
  const { data, error } = await sb().rpc('get_my_appointments');
  if (error) throw toApiError(error, '약속카드를 불러오지 못했어요');
  return data as MyAppointments;
}

/** S15 '약속 취소' (확인 팝업 후). 방장이면 약속 전체 취소 */
export async function cancelAppointment(appointmentId: string): Promise<void> {
  if (USE_MOCK_API) return mock.cancelAppointment(appointmentId);
  const { error } = await sb().rpc('cancel_appointment', { p_appointment_id: appointmentId });
  if (error) throw toApiError(error, '약속을 취소하지 못했어요');
}

/** 하단 탭 약속카드 숫자 배지: 아직 확인 안 한 약속 수 (방장이 취소한 약속 포함) */
export async function getUnseenAppointmentCount(): Promise<number> {
  if (USE_MOCK_API) return mock.getUnseenAppointmentCount();
  const user = await requireAuthUser();
  const { count, error } = await sb()
    .from('appointment_members')
    .select('appointment_id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('canceled_at', null)
    .is('seen_at', null);
  if (error) throw toApiError(error, '약속 수를 불러오지 못했어요');
  return count ?? 0;
}

/** S15 탭을 열면 배지를 없앤다 */
export async function markAppointmentsSeen(): Promise<void> {
  if (USE_MOCK_API) return mock.markAppointmentsSeen();
  const user = await requireAuthUser();
  const { error } = await sb()
    .from('appointment_members')
    .update({ seen_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('seen_at', null);
  if (error) throw toApiError(error, '약속카드를 확인 처리하지 못했어요');
}
