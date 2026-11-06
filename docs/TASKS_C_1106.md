# C 작업 명세 — 11/5 실사용 테스트 피드백 (DB)

결정 근거는 `docs/DECISIONS.md` "2026-11-06 실사용 테스트 피드백 결정".
A가 앱 화면을 **아래 이름·모양 그대로** 먼저 만들고 mock으로 테스트한다. 이름을 바꿔야 하면 A에게 먼저 알려 주세요.
새 마이그레이션 파일 하나로: `supabase/migrations/20261107000000_feedback_1106.sql` (Edge Function은 `supabase/functions/`).

공통 규칙(지금까지와 같음): RPC는 `security definer set search_path = ''`, 오류는 `raise exception '사용자에게 보일 한국어 문장' using hint = 'not_allowed' | 'not_found' | 'invalid_input' | 'already_exists'`, `anon`에서 실행 권한 회수.

---

## C1. 프로필 사진 저장소 (피드백 1)

- Storage 버킷 **`avatars`**: 공개 읽기(public bucket), 파일 크기 제한 **2MB**, 허용 형식 `image/jpeg`, `image/png`, `image/webp`
- 파일 경로: **`{user_id}/{아무 이름}.jpg`** (A가 `{uid}/{timestamp}.jpg`로 올림)
- `storage.objects` 정책: 버킷이 `avatars`이고 경로 첫 폴더가 `auth.uid()`인 경우에만 insert / update / delete
- `users.photo_url` 수정 권한은 이미 있음(`grant update (... photo_url)`). 추가 작업 없음
- 앱 동작(참고): 업로드 → 공개 URL을 `users.photo_url`에 저장 → 이전 파일 삭제. 사진 삭제는 `photo_url = null` + 파일 삭제

## C2. 약속 자동 완료 + 안내 메시지 (피드백 3)

- 함수 **`complete_due_appointments()`**: `status = 'confirmed' and end_at <= now()`인 약속을 `done`으로 바꾸고, 그 채팅방에 시스템 메시지
  - 문구: **`약속 시간이 끝났어요. 약속카드의 '완료 및 후기'에서 후기를 남겨 주세요`**
  - 참여자 `appointment_members.seen_at = null` (약속카드 배지)
- **pg_cron**으로 5분마다 실행 (`cron.schedule('complete-appointments', '*/5 * * * *', ...)`). Supabase 대시보드 → Database → Extensions에서 `pg_cron` 켜기
- 같이 고칠 곳
  - `appointment_item`: `can_complete`를 `a.status in ('confirmed','done') and a.start_at <= now()`로 (완료된 약속에서도 후기 버튼 유지)
  - `submit_review`: `done` 약속에도 후기 가능하게 (지금 `confirmed`만 보는지 확인)
  - 약속카드 목록/홈 약속 카드 쿼리에서 `done`이 빠지지 않는지 확인
- 참고: `appointments_one_active_idx`가 `status <> 'canceled'`라서 완료된 방에서는 새 약속을 못 잡는다. 지금 규칙(게시물 하나 = 약속 하나)대로면 그대로 두면 됨

## C3. 날짜 범위 서버 검사 (피드백 2)

- `confirm_appointment`, `update_appointment`: `p_start_at > now() + interval '14 days'`면 `'약속은 오늘부터 2주 안으로 잡을 수 있어요'` (`invalid_input`)
- 시간은 앱이 5분 단위로 맞춰 보냄. 서버 검사는 필요 없음

## C4. 방장 넘기기 (피드백 5)

지금: 방장은 방을 못 나가고(`leave_room`), 방장이 약속을 취소하면 약속 전체 취소 + 게시글 `closed` + 방 닫힘(`cancel_appointment`).
바꿀 규칙:

1. 방장이 **방을 나가거나**(`leave_room`) **약속을 취소하면**(`cancel_appointment`) → 방장도 일반 참여자처럼 처리(약속 참여 취소 + `chat_members`에서 삭제)
2. 남은 `chat_members` 중 **`joined_at`이 가장 이른 사람**이 새 방장: `chat_rooms.host_id`와 **`posts.author_id`** 둘 다 변경
3. 시스템 메시지: **`{나간 사람}님이 나가서 {새 방장}님이 새 방장이 됐어요`** (약속 취소였다면 `{나간 사람}님이 약속을 취소하고 나가서 ...`)
4. 알림: 새 방장에게 `notifications` type **`host_changed`** (type check 제약과 `src/types/db.ts` `NotificationType`에 추가 — 타입 파일은 A가 수정)
5. 약속은 **남은 참여자끼리 유지**(status 그대로). 약속 참여자가 **0명**이 되면 약속 `canceled`
6. 남은 `chat_members`가 **없으면**: 게시글 `closed`, 약속 `canceled` (지금의 "닫힌 방"과 같게)
7. 1:1 방(`kind = 'direct'`)은 지금 규칙 그대로
- 다른 함수 영향 확인: `confirm_appointment`·`update_appointment`·`get_room`·`get_my_rooms`·게시글 수정/삭제가 `host_id`/`author_id`를 다시 읽으므로 자동 반영되는지

## C5. 회원 탈퇴 (피드백 7) — Edge Function

**`supabase/functions/delete-account`** (POST, 앱이 로그인 토큰을 `Authorization: Bearer`로 보냄. 성공 시 `{ ok: true }`)

`service_role` 키는 **Edge Function 안에서만** 사용. 앱·저장소에 절대 넣지 않기.

처리 순서:
1. 토큰으로 사용자 확인 (`auth.getUser(jwt)`)
2. 참여 중인 모든 게시물 방에서 **C4 규칙으로 나가기** (방장이면 넘기기). 1:1 방은 그냥 나가기
3. 본인 게시글 중 남은 방이 없는 것은 `status = 'deleted'`
4. Storage `avatars/{uid}/` 파일 모두 삭제
5. `auth.admin.deleteUser(uid)` → `users` 행 삭제

**지금 FK 때문에 꼭 바꿔야 할 것** (`init_schema.sql`):
| 테이블.컬럼 | 지금 | 바꿀 것 | 이유 |
|---|---|---|---|
| `messages.sender_id` | `on delete set null` | 그대로 두되 **`sender_deleted boolean not null default false`** 추가, 탈퇴 직전에 본인 메시지 `sender_deleted = true` | 지금은 `sender_id = null`이 시스템 메시지 뜻이라 구분이 안 됨. 앱은 `sender_deleted`면 "탈퇴한 사용자"로 표시 |
| `reviews.reviewer_id` | `not null ... on delete cascade` | **null 허용 + `on delete set null`** | 후기·대표 후기 개수를 지우지 않기로 함 (unique·check 제약도 null에서 문제없는지 확인) |
| `chat_rooms.host_id`, `posts.author_id` | `on delete cascade` | 그대로 (2~3단계에서 먼저 넘기거나 닫으므로) | 넘기기 전에 지워지면 방 전체가 사라짐 |
| `appointments.created_by` | FK, 삭제 옵션 없음 | **null 허용 + `on delete set null`** | 확정한 사람이 탈퇴하면 삭제가 막힘 |

- `get_room`/메시지 조회 결과에 `sender_deleted` 포함 (A가 `src/api/types.ts` 반영)
- 웹 탈퇴 안내 페이지는 A가 만든다 (앱 설정 → 탈퇴, 또는 운영팀 이메일로 요청)

## C6. 신고 (피드백 8)

```sql
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid default auth.uid() references public.users (id) on delete set null,
  target_user_id uuid references public.users (id) on delete set null,
  target_type text not null check (target_type in ('message', 'post', 'user')),
  target_id uuid,            -- message.id / post.id, user 신고면 null
  reason text not null check (reason in ('abuse', 'sexual', 'spam', 'fake', 'etc')),
  detail text check (char_length(detail) <= 500),
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);
```
- RLS: authenticated는 **`reporter_id = auth.uid()`인 insert만**. select·update 없음(운영팀은 대시보드에서 확인)
- 같은 대상 중복 신고 막기: `unique (reporter_id, target_type, target_id, target_user_id)` 또는 insert 전에 확인 → `'이미 신고했어요'` (`already_exists`)
- 앱 호출: `insert into reports (target_user_id, target_type, target_id, reason, detail)` 직접 insert (RPC 불필요)
- 처리: 운영팀(C)이 대시보드에서 확인 → 심하면 Authentication → Users에서 **계정 정지(ban)**. 처리 기준은 A가 이용약관에 적음
- 이용약관 동의 기록: `users.terms_agreed_at timestamptz` 추가, `grant insert/update (terms_agreed_at)` (가입 때 앱이 `now()` 저장)

## C7. 그 밖에

- Supabase **커스텀 SMTP** 설정 (Authentication → Emails → SMTP). 기본 메일은 시간당 발송 수가 적어 가입이 몰리면 인증 코드가 안 감
- Supabase 프로젝트 **리전** 확인 → A에게 알려 주기 (개인정보처리방침 "국외 이전" 항목에 필요)

## 완료 후

- 마이그레이션 적용 + PR. 각 항목을 SQL로 직접 테스트한 결과(성공/오류 메시지) PR 본문에 적기
- 함수 이름이나 반환 모양이 위와 다르면 A에게 알려 주기
