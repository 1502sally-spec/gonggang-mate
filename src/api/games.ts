/**
 * 게임 (S16) — 결과는 서버가 정한다. 채팅방 모든 참여자가 같은 결과를 본다.
 * 흐름: runGame(결과 받기, '다시 하기'면 또 호출) → shareGame(채팅방에 game_result 메시지로 공유)
 * 결과 계산과 공유는 서버 함수(RPC): supabase/migrations/*_games.sql
 */
import * as mock from '@/api/mock/games';
import { sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import type { GameRunResult, RunGameInput } from '@/api/types';
import type { GameType } from '@/types/db';

export const GAME_LABELS: Record<GameType, string> = {
  ladder: '사다리 타기',
  draw: '당첨자 추첨',
  order: '순서 정하기',
  wheel: '돌림판',
  teams: '팀 나누기',
};

/** S16 '시작': 서버가 결과를 정해서 돌려준다 */
export async function runGame(roomId: string, input: RunGameInput): Promise<GameRunResult> {
  if (USE_MOCK_API) return mock.runGame(roomId, input);
  const { data, error } = await sb().rpc('run_game', {
    p_room_id: roomId,
    p_type: input.type,
    p_participant_ids: input.participant_ids,
    p_options: input.options,
  });
  if (error) throw toApiError(error, '게임을 시작하지 못했어요');
  return data as GameRunResult;
}

/** S16 '결과 채팅방에 공유하기' → game_result 메시지 */
export async function shareGame(gameRunId: string): Promise<void> {
  if (USE_MOCK_API) return mock.shareGame(gameRunId);
  const { error } = await sb().rpc('share_game', { p_game_run_id: gameRunId });
  if (error) throw toApiError(error, '결과를 공유하지 못했어요');
}
