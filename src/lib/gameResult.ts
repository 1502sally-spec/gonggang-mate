/**
 * 게임 결과를 사람이 읽는 문장으로 바꾼다 (S16 결과 화면, S12 채팅방의 game_result 말풍선 공용)
 *
 * 결과(result) 모양 — 서버(api.games.runGame)와 약속한 형식
 * - ladder: { pairs: { user_id, item }[] }
 * - draw:   { winner_ids: string[] }
 * - order:  { order_ids: string[] }
 * - wheel:  { item: string }
 * - teams:  { teams: string[][] }  (팀마다 user_id 목록)
 */
import type { GameType } from '@/types/db';

export const GAME_INFO: Record<GameType, { label: string; emoji: string; description: string }> = {
  ladder: { label: '사다리 타기', emoji: '🪜', description: '참여자와 항목을 무작위로 짝지어요' },
  draw: { label: '당첨자 추첨', emoji: '🎉', description: '참여자 중 당첨자를 뽑아요' },
  order: { label: '순서 정하기', emoji: '🔢', description: '참여자 전원의 순서를 정해요' },
  wheel: { label: '돌림판', emoji: '🎡', description: '항목 중 하나를 골라요' },
  teams: { label: '팀 나누기', emoji: '👥', description: '참여자를 팀으로 나눠요' },
};

const TEAM_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** 결과를 줄 단위 문장으로. nameOf는 user_id → 닉네임 (모르면 '알 수 없음') */
export function describeGameResult(type: GameType, result: Record<string, unknown>, nameOf: (userId: string) => string): string[] {
  const ids = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  switch (type) {
    case 'ladder':
      return ((result.pairs as { user_id: string; item: string }[] | undefined) ?? []).map((p) => `${nameOf(p.user_id)} → ${p.item}`);
    case 'draw':
      return [`당첨자: ${ids(result.winner_ids).map(nameOf).join(', ')}`];
    case 'order':
      return ids(result.order_ids).map((id, i) => `${i + 1}. ${nameOf(id)}`);
    case 'wheel':
      return [`결과: ${String(result.item ?? '')}`];
    case 'teams':
      return ((result.teams as string[][] | undefined) ?? []).map((team, i) => `${TEAM_NAMES[i] ?? i + 1}팀: ${team.map(nameOf).join(', ')}`);
    default:
      return [];
  }
}
