/** 가짜 프로필·메이트 정보 (api/users.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import { ApiError, type MateInfo, type Me, type ProfileInput } from '@/api/types';
import { blockedUserIdsOf, findUser, isUserActive, requireMeId } from '@/api/mock/helpers';
import { copy, db, delay } from '@/api/mock/store';
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from '@/constants/config';
import { REVIEW_ITEMS, type ReviewItemKey } from '@/types/db';

/** S04, S05: 내 정보 */
export async function getMe(): Promise<Me> {
  await delay(200);
  const { password: _password, ...me } = findUser(requireMeId());
  return copy(me);
}

/** S04: 프로필 저장. 닉네임 2~10자·중복 불가, 성별 필수, 한줄소개 최대 40자 */
export async function updateMe(input: ProfileInput): Promise<Me> {
  await delay();
  const meId = requireMeId();
  const nickname = input.nickname.trim();
  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
    throw new ApiError(`닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해 주세요`, 'invalid_input');
  }
  if (db.users.some((u) => u.id !== meId && u.nickname === nickname)) throw new ApiError('이미 사용 중인 닉네임이에요', 'already_exists');
  if (input.bio && input.bio.length > BIO_MAX_LENGTH) throw new ApiError(`한줄소개는 ${BIO_MAX_LENGTH}자까지 쓸 수 있어요`, 'invalid_input');
  const user = findUser(meId);
  Object.assign(user, { nickname, gender: input.gender, bio: input.bio?.trim() || null, photo_url: input.photo_url });
  const { password: _password, ...me } = user;
  return copy(me);
}

/** S13: 메이트 정보 (하트 수, 후기 항목별 합계, 만남 횟수) */
export async function getMateInfo(userId: string): Promise<MateInfo> {
  await delay(200);
  const meId = requireMeId();
  if (blockedUserIdsOf(meId).includes(userId)) throw new ApiError('볼 수 없는 사용자예요', 'not_allowed');
  const u = findUser(userId);
  const received = db.reviews.filter((r) => r.target_id === userId);
  const review_counts = Object.fromEntries(
    REVIEW_ITEMS.map(({ key }) => [key, received.filter((r) => r[key]).length]),
  ) as Record<ReviewItemKey, number>;
  const meet_count = db.appointmentMembers.filter(
    (m) =>
      m.user_id === userId &&
      !m.canceled_at &&
      db.appointments.some((a) => a.id === m.appointment_id && a.status !== 'canceled' && new Date(a.end_at) < new Date()),
  ).length;
  return copy({
    id: u.id,
    nickname: u.nickname,
    gender: u.gender,
    bio: u.bio,
    photo_url: u.photo_url,
    heart_count: u.heart_count,
    is_active: isUserActive(u.id),
    meet_count,
    review_counts,
  });
}

/** S03: 닉네임을 쓸 수 있는지 (중복 확인 버튼) */
export async function isNicknameAvailable(nickname: string): Promise<boolean> {
  await delay(200);
  const meId = db.session.userId;
  return !db.users.some((u) => u.id !== meId && u.nickname === nickname.trim());
}

/** 활동 신호 (앱이 켜져 있는 동안 몇 분마다) */
export async function touchActive(): Promise<void> {
  const meId = db.session.userId;
  if (meId) db.activeAt[meId] = Date.now();
}
