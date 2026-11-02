/** 가짜 게임 (api/games.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import { ApiError, type GameRunResult, type RunGameInput } from '@/api/types';
import { findUser, requireMeId, requireMember, roomMemberIds } from '@/api/mock/helpers';
import { copy, db, delay, emitMessage, newId, nowIso } from '@/api/mock/store';
import { GAME_INFO } from '@/lib/gameResult';
import type { Message } from '@/types/db';

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 게임별 결과 계산 (서버에서 할 일) */
function computeResult(input: RunGameInput): Record<string, unknown> {
  const ids = input.participant_ids;
  switch (input.type) {
    case 'ladder': {
      const items = (input.options.items as string[] | undefined) ?? [];
      if (items.length !== ids.length) throw new ApiError('참여자 수만큼 항목을 입력해 주세요', 'invalid_input');
      const shuffled = shuffle(items);
      return { pairs: ids.map((user_id, i) => ({ user_id, item: shuffled[i] })) };
    }
    case 'draw': {
      const winners = Number(input.options.winners ?? 1);
      if (winners < 1 || winners >= ids.length) throw new ApiError('당첨 인원은 참여자 수보다 적어야 해요', 'invalid_input');
      return { winner_ids: shuffle(ids).slice(0, winners) };
    }
    case 'order':
      return { order_ids: shuffle(ids) };
    case 'wheel': {
      const items = (input.options.items as string[] | undefined) ?? ids.map((id) => findUser(id).nickname);
      if (items.length < 2 || items.length > 10) throw new ApiError('항목은 2~10개여야 해요', 'invalid_input');
      return { item: items[Math.floor(Math.random() * items.length)] };
    }
    case 'teams': {
      const teams = Number(input.options.teams ?? 2);
      if (teams < 2 || teams > ids.length) throw new ApiError('팀 수는 2 이상, 참여자 수 이하여야 해요', 'invalid_input');
      const result: string[][] = Array.from({ length: teams }, () => []);
      shuffle(ids).forEach((id, i) => result[i % teams].push(id));
      return { teams: result };
    }
  }
}

/** S16 '시작': 서버가 결과를 정해서 돌려준다 */
export async function runGame(roomId: string, input: RunGameInput): Promise<GameRunResult> {
  await delay();
  const meId = requireMeId();
  requireMember(roomId, meId);
  if (input.participant_ids.length < 2) throw new ApiError('참여자는 2명 이상이어야 해요', 'invalid_input');
  const members = roomMemberIds(roomId);
  if (!input.participant_ids.every((id) => members.includes(id))) throw new ApiError('채팅방 참여자만 고를 수 있어요', 'invalid_input');
  const run = {
    id: newId('g'),
    room_id: roomId,
    run_by: meId,
    type: input.type,
    participants: input.participant_ids,
    options: input.options,
    result: computeResult(input),
    shared: false,
    created_at: nowIso(),
  };
  db.gameRuns.push(run);
  return copy(run);
}

/** S16 '결과 채팅방에 공유하기' → game_result 메시지 */
export async function shareGame(gameRunId: string): Promise<void> {
  await delay();
  const meId = requireMeId();
  const run = db.gameRuns.find((g) => g.id === gameRunId);
  if (!run) throw new ApiError('게임 결과를 찾을 수 없어요', 'not_found');
  requireMember(run.room_id, meId);
  run.shared = true;
  const message: Message = {
    id: newId('m'),
    room_id: run.room_id,
    sender_id: meId,
    type: 'game_result',
    body: `${GAME_INFO[run.type].label} 결과`,
    payload: { game_run_id: run.id, type: run.type, options: run.options, result: run.result },
    created_at: nowIso(),
  };
  db.messages.push(message);
  emitMessage(message);
}
