/**
 * 차단 (S17 후기작성 하단, S13 메이트 정보) — PRD 8.2. 신고 기능은 10/31 회의에서 삭제
 * A가 B를 차단하면: 서로의 게시물이 안 보이고, 서로의 채팅방에 못 들어가고,
 * 이미 같이 있는 채팅방에서는 서로의 메시지가 가려진다. B에게는 알리지 않는다.
 * 차단 관계는 서버에서 항상 걸러낸다 (get_matching_posts, request_join, reject_requests_on_block 트리거)
 */
import * as mock from '@/api/mock/blocks';
import { requireAuthUser, sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import { ApiError, type MiniUser } from '@/api/types';

export async function blockUser(userId: string): Promise<void> {
  if (USE_MOCK_API) return mock.blockUser(userId);
  const user = await requireAuthUser();
  if (userId === user.id) throw new ApiError('자기 자신은 차단할 수 없어요', 'invalid_input');
  const { error } = await sb().from('blocks').insert({ blocked_id: userId });
  if (error && error.code !== '23505') throw toApiError(error, '차단하지 못했어요'); // 23505 = 이미 차단함
}

export async function unblockUser(userId: string): Promise<void> {
  if (USE_MOCK_API) return mock.unblockUser(userId);
  const user = await requireAuthUser();
  const { error } = await sb().from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', userId);
  if (error) throw toApiError(error, '차단을 해제하지 못했어요');
}

/** S04 설정: 내가 차단한 사용자 목록 (해제용) */
export async function getBlockedUsers(): Promise<MiniUser[]> {
  if (USE_MOCK_API) return mock.getBlockedUsers();
  const user = await requireAuthUser();
  const { data, error } = await sb()
    .from('blocks')
    .select('user:users!blocked_id(id, nickname, photo_url)')
    .eq('blocker_id', user.id)
    .order('created_at');
  if (error) throw toApiError(error, '차단 목록을 불러오지 못했어요');
  return (data as unknown as { user: MiniUser }[]).map((row) => row.user);
}
