/**
 * S03 회원가입 — 담당: A
 * PRD: 학교 이메일 + '인증' 버튼, 비밀번호(8자 이상), 비밀번호 확인. 학교 이메일이 그대로 로그인 아이디.
 * 흐름: isAllowedEmail(화면 검사) → sendEmailCode → 6자리 코드 입력 → verifyEmailCode → 비밀번호 → signUp → S04 신규
 * - 이메일 인증 전에는 '가입 완료' 비활성
 * - 학교 도메인이 아니면 "학교 이메일만 가입할 수 있어요"
 * - 인증 코드 재발송은 60초에 한 번 (남은 초 표시)
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, ApiError } from '@/api';
import { Button } from '@/components/Button';
import { FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';
import { PASSWORD_MIN_LENGTH } from '@/constants/config';
import { colors, fontSize } from '@/constants/theme';
import { goAfterAuth } from '@/lib/authRoute';

const RESEND_SECONDS = 60;

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | 'signup' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 재발송 대기 시간 줄이기
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSendCode = async () => {
    if (!api.auth.isAllowedEmail(email)) {
      setEmailError('학교 이메일만 가입할 수 있어요 (@cau.ac.kr)');
      return;
    }
    setBusy('send');
    setEmailError(null);
    try {
      await api.auth.sendEmailCode(email);
      setCodeSent(true);
      setCode('');
      setCodeError(null);
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setEmailError(message(e, '인증 메일을 보내지 못했어요'));
    } finally {
      setBusy(null);
    }
  };

  const onVerify = async () => {
    setBusy('verify');
    setCodeError(null);
    try {
      await api.auth.verifyEmailCode(email, code);
      setVerified(true);
    } catch (e) {
      setCodeError(message(e, '인증 코드가 맞지 않거나 시간이 지났어요'));
    } finally {
      setBusy(null);
    }
  };

  const passwordError =
    password.length > 0 && password.length < PASSWORD_MIN_LENGTH ? `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요` : null;
  const confirmError = confirm.length > 0 && confirm !== password ? '비밀번호가 일치하지 않아요' : null;
  const canSubmit = verified && password.length >= PASSWORD_MIN_LENGTH && confirm === password && busy === null;

  const onSignup = async () => {
    if (!canSubmit) return;
    setBusy('signup');
    setSubmitError(null);
    try {
      const me = await api.auth.signUp(email, password);
      goAfterAuth(me); // 프로필이 없으므로 S04 신규 설정으로 간다
    } catch (e) {
      setSubmitError(message(e, '가입하지 못했어요. 다시 시도해 주세요'));
    } finally {
      setBusy(null);
    }
  };

  const sendLabel = busy === 'send' ? '보내는 중' : cooldown > 0 ? `${cooldown}초` : codeSent ? '재발송' : '인증';

  return (
    <FormScreen
      title="회원가입"
      subtitle="중앙대 학교 이메일로 인증한 학생만 가입할 수 있어요"
      onBack={() => router.back()}
      footer={
        <>
          {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
          <Button label={busy === 'signup' ? '가입 중…' : '가입 완료'} onPress={onSignup} disabled={!canSubmit} />
        </>
      }
    >
      <TextField
        label="학교 이메일"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setEmailError(null);
        }}
        placeholder="example@cau.ac.kr"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        editable={!verified}
        error={emailError}
        hint={verified ? '인증 완료! 이 이메일이 로그인 아이디가 돼요' : codeSent ? '메일로 받은 6자리 코드를 입력해 주세요' : null}
        right={
          verified ? null : (
            <View style={styles.sideButton}>
              <Button
                label={sendLabel}
                variant="secondary"
                onPress={onSendCode}
                disabled={!email.trim() || busy !== null || cooldown > 0}
              />
            </View>
          )
        }
      />

      {codeSent && !verified ? (
        <TextField
          label="인증 코드"
          value={code}
          onChangeText={(t) => {
            setCode(t.replace(/[^0-9]/g, ''));
            setCodeError(null);
          }}
          placeholder="6자리 숫자"
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          error={codeError}
          right={
            <View style={styles.sideButton}>
              <Button label={busy === 'verify' ? '확인 중' : '확인'} onPress={onVerify} disabled={code.length !== 6 || busy !== null} />
            </View>
          }
        />
      ) : null}

      <TextField
        label="비밀번호"
        value={password}
        onChangeText={setPassword}
        placeholder={`${PASSWORD_MIN_LENGTH}자 이상`}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        error={passwordError}
      />
      <TextField
        label="비밀번호 확인"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        error={confirmError}
      />
      {!verified ? <Text style={styles.notice}>이메일 인증을 마쳐야 가입할 수 있어요</Text> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  sideButton: { minWidth: 76 },
  error: { color: colors.danger, fontSize: fontSize.caption, textAlign: 'center' },
  notice: { color: colors.sub, fontSize: fontSize.caption },
});
