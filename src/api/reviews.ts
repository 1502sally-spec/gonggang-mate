/**
 * 후기·메이트 하트 (S17 후기작성) — PRD 7.4
 * 5문항 중 HEART_THRESHOLD(3)개 이상 체크하면 받은 사람의 하트 +1. 하트는 서버 함수에서만 올린다 (11/3 결정)
 * 약속이 시작된 뒤부터 쓸 수 있다 (약속카드 '완료 및 후기' 버튼)
 * 한 약속에서 한 메이트에게 1회, 수정 불가: supabase/migrations/*_reviews_mate_info.sql
 */
import * as mock from '@/api/mock/reviews';
import { sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import type { ReviewAnswers, ReviewTarget } from '@/api/types';

/** S17 상단: 후기를 남길 메이트 목록 (나와 약속을 취소한 사람 제외) */
export async function getReviewTargets(appointmentId: string): Promise<ReviewTarget[]> {
  if (USE_MOCK_API) return mock.getReviewTargets(appointmentId);
  const { data, error } = await sb().rpc('get_review_targets', { p_appointment_id: appointmentId });
  if (error) throw toApiError(error, '메이트 목록을 불러오지 못했어요');
  return data as ReviewTarget[];
}

/** S17 '후기 남기기'. 체크 0개로도 저장 가능 (하트 미적립). 하트가 적립됐는지 돌려준다 */
export async function submitReview(appointmentId: string, targetId: string, answers: ReviewAnswers): Promise<{ heart_added: boolean }> {
  if (USE_MOCK_API) return mock.submitReview(appointmentId, targetId, answers);
  const { data, error } = await sb().rpc('submit_review', { p_appointment_id: appointmentId, p_target_id: targetId, p_answers: answers });
  if (error) throw toApiError(error, '후기를 저장하지 못했어요');
  return { heart_added: data as boolean };
}
