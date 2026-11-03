/**
 * 채팅방과 채팅 요청 (S07 말풍선 버튼, S11 채팅 목록, S12 채팅방) — 10/31 회의 결정
 * 말풍선 버튼 → 방장에게 채팅 요청 → 방장이 수락하면 입장. 최대 20명(방장 포함).
 *
 * 여러 테이블을 같이 바꾸거나 권한 확인이 필요한 동작은 서버 함수(RPC)로 한다: supabase/migrations/*_chat.sql
 * 수락 시 인원 확인 + 참여 추가는 방을 잠그고 한 번에 처리해서 동시에 수락해도 20명을 넘지 않는다.
 */
import * as mock from '@/api/mock/rooms';
import { requireAuthUser, sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import type { JoinRequestItem, MiniUser, MyRequestStatus, RoomDetail, RoomListItem } from '@/api/types';
import { MAX_ROOM_MEMBERS } from '@/constants/config';
import type { Category } from '@/types/db';

/** S07 말풍선 버튼: 방장에게 채팅 요청 보내기 */
export async function requestJoin(postId: string): Promise<MyRequestStatus> {
  if (USE_MOCK_API) return mock.requestJoin(postId);
  const { data, error } = await sb().rpc('request_join', { p_post_id: postId });
  if (error) throw toApiError(error, '채팅 요청을 보내지 못했어요');
  return data as MyRequestStatus;
}

/** 보낸 채팅 요청 취소 */
export async function cancelJoinRequest(postId: string): Promise<void> {
  if (USE_MOCK_API) return mock.cancelJoinRequest(postId);
  const { error } = await sb().rpc('cancel_join_request', { p_post_id: postId });
  if (error) throw toApiError(error, '채팅 요청을 취소하지 못했어요');
}

/** S12 (방장만): 대기 중인 채팅 요청 목록 */
export async function getJoinRequests(roomId: string): Promise<JoinRequestItem[]> {
  if (USE_MOCK_API) return mock.getJoinRequests(roomId);
  const user = await requireAuthUser();
  const room = await sb().from('chat_rooms').select('host_id').eq('id', roomId).maybeSingle();
  if (room.error) throw toApiError(room.error, '채팅 요청을 불러오지 못했어요');
  if (room.data?.host_id !== user.id) return [];

  const { data, error } = await sb()
    .from('join_requests')
    .select('id, created_at, user:users!requester_id(id, nickname, photo_url)')
    .eq('room_id', roomId)
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw toApiError(error, '채팅 요청을 불러오지 못했어요');
  return data as unknown as JoinRequestItem[];
}

/** S12 (방장만): 채팅 요청 수락/거절. 수락하면 입장 + 시스템 메시지 */
export async function respondJoinRequest(requestId: string, accept: boolean): Promise<void> {
  if (USE_MOCK_API) return mock.respondJoinRequest(requestId, accept);
  const { error } = await sb().rpc('respond_join_request', { p_request_id: requestId, p_accept: accept });
  if (error) throw toApiError(error, accept ? '수락하지 못했어요' : '거절하지 못했어요');
}

/** S11: 내 채팅방 목록 (카테고리별, 최근 메시지 순). 1:1 방(kind = 'direct')은 category 없이 부를 때만 나온다 */
export async function getMyRooms(category?: Category): Promise<RoomListItem[]> {
  if (USE_MOCK_API) return mock.getMyRooms(category);
  const { data, error } = await sb().rpc('get_my_rooms', { p_category: category ?? null });
  if (error) throw toApiError(error, '채팅 목록을 불러오지 못했어요');
  return data as RoomListItem[];
}

/** S12: 채팅방 상단 정보. 1:1 방은 post = null, partner = 상대, is_host = false */
export async function getRoom(roomId: string): Promise<RoomDetail> {
  if (USE_MOCK_API) return mock.getRoom(roomId);
  const { data, error } = await sb().rpc('get_room', { p_room_id: roomId });
  if (error) throw toApiError(error, '채팅방을 불러오지 못했어요');
  return { ...(data as Omit<RoomDetail, 'max_members'> & { members: MiniUser[] }), max_members: MAX_ROOM_MEMBERS };
}

/**
 * S13 '1:1 채팅' (11/3 결정): 같은 두 사람의 1:1 방이 있으면 그 방(나갔으면 다시 참여), 없으면 새로 만든다.
 * 1:1 방은 대화와 게임만 (약속 확정 없음). 차단 사이에는 만들 수 없다. 방 id를 돌려준다 → /chat/[roomId]로 이동
 */
export async function openDirectRoom(userId: string): Promise<string> {
  if (USE_MOCK_API) return mock.openDirectRoom(userId);
  const { data, error } = await sb().rpc('open_direct_room', { p_user_id: userId });
  if (error) throw toApiError(error, '1:1 채팅방을 열지 못했어요');
  return data as string;
}

/** S12 메뉴 '나가기' (게시물 방의 방장은 못 나감 → 게시물 삭제로 대신. 1:1 방은 누구나 나갈 수 있음) */
export async function leaveRoom(roomId: string): Promise<void> {
  if (USE_MOCK_API) return mock.leaveRoom(roomId);
  const { error } = await sb().rpc('leave_room', { p_room_id: roomId });
  if (error) throw toApiError(error, '채팅방을 나가지 못했어요');
}
