/**
 * 설정값 모음
 * PRD에서 "[결정 필요]"인 항목은 기본값을 여기에 두고, 회의에서 바뀌면 이 파일만 고친다.
 */

// ── 공강/약속 시간 격자 (PRD S06, S08) ──
export const SLOT_MINUTES = 30; // 한 칸 = 30분 (확정)
export const WEEKDAY_COUNT = 5; // 공강 요일: 월~금 (11/3 결정 3번). 격자·게시물 시간 선택이 이 요일만 보여 준다
export const DAY_START = '09:00'; // [나중에 논의] 격자 시작 시각 (임시 기본값)
export const DAY_END = '21:00'; // [나중에 논의] 격자 끝 시각 (임시 기본값)

// ── 게시물 노출 (PRD 7.1 수정, 10/31 회의) ──
// 게시물 약속시간과 내 공강이 30분(1칸) 이상 겹치면 보여 준다.
export const MIN_OVERLAP_MINUTES = 30;

// ── 회원가입 (PRD S03) ──
export const ALLOWED_EMAIL_DOMAINS = ['cau.ac.kr']; // 중앙대 단일 학교 (10/31 회의). 실제 학생 메일 도메인 확인 필요
export const PASSWORD_MIN_LENGTH = 8;
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 10;
export const BIO_MAX_LENGTH = 40;

// ── 혼자 지도 (PRD S09, 11/2 결정: 기본 지도 react-native-maps) ──
// 지도 기본 위치: 중앙대 서울캠퍼스. 위치 권한을 거부해도 이 위치로 지도를 보여 준다
export const SCHOOL_CENTER = { latitude: 37.5048, longitude: 126.9575 };
export const SCHOOL_MAP_DELTA = 0.008; // 지도에 보이는 범위 (작을수록 확대)

// ── 게시물 (PRD S08) ──
export const POST_TITLE_MAX = 30;
export const POST_CONTENT_MAX = 500;
export const POST_PHOTO_MAX = 5;

// ── 채팅방 (PRD 7.2 수정, 10/31 회의) ──
// 방장 포함 최대 20명. 말풍선 버튼 = 방장에게 채팅 요청, 방장이 수락해야 입장.
// 20명이 차면 말풍선 버튼 비활성. 방장이 약속 확정하면 매칭 목록에서 내려간다.
export const MAX_ROOM_MEMBERS = 20;

// ── 약속 확정·일정 변경 (S14, 11/6 결정 2번) ──
// 날짜는 달력, 시간은 다이얼로 고른다. 날짜는 오늘부터 14일 후까지, 시간은 5분 단위로 맞춘다
export const APPOINTMENT_MAX_DAYS = 14;
export const APPOINTMENT_MINUTE_STEP = 5;

// ── 약속 알림 (PRD 7.3) ──
export const REMIND_BEFORE_MINUTES = 30;

// ── 후기·메이트 하트 (PRD 7.4) ──
export const HEART_THRESHOLD = 3; // 5문항 중 3개 이상 체크하면 하트 +1 (11/3 결정, 서버 submit_review와 같게)

// ── 현재 활동 여부 (11/3 결정) ──
export const ACTIVE_WITHIN_MINUTES = 15; // 최근 15분 안에 앱을 쓴 사람 = 활동 중 (서버 is_user_active와 같게)
export const ACTIVE_PING_MINUTES = 5; // 앱이 켜져 있는 동안 이 간격으로 활동 신호를 보낸다

// 신고 기능은 삭제하고 차단만 구현한다 (10/31 회의).
