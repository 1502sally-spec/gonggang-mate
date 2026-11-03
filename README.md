# 공강메이트

같은 대학 학생끼리 **공강 시간이 겹치는 사람**을 찾아 식사·카페·공부·산책을 함께하도록 연결하는 모바일 앱.

- 기준 문서: **PRD** (발표 자료와 다르면 PRD를 따른다)
- 기술: React Native (Expo) + TypeScript, Expo Router
- 협업 방법: [CONTRIBUTING.md](./CONTRIBUTING.md) ← **처음이면 꼭 읽기**

## 실행하기

```bash
npm install
npx expo start
```

휴대폰의 **Expo Go** 앱으로 터미널의 QR 코드를 찍으면 앱이 열린다. (컴퓨터와 같은 와이파이)

## 폴더 구조

```
src/
  app/                       화면 (파일 하나 = 화면 하나)
    index.tsx                S01 타이틀
    login.tsx                S02 로그인
    signup.tsx               S03 회원가입
    settings.tsx             S04 설정(프로필)
    (tabs)/                  하단 네비가 있는 화면 (혼자놀기 / 홈 / 채팅, 11/3 디자인 반영)
      solo.tsx               S09 혼자
      home.tsx               S05 메인
      chats.tsx              S11 채팅 목록
    free-time.tsx            S06 공강 설정
    appointments.tsx         S15 약속카드 (홈의 약속카드 영역 → 전체 보기)
    board/[category].tsx     S07 카테고리 게시판 (식사/카페/공부/산책 공용)
    post/new.tsx             S08 게시물 작성
    chat/[roomId].tsx        S12 채팅방
    game/[roomId].tsx        S16 게임
    review/[appointmentId].tsx  S17 후기작성
  api/                       화면이 부르는 서버 함수 (지금은 가짜 데이터) → src/api/README.md
  lib/                       시간 계산, 게시물 노출 규칙 같은 순수 함수
  components/                여러 화면이 같이 쓰는 부품
    Button.tsx, Avatar.tsx
    TimeGrid.tsx             요일×시간 격자 (S06, S08 공용)
    popups/                  S10 핀포인트, S13 메이트 정보, S14 약속 확정 팝업
    ScreenPlaceholder.tsx    임시 화면 틀 (화면 완성 후 사용 안 함)
  constants/
    theme.ts                 색상·글자 크기 (PRD 4장)
    config.ts                설정값 (30분 단위, 채팅방 6명 등)
  types/
    db.ts                    데이터 모델 타입 (PRD 9장)
```

## 화면 담당

| 화면                              | 파일                                                   | 담당 |
| --------------------------------- | ------------------------------------------------------ | ---- |
| S01~S04 인증·프로필               | `index` `login` `signup` `settings`                    |      |
| S05 메인, S06 공강 설정, TimeGrid | `(tabs)/home` `free-time` `components/TimeGrid`        |      |
| S07~S08 게시판                    | `board/[category]` `post/new`                          |      |
| S09~S10 혼자 지도                 | `(tabs)/solo` `popups/PlacePopup`                      |      |
| S11~S13 채팅                      | `(tabs)/chats` `chat/[roomId]` `popups/MateInfoPopup`  |      |
| S14~S15 약속                      | `popups/ConfirmAppointmentPopup` `(tabs)/appointments` |      |
| S16 게임                          | `game/[roomId]`                                        |      |
| S17 후기·차단                    | `review/[appointmentId]`                               |      |

## 검사 명령어

```bash
npm run lint        # 코드 규칙 검사
npm run typecheck   # 타입 검사
```

PR을 올리면 GitHub가 위 두 가지를 자동으로 검사한다.
