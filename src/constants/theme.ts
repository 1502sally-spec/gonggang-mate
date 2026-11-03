/**
 * 디자인 토큰 (PRD 4장)
 * 색상·글자 크기는 여기 값만 쓰고, 화면 파일에 색상 코드를 직접 적지 않는다.
 */

export const colors = {
  primary: '#2B4ACB', // 주요 버튼, 선택 상태, 공강 칸
  primaryTint: '#E9EEFF', // 선택 배경
  ink: '#1B1F2A', // 본문 텍스트
  sub: '#5B6170', // 보조 텍스트
  line: '#E4E7EE', // 구분선
  lineSoft: '#F0F2F6', // 옅은 구분선 (TimeGrid 30분 선)
  bg: '#F6F7FB', // 화면 배경
  white: '#FFFFFF',
  alert: '#C2410C', // 알림 배지, 하트
  success: '#2F9E44', // 활동 중 점
  danger: '#C92A2A', // 차단
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
  title: 22, // 화면 제목 (굵기 900)
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
