/**
 * S03 회원가입 — 담당: A (디자인팀 UI 반영)
 * 11/3 결정: 프로필(닉네임·성별·한줄소개)도 이 화면에서 함께 입력한다. ID 칸은 없다 (학교 이메일 = 아이디).
 * 흐름: 학교 이메일 → '인증요청' → 6자리 코드 '확인' → 비밀번호·확인 → 닉네임 '중복 확인' → 성별 → (한줄소개) → '가입하기'
 *       가입하기 = signUp(비밀번호) + updateMe(프로필) → S05 메인
 * - 이메일 인증, 닉네임 중복 확인, 성별을 마쳐야 '가입하기'가 켜진다
 * - 학교 도메인이 아니면 "학교 이메일만 가입할 수 있어요"
 * - 인증 코드 재발송은 60초에 한 번 (남은 초 표시)
 * - 가입은 됐는데 프로필 저장이 실패하면 같은 버튼으로 프로필 저장만 다시 한다. 앱을 꺼도 다음 실행 때 S04 신규 설정으로 간다
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError } from '@/api';
import { Button } from '@/components/Button';
import { FormScreen } from '@/components/FormScreen';
import { type Gender, GenderPicker } from '@/components/GenderPicker';
import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, PASSWORD_MIN_LENGTH } from '@/constants/config';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

const RESEND_SECONDS = 60;

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function SignupScreen() {
  // 이메일 인증
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  // 비밀번호
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // 프로필
  const [nickname, setNickname] = useState('');
  const [checkedNickname, setCheckedNickname] = useState<string | null>(null); // 중복 확인을 통과한 닉네임
  const [nicknameMsg, setNicknameMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [bio, setBio] = useState('');
  // 제출
  const [busy, setBusy] = useState<'send' | 'verify' | 'nickname' | 'signup' | null>(null);
  const [accountCreated, setAccountCreated] = useState(false); // 계정은 만들었고 프로필 저장만 남은 상태
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

  const trimmedNickname = nickname.trim();
  const nicknameFormatOk = trimmedNickname.length >= NICKNAME_MIN_LENGTH && trimmedNickname.length <= NICKNAME_MAX_LENGTH;

  const onCheckNickname = async () => {
    if (!nicknameFormatOk) {
      setNicknameMsg({ text: `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해 주세요`, ok: false });
      return;
    }
    setBusy('nickname');
    try {
      const available = await api.users.isNicknameAvailable(trimmedNickname);
      setCheckedNickname(available ? trimmedNickname : null);
      setNicknameMsg(available ? { text: '사용할 수 있는 닉네임이에요', ok: true } : { text: '이미 사용 중인 닉네임이에요', ok: false });
    } catch (e) {
      setNicknameMsg({ text: message(e, '닉네임을 확인하지 못했어요'), ok: false });
    } finally {
      setBusy(null);
    }
  };

  const passwordError =
    password.length > 0 && password.length < PASSWORD_MIN_LENGTH ? `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요` : null;
  const confirmError = confirm.length > 0 && confirm !== password ? '비밀번호가 일치하지 않아요' : null;
  const passwordOk = password.length >= PASSWORD_MIN_LENGTH && confirm === password;
  const nicknameOk = checkedNickname !== null && checkedNickname === trimmedNickname;
  const canSubmit = verified && passwordOk && nicknameOk && gender !== null && busy === null;

  // 아직 안 한 것 안내 (가입하기 버튼 위)
  const todo = !verified
    ? '학교 이메일 인증을 마쳐 주세요'
    : !passwordOk
      ? '비밀번호를 확인해 주세요'
      : !nicknameOk
        ? '닉네임 중복 확인을 해 주세요'
        : gender === null
          ? '성별을 선택해 주세요'
          : null;

  const onSignup = async () => {
    if (!canSubmit || !gender) return;
    setBusy('signup');
    setSubmitError(null);
    try {
      if (!accountCreated) {
        await api.auth.signUp(email, password);
        setAccountCreated(true);
      }
      await api.users.updateMe({ nickname: trimmedNickname, gender, bio: bio.trim() || null, photo_url: null });
      router.replace('/home');
    } catch (e) {
      const msg = message(e, '가입하지 못했어요. 다시 시도해 주세요');
      if (e instanceof ApiError && e.code === 'already_exists' && msg.includes('닉네임')) {
        setCheckedNickname(null);
        setNicknameMsg({ text: msg, ok: false });
      } else {
        setSubmitError(msg);
      }
    } finally {
      setBusy(null);
    }
  };

  const sendLabel = busy === 'send' ? '보내는 중' : cooldown > 0 ? `${cooldown}초` : codeSent ? '재요청' : '인증요청';

  return (
    <FormScreen
      title="회원가입"
      subtitle="공강메이트에 오신 것을 환영합니다"
      onBack={accountCreated ? undefined : () => router.back()}
      footer={
        <>
          {submitError ? <Text style={styles.error}>{submitError}</Text> : todo ? <Text style={styles.todo}>{todo}</Text> : null}
          <Button label={busy === 'signup' ? '가입 중…' : accountCreated ? '프로필 저장하고 시작하기' : '가입하기'} onPress={onSignup} disabled={!canSubmit} />
        </>
      }
    >
      {/* 이메일 인증 */}
      <TextField
        label="e-mail 주소"
        required
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setEmailError(null);
        }}
        placeholder="이메일@cau.ac.kr"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        editable={!verified}
        error={emailError}
        right={
          verified ? null : (
            <View style={styles.sideButton}>
              <Button label={sendLabel} size="sm" onPress={onSendCode} disabled={!email.trim() || busy !== null || cooldown > 0} />
            </View>
          )
        }
      />
      <View style={[styles.infoBox, verified && styles.infoBoxDone]}>
        <Icon name={verified ? 'check' : 'mail'} size={18} color={colors.primary} />
        <Text style={styles.infoText}>
          {verified
            ? '인증 완료! 이 이메일이 로그인 아이디가 돼요.'
            : codeSent
              ? '메일로 받은 6자리 코드를 입력해 주세요.'
              : '학교 이메일(@cau.ac.kr) 인증이 완료되어야 회원가입이 진행됩니다.'}
        </Text>
      </View>

      {codeSent && !verified ? (
        <TextField
          label="인증 코드"
          required
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
              <Button label={busy === 'verify' ? '확인 중' : '확인'} size="sm" onPress={onVerify} disabled={code.length !== 6 || busy !== null} />
            </View>
          }
        />
      ) : null}

      {/* 비밀번호 */}
      <TextField
        label="password"
        required
        value={password}
        onChangeText={setPassword}
        placeholder="비밀번호를 입력해주세요"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!accountCreated}
        error={passwordError}
        hint={!passwordError && !password ? `${PASSWORD_MIN_LENGTH}자 이상` : null}
      />
      <TextField
        label="password 확인"
        required
        value={confirm}
        onChangeText={setConfirm}
        placeholder="비밀번호를 다시 입력해주세요"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!accountCreated}
        error={confirmError}
      />

      {/* 프로필 */}
      <TextField
        label="닉네임"
        required
        value={nickname}
        onChangeText={(t) => {
          setNickname(t);
          setNicknameMsg(null);
        }}
        placeholder="닉네임을 입력해주세요"
        maxLength={NICKNAME_MAX_LENGTH}
        autoCorrect={false}
        error={nicknameMsg && !nicknameMsg.ok ? nicknameMsg.text : null}
        hint={nicknameMsg?.ok && nicknameOk ? nicknameMsg.text : `${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자`}
        inside={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="닉네임 중복 확인"
            onPress={onCheckNickname}
            disabled={!trimmedNickname || busy !== null || nicknameOk}
            style={[styles.checkChip, nicknameOk && styles.checkChipDone]}
            hitSlop={6}
          >
            <Text style={[styles.checkChipText, nicknameOk && styles.checkChipTextDone]}>
              {busy === 'nickname' ? '확인 중' : nicknameOk ? '확인 완료' : '중복 확인'}
            </Text>
          </Pressable>
        }
      />
      <GenderPicker value={gender} onChange={setGender} />
      <TextField
        label="한줄소개"
        value={bio}
        onChangeText={setBio}
        placeholder="간단한 자기소개를 입력해주세요"
        maxLength={BIO_MAX_LENGTH}
        showCount
      />
      <Text style={styles.requiredNote}>*은 필수 입력 항목입니다</Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  sideButton: { minWidth: 92 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md - 4,
    marginTop: -spacing.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.primaryTint,
  },
  infoBoxDone: { borderColor: colors.primary },
  infoText: { flex: 1, color: colors.primary, fontSize: fontSize.caption + 1, lineHeight: 18 },
  checkChip: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: colors.primarySoft },
  checkChipDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkChipText: { color: colors.primary, fontSize: fontSize.caption + 1, fontWeight: '800' },
  checkChipTextDone: { color: colors.white },
  requiredNote: { color: colors.sub, fontSize: fontSize.caption, textAlign: 'center' },
  todo: { color: colors.sub, fontSize: fontSize.caption + 1, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSize.caption + 1, textAlign: 'center' },
});
