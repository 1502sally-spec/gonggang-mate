/**
 * 가짜 데이터 저장소 (메모리)
 * 앱을 새로고침하면 처음 상태로 돌아간다. Supabase 연결이 끝나면 이 폴더는 지운다.
 *
 * 테스트 계정: me@cau.ac.kr / password1 (처음부터 로그인된 상태)
 * 인증 코드: 123456
 */
import type {
  Appointment,
  AppointmentMember,
  Block,
  ChatMember,
  ChatRoom,
  FreeSlot,
  GameRun,
  JoinRequest,
  Message,
  Place,
  Post,
  Review,
  TimeRange,
  User,
} from '@/types/db';
import { nextOccurrence, rangesToSlots } from '@/lib/time';

export const ME_ID = 'u-me';

let counter = 1000;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 실제 서버처럼 약간 기다린다 (로딩 표시 확인용) */
export function delay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 화면이 저장소 데이터를 직접 바꾸지 못하게 복사해서 돌려준다 */
export function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const createdAt = '2026-10-25T00:00:00.000Z';

function user(id: string, nickname: string, gender: 'male' | 'female', bio: string, heart: number): User & { password: string } {
  return {
    id,
    school_id: 'cau',
    email: `${id}@cau.ac.kr`,
    password: 'password1',
    nickname,
    gender,
    bio,
    photo_url: null,
    heart_count: heart,
    created_at: createdAt,
  };
}

function freeSlots(userId: string, ranges: TimeRange[]): FreeSlot[] {
  return rangesToSlots(ranges).map((s) => ({ id: newId('fs'), user_id: userId, ...s }));
}

function post(id: string, authorId: string, category: Post['category'], title: string, content: string, range: TimeRange): Post {
  const { start_at, end_at } = nextOccurrence(range);
  return {
    id,
    author_id: authorId,
    category,
    title,
    content,
    weekday: range.weekday,
    start_time: range.start,
    end_time: range.end,
    start_at,
    end_at,
    status: 'open',
    created_at: createdAt,
  };
}

function minutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString();
}

function seed() {
  const users = [
    { ...user(ME_ID, '공강요정', 'female', '같이 밥 먹어요', 3), email: 'me@cau.ac.kr' },
    user('u-1', '초밥러버', 'male', '초밥이면 어디든', 5),
    user('u-2', '밥심', 'female', '혼밥은 이제 그만', 2),
    user('u-3', '산책러', 'male', '캠퍼스 한 바퀴 좋아해요', 0),
  ];

  const slots = [
    // 내 공강: 월 12:00-14:00, 수 10:00-12:00
    ...freeSlots(ME_ID, [
      { weekday: 0, start: '12:00', end: '14:00' },
      { weekday: 2, start: '10:00', end: '12:00' },
    ]),
    ...freeSlots('u-1', [{ weekday: 0, start: '12:00', end: '13:00' }]),
    ...freeSlots('u-2', [{ weekday: 2, start: '10:00', end: '13:00' }]),
  ];

  const posts: Post[] = [
    post('p-1', 'u-1', 'meal', '초밥 먹을 사람', '정문 앞 초밥집 가실 분! 1인 1만원 정도', { weekday: 0, start: '12:00', end: '13:00' }),
    post('p-2', 'u-2', 'cafe', '카페에서 과제해요', '조용한 카페에서 각자 과제해요', { weekday: 2, start: '11:00', end: '12:30' }),
    post('p-3', 'u-3', 'walk', '캠퍼스 산책', '소화시킬 겸 한 바퀴', { weekday: 0, start: '13:30', end: '14:30' }),
    post('p-4', 'u-3', 'study', '도서관 같이 공부', '시험 기간이라 같이 집중해요', { weekday: 1, start: '15:00', end: '16:00' }), // 내 공강과 안 겹침 → 안 보임
    post('p-5', ME_ID, 'meal', '학식 같이 먹어요', '학생식당에서 가볍게', { weekday: 2, start: '10:00', end: '11:00' }),
  ];
  // 지난 약속용 게시물
  const pastPost: Post = {
    ...post('p-old', 'u-1', 'cafe', '지난주 카페 모임', '지난 약속', { weekday: 0, start: '12:00', end: '13:00' }),
    start_at: minutesFromNow(-60 * 24 * 3),
    end_at: minutesFromNow(-60 * 24 * 3 + 60),
    status: 'confirmed',
  };
  // 다가오는 약속용 게시물 (확정됨 → 매칭 목록에는 안 보임)
  const upcomingPost: Post = {
    ...post('p-up', 'u-2', 'meal', '덮밥 먹으러 가요', '1인석 덮밥집', { weekday: 2, start: '11:00', end: '12:00' }),
    status: 'confirmed',
  };
  posts.push(pastPost, upcomingPost);

  const rooms: ChatRoom[] = posts.map((p) => ({ id: `r-${p.id.slice(2)}`, post_id: p.id, host_id: p.author_id, created_at: createdAt }));

  const members: ChatMember[] = [
    ...rooms.map((r) => ({ room_id: r.id, user_id: r.host_id, joined_at: createdAt, last_read_message_id: null })),
    { room_id: 'r-1', user_id: 'u-2', joined_at: createdAt, last_read_message_id: null },
    { room_id: 'r-5', user_id: 'u-2', joined_at: createdAt, last_read_message_id: null },
    { room_id: 'r-old', user_id: ME_ID, joined_at: createdAt, last_read_message_id: null },
    { room_id: 'r-up', user_id: ME_ID, joined_at: createdAt, last_read_message_id: null },
  ];

  const joinRequests: JoinRequest[] = [
    // 내 방(r-5)에 산책러가 채팅 요청을 보낸 상태 → 방장인 내가 수락/거절
    { id: 'jr-1', room_id: 'r-5', requester_id: 'u-3', status: 'pending', created_at: createdAt, decided_at: null },
    // 내가 카페 글(r-2)에 요청을 보낸 상태
    { id: 'jr-2', room_id: 'r-2', requester_id: ME_ID, status: 'pending', created_at: createdAt, decided_at: null },
  ];

  const messages: Message[] = [
    { id: 'm-1', room_id: 'r-5', sender_id: null, type: 'system', body: '밥심님이 채팅방에 들어왔어요', payload: null, created_at: minutesFromNow(-30) },
    { id: 'm-2', room_id: 'r-5', sender_id: 'u-2', type: 'text', body: '안녕하세요! 수요일 10시 괜찮아요', payload: null, created_at: minutesFromNow(-29) },
    { id: 'm-3', room_id: 'r-5', sender_id: ME_ID, type: 'text', body: '좋아요 학생식당 앞에서 봬요', payload: null, created_at: minutesFromNow(-28) },
    { id: 'm-4', room_id: 'r-up', sender_id: null, type: 'system', body: '약속이 확정되었어요', payload: null, created_at: minutesFromNow(-10) },
    { id: 'm-5', room_id: 'r-up', sender_id: 'u-2', type: 'text', body: '정문에서 만나요!', payload: null, created_at: minutesFromNow(-5) },
  ];

  const appointments: Appointment[] = [
    { id: 'a-up', room_id: 'r-up', post_id: 'p-up', start_at: upcomingPost.start_at, end_at: upcomingPost.end_at, place: '정문 앞 덮밥집', activity: '식사 · 덮밥 먹으러 가요', status: 'confirmed', created_by: 'u-2', created_at: createdAt },
    { id: 'a-old', room_id: 'r-old', post_id: 'p-old', start_at: pastPost.start_at, end_at: pastPost.end_at, place: '정문 근처 카페', activity: '카페 · 지난주 카페 모임', status: 'confirmed', created_by: 'u-1', created_at: createdAt },
  ];

  const appointmentMembers: AppointmentMember[] = [
    { appointment_id: 'a-up', user_id: 'u-2', notified_at: null, seen_at: null, canceled_at: null },
    { appointment_id: 'a-up', user_id: ME_ID, notified_at: null, seen_at: null, canceled_at: null },
    { appointment_id: 'a-old', user_id: 'u-1', notified_at: null, seen_at: createdAt, canceled_at: null },
    { appointment_id: 'a-old', user_id: ME_ID, notified_at: null, seen_at: createdAt, canceled_at: null },
  ];

  const places: Place[] = [
    { id: 'pl-1', category: 'meal', name: '학생식당', address: '서울 동작구 흑석로 84 (교내)', lat: 37.5052, lng: 126.9571, naver_map_url: 'https://map.naver.com', is_active: true },
    { id: 'pl-2', category: 'meal', name: '예시 덮밥집 (1인석)', address: '정문 앞', lat: 37.5065, lng: 126.958, naver_map_url: 'https://map.naver.com', is_active: true },
    { id: 'pl-4', category: 'entertainment', name: '예시 코인노래방', address: '정문 앞', lat: 37.5062, lng: 126.959, naver_map_url: 'https://map.naver.com', is_active: true },
    { id: 'pl-3', category: 'cafe', name: '예시 카페 (콘센트 많음)', address: '정문 앞', lat: 37.5068, lng: 126.9585, naver_map_url: 'https://map.naver.com', is_active: true },
  ];

  return {
    users,
    session: { userId: ME_ID as string | null },
    pendingEmailCodes: new Map<string, string>(),
    verifiedEmails: new Set<string>(),
    freeSlots: slots,
    posts,
    rooms,
    members,
    joinRequests,
    messages,
    appointments,
    appointmentMembers,
    reviews: [] as Review[],
    blocks: [] as Block[],
    places,
    gameRuns: [] as GameRun[],
  };
}

export const db = seed();

// ── 실시간 메시지 흉내 ──
type Listener = (message: Message) => void;
const listeners = new Map<string, Set<Listener>>();

export function emitMessage(message: Message) {
  listeners.get(message.room_id)?.forEach((fn) => fn(copy(message)));
}

export function addMessageListener(roomId: string, fn: Listener): () => void {
  if (!listeners.has(roomId)) listeners.set(roomId, new Set());
  listeners.get(roomId)!.add(fn);
  return () => listeners.get(roomId)?.delete(fn);
}

/** 시스템 메시지 추가 ("OO님이 들어왔어요" 등) */
export function addSystemMessage(roomId: string, body: string): Message {
  const message: Message = { id: newId('m'), room_id: roomId, sender_id: null, type: 'system', body, payload: null, created_at: nowIso() };
  db.messages.push(message);
  emitMessage(message);
  return message;
}
