/**
 * S01 타이틀 — 담당: A
 * PRD: 로고, 슬로건("비는 시간, 같이 채우자"), 로딩 표시.
 * - 저장된 로그인 세션이 있으면 S05, 없으면 S02. 프로필(닉네임)이 없으면 S04 신규 설정.
 * - 로딩은 최소 1초, 최대 3초. 3초 안에 확인 못 하면(네트워크 실패) 재시도 안내.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api';
import { Button } from '@/components/Button';
import { colors, fontSize, spacing } from '@/constants/theme';
import { goAfterAuth } from '@/lib/authRoute';

const MIN_MS = 1000;
const MAX_MS = 3000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function TitleScreen() {
  const [failed, setFailed] = useState(false);

  // 세션을 확인하고 다음 화면으로 이동한다. 실패하면 false (화면 상태는 호출한 쪽에서 바꾼다)
  const check = useCallback(async (): Promise<boolean> => {
    const startedAt = Date.now();
    try {
      const me = await Promise.race([
        api.auth.getSession(),
        wait(MAX_MS).then(() => {
          throw new Error('timeout');
        }),
      ]);
      await wait(Math.max(0, MIN_MS - (Date.now() - startedAt)));
      if (me) goAfterAuth(me);
      else router.replace('/login');
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    check().then((ok) => {
      if (!ok) setFailed(true);
    });
  }, [check]);

  const retry = async () => {
    setFailed(false);
    if (!(await check())) setFailed(true);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo} accessibilityRole="header">
        공강메이트
      </Text>
      <Text style={styles.slogan}>비는 시간, 같이 채우자</Text>
      <View style={styles.status}>
        {failed ? (
          <>
            <Text style={styles.error}>인터넷 연결을 확인해 주세요</Text>
            <Button label="다시 시도" onPress={retry} />
          </>
        ) : (
          <ActivityIndicator color={colors.primary} accessibilityLabel="불러오는 중" />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: spacing.lg },
  logo: { color: colors.primary, fontSize: 34, fontWeight: '900' },
  slogan: { color: colors.sub, fontSize: fontSize.body, marginTop: spacing.sm },
  status: { marginTop: spacing.lg * 2, minHeight: 100, alignItems: 'center', gap: spacing.md },
  error: { color: colors.danger, fontSize: fontSize.body },
});
