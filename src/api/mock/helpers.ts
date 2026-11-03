/** 가짜 API 공용 도우미. Supabase 연결 후 지운다. */
import type { MiniUser } from '@/api/types';
import { ApiError } from '@/api/types';
import { db } from '@/api/mock/store';
import { ACTIVE_WITHIN_MINUTES } from '@/constants/config';

export function requireMeId(): string {
  const id = db.session.userId;
  if (!id) throw new ApiError('로그인이 필요해요', 'not_logged_in');
  return id;
}

export function findUser(id: string) {
  const u = db.users.find((x) => x.id === id);
  if (!u) throw new ApiError('사용자를 찾을 수 없어요', 'not_found');
  return u;
}

export function toMini(id: string): MiniUser {
  const u = findUser(id);
  return { id: u.id, nickname: u.nickname, photo_url: u.photo_url };
}

/** 내가 차단했거나 나를 차단한 사용자 id 목록 */
export function blockedUserIdsOf(userId: string): string[] {
  return db.blocks.flatMap((b) => (b.blocker_id === userId ? [b.blocked_id] : b.blocked_id === userId ? [b.blocker_id] : []));
}

export function roomMemberIds(roomId: string): string[] {
  return db.members.filter((m) => m.room_id === roomId).map((m) => m.user_id);
}

export function findRoom(roomId: string) {
  const room = db.rooms.find((r) => r.id === roomId);
  if (!room) throw new ApiError('채팅방을 찾을 수 없어요', 'not_found');
  return room;
}

export function requireMember(roomId: string, userId: string) {
  if (!roomMemberIds(roomId).includes(userId)) throw new ApiError('이 채팅방 참여자가 아니에요', 'not_allowed');
}

/** 최근 ACTIVE_WITHIN_MINUTES(15분) 안에 활동했는지 */
export function isUserActive(userId: string): boolean {
  const at = db.activeAt[userId];
  return !!at && Date.now() - at < ACTIVE_WITHIN_MINUTES * 60_000;
}
