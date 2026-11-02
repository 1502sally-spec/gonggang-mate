/**
 * S04 설정(프로필) — 담당: A
 * PRD: 프로필 사진, 닉네임(필수, 2~10자, 중복 불가), 성별(필수), 한줄소개(최대 40자, 글자 수 표시).
 * - 신규 가입자(mode=new): 가입 직후 자동 진입. 뒤로가기 없음, 버튼 "저장하고 시작하기" → S05
 * - 기존 사용자(S05 톱니바퀴): 뒤로가기 있음, 버튼 "저장" → S05
 * - 프로필 사진: 서버 업로드가 아직 없어서(P2) 지금은 닉네임 첫 글자 아바타로 표시
 * - 기존 사용자에게만: 차단 목록 보기·해제(PRD 8.2), 로그아웃
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError, type MiniUser } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FormScreen } from '@/components/FormScreen';
import { TextField } from '@/components/TextField';
import { BIO_MAX_LENGTH, NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH } from '@/constants/config';
import { colors, fontSize, MIN_TOUCH, spacing } from '@/constants/theme';

type Gender = 'male' | 'female';
const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
];

export default function SettingsScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isNew = mode === 'new';

  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<MiniUser[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.users.getMe();
        setNickname(me.nickname);
        // 신규 가입자는 프로필이 없어서 성별 기본값이 들어 있다. 직접 고르게 비워 둔다
        setGender(me.nickname ? me.gender : null);
        setBio(me.bio ?? '');
        setPhotoUrl(me.photo_url);
        if (!isNew) setBlocked(await api.blocks.getBlockedUsers());
      } catch (e) {
        setSubmitError(e instanceof ApiError ? e.message : '내 정보를 불러오지 못했어요');
      } finally {
        setLoading(false);
      }
    })();
  }, [isNew]);

  const trimmed = nickname.trim();
  const nicknameInvalid = trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH;
  const canSave = !loading && !saving && !nicknameInvalid && gender !== null;

  const onSave = async () => {
    if (!canSave || !gender) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await api.users.updateMe({ nickname: trimmed, gender, bio: bio.trim() || null, photo_url: photoUrl });
      if (isNew || !router.canGoBack()) router.replace('/home');
      else router.back();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '프로필을 저장하지 못했어요';
      if (e instanceof ApiError && (e.code === 'already_exists' || msg.includes('닉네임'))) setNicknameError(msg);
      else setSubmitError(msg);
    } finally {
      setSaving(false);
    }
  };

  const onUnblock = (user: MiniUser) => {
    Alert.alert(`${user.nickname}님 차단을 해제할까요?`, undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '해제',
        onPress: async () => {
          try {
            await api.blocks.unblockUser(user.id);
            setBlocked((list) => list.filter((u) => u.id !== user.id));
          } catch (e) {
            Alert.alert(e instanceof ApiError ? e.message : '차단을 해제하지 못했어요');
          }
        },
      },
    ]);
  };

  const onLogout = () => {
    Alert.alert('로그아웃할까요?', undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.auth.logOut();
            router.replace('/login');
          } catch (e) {
            Alert.alert(e instanceof ApiError ? e.message : '로그아웃하지 못했어요');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} accessibilityLabel="불러오는 중" />
      </View>
    );
  }

  return (
    <FormScreen
      title={isNew ? '프로필 설정' : '설정'}
      subtitle={isNew ? '메이트에게 보여 줄 프로필을 만들어 주세요' : undefined}
      onBack={isNew ? undefined : () => router.back()}
      footer={
        <>
          {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
          <Button
            label={saving ? '저장 중…' : isNew ? '저장하고 시작하기' : '저장'}
            onPress={onSave}
            disabled={!canSave}
          />
        </>
      }
    >
      <View style={styles.avatarRow}>
        <Avatar nickname={trimmed || '?'} photoUrl={photoUrl} size={72} />
        <Text style={styles.photoNote}>프로필 사진은 곧 추가될 예정이에요</Text>
      </View>

      <TextField
        label="닉네임 (필수)"
        value={nickname}
        onChangeText={(t) => {
          setNickname(t);
          setNicknameError(null);
        }}
        placeholder={`${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자`}
        maxLength={NICKNAME_MAX_LENGTH}
        showCount
        autoCorrect={false}
        error={
          nicknameError ??
          (nickname.length > 0 && trimmed.length < NICKNAME_MIN_LENGTH ? `닉네임은 ${NICKNAME_MIN_LENGTH}자 이상이어야 해요` : null)
        }
      />

      <View style={styles.field}>
        <Text style={styles.label}>성별 (필수)</Text>
        <View style={styles.genderRow} accessibilityRole="radiogroup">
          {GENDERS.map((g) => {
            const selected = gender === g.value;
            return (
              <Pressable
                key={g.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={g.label}
                onPress={() => setGender(g.value)}
                style={[styles.genderChip, selected && styles.genderChipOn]}
              >
                <Text style={[styles.genderText, selected && styles.genderTextOn]}>{g.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <TextField
        label="한줄소개 (선택)"
        value={bio}
        onChangeText={setBio}
        placeholder="예: 같이 밥 먹어요"
        maxLength={BIO_MAX_LENGTH}
        showCount
      />

      {!isNew ? (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>차단 목록</Text>
            {blocked.length === 0 ? (
              <Text style={styles.empty}>차단한 사용자가 없어요</Text>
            ) : (
              blocked.map((u) => (
                <View key={u.id} style={styles.blockRow}>
                  <Avatar nickname={u.nickname} photoUrl={u.photo_url} size={32} />
                  <Text style={styles.blockName}>{u.nickname}</Text>
                  <View style={styles.unblock}>
                    <Button label="해제" variant="secondary" onPress={() => onUnblock(u)} />
                  </View>
                </View>
              ))
            )}
          </View>
          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.logout}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        </>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  avatarRow: { alignItems: 'center', gap: spacing.sm },
  photoNote: { color: colors.sub, fontSize: fontSize.caption },
  field: { gap: spacing.sm },
  label: { color: colors.ink, fontSize: fontSize.caption + 1, fontWeight: '700' },
  genderRow: { flexDirection: 'row', gap: spacing.sm },
  genderChip: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderChipOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  genderText: { color: colors.ink, fontSize: fontSize.body },
  genderTextOn: { color: colors.primary, fontWeight: '700' },
  empty: { color: colors.sub, fontSize: fontSize.caption },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  blockName: { flex: 1, color: colors.ink, fontSize: fontSize.body },
  unblock: { minWidth: 72 },
  logout: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  logoutText: { color: colors.danger, fontSize: fontSize.body, fontWeight: '700' },
  error: { color: colors.danger, fontSize: fontSize.caption, textAlign: 'center' },
});
