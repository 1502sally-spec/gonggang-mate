/**
 * 화면 ↔ 서버 사이에서 주고받는 데이터 모양
 * DB 테이블(types/db.ts)을 화면에서 쓰기 좋게 합쳐 놓은 것. 이 모양을 바꾸면 화면 담당자에게 알린다.
 */
import type {
  AppointmentStatus,
  Category,
  GameRun,
  GameType,
  Message,
  ReviewItemKey,
  RoomKind,
  TimeRange,
  Timestamp,
  User,
  Weekday,
} from '@/types/db';

/** 서버 요청이 실패했을 때 던지는 에러. message는 화면에 그대로 보여 줄 수 있는 한국어 문장 */
export class ApiError extends Error {
  constructor(
    message: string,
    public code:
      | 'not_logged_in'
      | 'invalid_input'
      | 'not_allowed'
      | 'not_found'
      | 'room_full'
      | 'already_exists'
      | 'network' = 'invalid_input',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 목록·말풍선에 쓰는 짧은 사용자 정보 (이메일 등은 절대 포함하지 않음) */
export type MiniUser = Pick<User, 'id' | 'nickname' | 'photo_url'>;

/** 내 정보 (S04 설정, S05 메인) */
export type Me = User;

export type ProfileInput = {
  nickname: string;
  gender: 'male' | 'female';
  bio: string | null;
  photo_url: string | null;
};

/** S13 메이트 정보 */
export type MateInfo = Pick<User, 'id' | 'nickname' | 'gender' | 'bio' | 'photo_url' | 'heart_count'> & {
  is_active: boolean; // 최근 15분 안에 앱을 썼는지 (마지막 접속 시각은 공개하지 않음)
  meet_count: number; // 만남 횟수 (완료된 약속 수)
  review_counts: Record<ReviewItemKey, number>; // 항목별 받은 횟수. 누가 남겼는지는 공개하지 않음
};

/** 채팅 요청 상태. none = 아직 안 보냄 */
export type MyRequestStatus = 'none' | 'pending' | 'accepted' | 'rejected';

/** S07 매칭 목록의 바 하나 */
export type PostListItem = {
  id: string;
  room_id: string;
  category: Category;
  title: string;
  content_preview: string; // 내용 앞부분
  range: TimeRange; // 요일·시간 (예: 월 12:00-13:00)
  start_at: Timestamp;
  end_at: Timestamp;
  thumbnail_url: string | null;
  author: MiniUser;
  author_is_active: boolean; // 작성자가 지금 활동 중인지 (최근 15분)
  member_count: number; // 현재 채팅방 인원 (방장 포함)
  max_members: number;
  is_mine: boolean; // 내 글이면 말풍선 대신 '내 채팅방' 버튼
  my_request: MyRequestStatus;
  created_at: Timestamp;
};

/** S08 게시물 작성 */
export type CreatePostInput = {
  category: Category;
  title: string;
  content: string;
  range: TimeRange; // TimeGrid single-range 결과 1개
  photo_uris?: string[]; // P2: 사진 첨부
};

/** S11 채팅 목록의 칸 하나. kind = 'direct'(1:1 방)이면 post_id·category가 null이고 partner가 상대 */
export type RoomListItem = {
  id: string;
  kind: RoomKind;
  post_id: string | null;
  category: Category | null; // 1:1 방은 카테고리가 없어 '전체'에서만 나온다
  title: string; // 게시물 제목 (1:1 방은 상대 닉네임)
  partner: MiniUser | null; // 1:1 방의 상대
  members: MiniUser[]; // 겹친 아바타용
  member_count: number;
  last_message: { sender_nickname: string | null; body: string; created_at: Timestamp } | null;
  unread_count: number;
  is_host: boolean;
  pending_request_count: number; // 방장에게만 의미 있음
};

/** S12 채팅방 상단 정보. 1:1 방(kind = 'direct')은 post = null, partner = 상대, is_host = false, 약속 확정 없음 */
export type RoomDetail = {
  id: string;
  kind: RoomKind;
  post: { id: string; title: string; category: Category; content: string; range: TimeRange; start_at: Timestamp; end_at: Timestamp } | null;
  partner: MiniUser | null;
  host: MiniUser;
  members: MiniUser[];
  max_members: number;
  is_host: boolean;
  appointment_id: string | null; // 약속 확정되면 값이 생김 → '약속카드 보기' 버튼
};

/** S12 방장에게 보이는 채팅 요청 */
export type JoinRequestItem = {
  id: string;
  user: MiniUser;
  created_at: Timestamp;
};

/** S12 말풍선 하나 */
export type MessageItem = Message & {
  sender: MiniUser | null; // null = 시스템 메시지
  is_mine: boolean;
};

/** S14 약속 확정 입력 */
export type ConfirmAppointmentInput = {
  start_at: Timestamp;
  end_at: Timestamp;
  place: string; // 비어 있으면 확정 불가
  activity: string;
};

/** S15 약속카드 하나 */
export type AppointmentItem = {
  id: string;
  room_id: string;
  category: Category;
  title: string;
  start_at: Timestamp;
  end_at: Timestamp;
  place: string;
  activity: string;
  status: AppointmentStatus; // 방장이 취소하면 'canceled'로 표시
  members: MiniUser[]; // 취소한 사람은 빠짐
  is_host: boolean;
  can_cancel: boolean; // 시작 전에만 true
  can_reschedule: boolean; // '일정 변경': 방장이고 시작 전 (11/3 결정)
  can_complete: boolean; // '완료 및 후기': 약속 시작 이후 (11/3 결정)
  review_done: boolean; // 모든 메이트에게 후기를 남겼는지
};

export type MyAppointments = {
  upcoming: AppointmentItem[];
  past: AppointmentItem[];
};

/** S17 후기 체크 결과 (5문항) */
export type ReviewAnswers = Record<ReviewItemKey, boolean>;

/** S17 후기 대상 목록 */
export type ReviewTarget = MiniUser & { reviewed: boolean };

/** S16 게임 실행 입력 */
export type RunGameInput = {
  type: GameType;
  participant_ids: string[]; // 최소 2명
  options: Record<string, unknown>; // 사다리: { items: string[] }, 추첨: { winners: number }, 돌림판: { items: string[] }, 팀: { teams: number }
};

export type GameRunResult = GameRun;

/** 혼자 지도 장소 (S09, S10) — types/db.ts의 Place 그대로 */
export type { Place } from '@/types/db';

export type { Weekday };
