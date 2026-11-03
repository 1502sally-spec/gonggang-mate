/**
 * 내 프로필, 메이트 정보 (S04 설정, S05 메인, S13 메이트 정보)
 *
 * users 테이블 행은 S04에서 처음 저장할 때 생긴다. 그 전에는 getMe가 nickname ''인 빈 프로필을 돌려준다.
 * 이메일은 DB 권한상 아무도 읽을 수 없어서, 내 이메일은 로그인 세션에서 가져온다.
 *
 * TODO(C): 프로필 사진은 Storage에 업로드 (지금은 http 주소만 저장)
 */
import * as mock from '@/api/mock/users';
import { requireAuthUser, sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import { ApiError, type MateInfo, type Me, type ProfileInput } from '@/api/types';
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from '@/constants/config';

const PROFILE_COLUMNS = 'id, school_id, nickname, gender, bio, photo_url, heart_count, created_at';

/** S04, S05: 내 정보 */
export async function getMe(): Promise<Me> {
  if (USE_MOCK_API) return mock.getMe();
  const user = await requireAuthUser();
  const { data, error } = await sb().from('users').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle();
  if (error) throw toApiError(error, '내 정보를 불러오지 못했어요');
  const email = user.email ?? '';
  if (!data) {
    // 아직 S04에서 프로필을 저장하지 않음
    return { id: user.id, school_id: '', email, nickname: '', gender: 'female', bio: null, photo_url: null, heart_count: 0, created_at: user.created_at };
  }
  return { ...(data as Omit<Me, 'email'>), email };
}

/** S04: 프로필 저장. 닉네임 2~10자·중복 불가, 성별 필수, 한줄소개 최대 40자 */
export async function updateMe(input: ProfileInput): Promise<Me> {
  if (USE_MOCK_API) return mock.updateMe(input);
  const user = await requireAuthUser();
  const nickname = input.nickname.trim();
  if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
    throw new ApiError(`닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해 주세요`, 'invalid_input');
  }
  if (input.bio && input.bio.length > BIO_MAX_LENGTH) throw new ApiError(`한줄소개는 ${BIO_MAX_LENGTH}자까지 쓸 수 있어요`, 'invalid_input');

  const profile = {
    nickname,
    gender: input.gender,
    bio: input.bio?.trim() || null,
    photo_url: input.photo_url?.startsWith('http') ? input.photo_url : null,
  };
  const existing = await sb().from('users').select('id').eq('id', user.id).maybeSingle();
  if (existing.error) throw toApiError(existing.error, '프로필을 저장하지 못했어요');
  // 처음 저장이면 행을 만들고(id·이메일·학교는 DB가 채움), 아니면 고친다
  const { error } = existing.data
    ? await sb().from('users').update(profile).eq('id', user.id)
    : await sb().from('users').insert(profile);
  if (error) {
    if (error.code === '23505') throw new ApiError('이미 사용 중인 닉네임이에요', 'already_exists');
    throw toApiError(error, '프로필을 저장하지 못했어요');
  }
  return getMe();
}

/** S13: 메이트 정보 (하트 수, 후기 항목별 합계, 만남 횟수). 누가 남겼는지는 서버에서 숨긴다 */
export async function getMateInfo(userId: string): Promise<MateInfo> {
  if (USE_MOCK_API) return mock.getMateInfo(userId);
  const { data, error } = await sb().rpc('get_mate_info', { p_user_id: userId });
  if (error) throw toApiError(error, '메이트 정보를 불러오지 못했어요');
  return data as MateInfo;
}

/** S03 '중복 확인': 닉네임을 쓸 수 있는지. 형식(2~10자) 검사는 화면에서 먼저 한다 */
export async function isNicknameAvailable(nickname: string): Promise<boolean> {
  if (USE_MOCK_API) return mock.isNicknameAvailable(nickname);
  const { data: session } = await sb().auth.getSession();
  let query = sb().from('users').select('id').eq('nickname', nickname.trim()).limit(1);
  if (session.session?.user.id) query = query.neq('id', session.session.user.id);
  const { data, error } = await query;
  if (error) throw toApiError(error, '닉네임을 확인하지 못했어요');
  return (data ?? []).length === 0;
}

/**
 * 현재 활동 여부 신호 (11/3 결정). 앱이 켜져 있는 동안 ACTIVE_PING_MINUTES마다 부른다 (src/app/_layout.tsx).
 * 최근 15분 안에 신호가 있으면 다른 사람에게 '활동 중'으로 보인다. 로그인 전이거나 실패해도 조용히 넘어간다
 */
export async function touchActive(): Promise<void> {
  if (USE_MOCK_API) return mock.touchActive();
  const { data } = await sb().auth.getSession();
  if (!data.session) return;
  await sb().rpc('touch_active');
}
