/**
 * 데이터 모델 타입 (PRD 9장)
 * DB 테이블 구조가 바뀌면 이 파일도 같이 고친다.
 * 시간 규칙: DB는 UTC로 저장하고, 화면 계산은 Asia/Seoul 기준.
 */
import type { Category } from '@/constants/theme';

export type { Category };

/** 0=월 … 6=일 */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 'HH:mm' 형식 시각 문자열 (예: '12:30') */
export type TimeString = string;

/** ISO 날짜시간 문자열 (예: '2026-11-02T03:00:00Z') */
export type Timestamp = string;

/** 요일 + 시간 구간 (공강 구간, 게시물 약속시간). TimeGrid 입출력 값 */
export type TimeRange = {
  weekday: Weekday;
  start: TimeString; // 'HH:mm'
  end: TimeString; // 'HH:mm'
};

export interface User {
  id: string;
  school_id: string;
  email: string; // 로그인 아이디. 다른 사용자에게 노출 금지
  nickname: string;
  gender: 'male' | 'female';
  bio: string | null; // 최대 40자
  photo_url: string | null;
  heart_count: number;
  created_at: Timestamp;
}

/** 주간 반복 공강. 30분 칸 하나당 한 행 */
export interface FreeSlot {
  id: string;
  user_id: string;
  weekday: Weekday;
  slot_start: TimeString;
}

export type PostStatus = 'open' | 'confirmed' | 'closed' | 'deleted';

export interface Post {
  id: string;
  author_id: string;
  category: Category;
  title: string; // 최대 30자
  content: string; // 최대 500자
  weekday: Weekday; // 격자에서 고른 요일
  start_time: TimeString; // 격자에서 고른 시작
  end_time: TimeString; // 격자에서 고른 끝
  start_at: Timestamp; // 계산된 실제 약속 시작
  end_at: Timestamp; // 계산된 실제 약속 끝
  status: PostStatus;
  created_at: Timestamp;
}

export interface PostPhoto {
  id: string;
  post_id: string;
  url: string;
  sort_order: number;
}

/** 채팅방 종류: post = 게시물 그룹 방, direct = 1:1 방 (11/3 결정. 1:1 방은 대화와 게임만, 약속 확정 없음) */
export type RoomKind = 'post' | 'direct';

export interface ChatRoom {
  id: string;
  kind: RoomKind;
  post_id: string | null; // 1:1 방은 null
  host_id: string; // 게시물 방의 방장 (1:1 방은 처음 연 사람, 방장 권한 없음)
  direct_key: string | null; // 1:1 방: 두 사람 id를 정렬해 이은 값 (같은 두 사람의 방은 하나)
  created_at: Timestamp;
}

/** 채팅방 입장 요청. 방장이 수락해야 입장된다 (10/31 회의) */
export interface JoinRequest {
  id: string;
  room_id: string;
  requester_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  created_at: Timestamp;
  decided_at: Timestamp | null;
}

export interface ChatMember {
  room_id: string;
  user_id: string;
  joined_at: Timestamp;
  last_read_message_id: string | null;
}

export type MessageType = 'text' | 'system' | 'game_result';

export interface Message {
  id: string;
  room_id: string;
  sender_id: string | null; // null이면 시스템 메시지
  type: MessageType;
  body: string;
  payload: GameResultPayload | null;
  created_at: Timestamp;
}

export type AppointmentStatus = 'confirmed' | 'canceled' | 'done';

/** 약속카드 */
export interface Appointment {
  id: string;
  room_id: string;
  post_id: string;
  start_at: Timestamp;
  end_at: Timestamp;
  place: string;
  activity: string;
  status: AppointmentStatus;
  created_by: string;
  created_at: Timestamp;
}

export interface AppointmentMember {
  appointment_id: string;
  user_id: string;
  notified_at: Timestamp | null;
  seen_at: Timestamp | null;
  canceled_at: Timestamp | null; // 이 사용자가 약속을 취소한 시각
}

/** 후기 5문항 (11/3 결정: 디자인 문항, 이 순서로 표시) */
export const REVIEW_ITEMS = [
  { key: 'communication', label: '연락이 잘 되고 소통이 편해요' },
  { key: 'on_time', label: '시간 약속을 잘 지켜요' },
  { key: 'kind_manner', label: '친절하고 배려가 넘쳐요' },
  { key: 'ice_breaker', label: '처음 만나도 어색하지 않게 이끌어줘요' },
  { key: 'meet_again', label: '다음에도 공강이 겹치면 또 만나고 싶어요' },
] as const;

export type ReviewItemKey = (typeof REVIEW_ITEMS)[number]['key'];

export type Review = {
  id: string;
  appointment_id: string;
  reviewer_id: string;
  target_id: string;
  created_at: Timestamp;
} & Record<ReviewItemKey, boolean>;

export interface Block {
  blocker_id: string;
  blocked_id: string;
  created_at: Timestamp;
}

/** 게임 5종 (PRD S16) */
export type GameType = 'ladder' | 'draw' | 'order' | 'wheel' | 'teams';

export interface GameRun {
  id: string;
  room_id: string;
  run_by: string;
  type: GameType;
  participants: string[]; // user_id 목록
  options: Record<string, unknown>;
  result: Record<string, unknown>;
  shared: boolean;
  created_at: Timestamp;
}

export interface GameResultPayload {
  game_run_id: string;
  type: GameType;
  options: Record<string, unknown>;
  result: Record<string, unknown>;
}

/** 혼자 지도 장소 분류 (11/2 결정: 식당·카페·엔터테인먼트). 게시판 카테고리(식사·카페·공부·산책)와 별개 */
export type PlaceCategory = 'meal' | 'cafe' | 'entertainment';

/** 혼자 지도 장소 (PRD S09) */
export interface Place {
  id: string;
  category: PlaceCategory;
  name: string;
  address: string;
  lat: number;
  lng: number;
  naver_map_url: string;
  is_active: boolean;
}

export type NotificationType =
  | 'new_message'
  | 'join_request' // 방장에게: 입장 요청이 왔어요
  | 'join_accepted' // 요청한 사람에게: 입장이 수락됐어요
  | 'new_member'
  | 'appointment_confirmed'
  | 'appointment_soon'
  | 'review_request'
  | 'member_canceled'
  | 'host_canceled';

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType;
  ref_id: string;
  is_read: boolean;
  created_at: Timestamp;
}
