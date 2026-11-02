/**
 * S02 로그인 — 담당: A
 * PRD: 학교 이메일(=아이디) + 비밀번호. 별도 아이디 없음.
 * - 성공: 세션 저장(자동 로그인) 후 S05. 프로필이 없으면 S04 신규 설정.
 * - 실패: "이메일 또는 비밀번호를 확인해 주세요" (어느 쪽이 틀렸는지 구분하지 않음)
 * - 비밀번호 칸은 가려진다. 입력칸 아래 "아직 회원이 아니신가요? 회원가입" → S03
 */
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, type TextInputInstance, View } from 'react-native';

import { api, ApiError } from '@/api';
import { Button } from '@/components/Button';
import { FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';
import { colors, fontSize, MIN_TOUCH } from '@/constants/theme';
import { goAfterAuth } from '@/lib/authRoute';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  const onLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const me = await api.auth.logIn(email, password);
      goAfterAuth(me);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '이메일 또는 비밀번호를 확인해 주세요');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormScreen
      title="로그인"
      subtitle="학교 이메일로 로그인해 주세요"
      footer={<Button label={loading ? '로그인 중…' : '로그인'} onPress={onLogin} disabled={!canSubmit} />}
    >
      <TextField
        label="학교 이메일"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setError(null);
        }}
        placeholder="example@cau.ac.kr"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label="비밀번호"
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          setError(null);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onLogin}
        error={error}
      />
      <View style={styles.signupRow}>
        <Text style={styles.signupText}>아직 회원이 아니신가요?</Text>
        <Pressable accessibilityRole="link" onPress={() => router.push('/signup')} style={styles.signupLink} hitSlop={8}>
          <Text style={styles.signupLinkText}>회원가입</Text>
        </Pressable>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  signupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  signupText: { color: colors.sub, fontSize: fontSize.body },
  signupLink: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  signupLinkText: { color: colors.primary, fontSize: fontSize.body, fontWeight: '700' },
});
