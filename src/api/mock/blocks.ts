/** 가짜 차단 (api/blocks.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import { ApiError, type MiniUser } from '@/api/types';
import { requireMeId, toMini } from '@/api/mock/helpers';
import { copy, db, delay, nowIso } from '@/api/mock/store';

export async function blockUser(userId: string): Promise<void> {
  await delay();
  const meId = requireMeId();
  if (userId === meId) throw new ApiError('자기 자신은 차단할 수 없어요', 'invalid_input');
  if (!db.blocks.some((b) => b.blocker_id === meId && b.blocked_id === userId)) {
    db.blocks.push({ blocker_id: meId, blocked_id: userId, created_at: nowIso() });
  }
}

export async function unblockUser(userId: string): Promise<void> {
  await delay();
  const meId = requireMeId();
  db.blocks = db.blocks.filter((b) => !(b.blocker_id === meId && b.blocked_id === userId));
}

/** S04 설정: 내가 차단한 사용자 목록 (해제용) */
export async function getBlockedUsers(): Promise<MiniUser[]> {
  await delay(200);
  const meId = requireMeId();
  return copy(db.blocks.filter((b) => b.blocker_id === meId).map((b) => toMini(b.blocked_id)));
}
