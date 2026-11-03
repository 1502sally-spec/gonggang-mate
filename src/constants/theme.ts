/**
 * 디자인 토큰 — 디자인팀 UI(11/3, 보라 계열) 기준. PRD 4장의 파란 토큰을 대신한다.
 * 색상·글자 크기는 여기 값만 쓰고, 화면 파일에 색상 코드를 직접 적지 않는다.
 */

export const colors = {
  primary: '#4C1D95', // 짙은 보라: 제목, 주요 버튼, 선택된 칩, 강조 카드
  primaryBright: '#7C3AED', // 밝은 보라: 공강 칸, 공강 저장 버튼, 강조 숫자
  primarySoft: '#C4B2EC', // 로고 두 번째 원, 보조 장식
  primaryTint: '#F3E8FF', // 연보라: 안내 상자, 태그, 아이콘 원, 보조 버튼 배경
  ink: '#1F1B2E', // 본문 텍스트
  sub: '#6B7280', // 보조 텍스트
  line: '#E9E3F5', // 카드 테두리, 구분선
  lineSoft: '#F1ECFA', // 옅은 구분선 (TimeGrid 30분 선)
  bg: '#F8F5FF', // 화면 배경
  white: '#FFFFFF',
  alert: '#EF4444', // 하트, 알림 배지
  success: '#22C55E', // 활동 중 점
  danger: '#DC2626', // 차단, 오류
} as const;

/** 모서리 둥글기 (디자인: 카드 18, 입력칸·버튼 14, 칩은 둥근 알약) */
export const radius = {
  card: 18,
  control: 14,
  pill: 999,
} as const;

/** 카테고리 키 (DB 값과 같음) */
export type Category = 'meal' | 'cafe' | 'study' | 'walk';

export const CATEGORIES: Category[] = ['meal', 'cafe', 'study', 'walk'];

export const categoryInfo: Record<Category, { label: string; accent: string; background: string }> = {
  meal: { label: '식사', accent: '#D9480F', background: '#FFF0E6' },
  cafe: { label: '카페', accent: '#8B5E3C', background: '#F5EDE6' },
  study: { label: '공부', accent: '#2B4ACB', background: '#E9EEFF' },
  walk: { label: '산책', accent: '#2F7A3E', background: '#E6F5EA' },
};

/** 혼자 지도 장소 분류 (11/2 결정). 핀·칩 색 */
export const PLACE_CATEGORIES = ['meal', 'cafe', 'entertainment'] as const;

export const placeCategoryInfo: Record<(typeof PLACE_CATEGORIES)[number], { label: string; accent: string; background: string }> = {
  meal: { label: '식당', accent: '#D9480F', background: '#FFF0E6' },
  cafe: { label: '카페', accent: '#8B5E3C', background: '#F5EDE6' },
  entertainment: { label: '엔터테인먼트', accent: '#7048E8', background: '#F0EBFF' },
};

/** 글자 크기 (PRD 4.2) */
export const fontSize = {
  title: 24, // 화면 제목 (굵기 900, primary 색)
  body: 15, // 본문
  caption: 12, // 보조
} as const;

/** 간격 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
} as const;

/** 터치 영역 최소 크기 (PRD 3장 공통 규칙) */
export const MIN_TOUCH = 44;
