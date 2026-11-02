import { router } from 'expo-router';

import type { Me } from '@/api';

/**
 * 로그인·가입이 끝난 뒤 갈 화면 (S01, S02, S03 공용)
 * 프로필(닉네임)을 아직 저장하지 않았으면 S04 신규 설정, 아니면 S05 메인. 뒤로가기로 돌아오지 않게 replace.
 */
export function goAfterAuth(me: Me) {
  if (!me.nickname) router.replace({ pathname: '/settings', params: { mode: 'new' } });
  else router.replace('/home');
}
