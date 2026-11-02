/**
 * S13 메이트 정보 팝업 — 채팅방(S12)에서 프로필 사진을 누르면 뜬다.
 * 후기는 누가 남겼는지 숨기고 항목별 합계만 보여 준다. 내 정보에는 '차단' 버튼이 없다.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, ApiError, type MateInfo } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/popups/BottomSheet';
import { colors, fontSize, spacing } from '@/constants/theme';
import { REVIEW_ITEMS } from '@/types/db';

const GENDER_LABELS: Record<MateInfo['gender'], string> = { male: '남성', female: '여성' };

type Props = {
  userId: string | null;
  onClose: () => void;
  /** 차단한 뒤 불린다. 채팅방에서 메시지를 다시 불러올 때 쓴다 */
  onBlocked?: (userId: string) => void;
};

export function MateInfoPopup({ userId, onClose, onBlocked }: Props) {
  const [info, setInfo] = useState<MateInfo | null>(null);
  const [isMe, setIsMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    Promise.all([api.users.getMateInfo(userId), api.users.getMe()])
      .then(([mate, me]) => {
        if (!active) return;
        setInfo(mate);
        setIsMe(mate.id === me.id);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : '메이트 정보를 불러오지 못했어요');
      });
    return () => {
      active = false;
      setInfo(null);
      setError(null);
    };
  }, [userId]);

  const onBlock = () => {
    if (!info) return;
    Alert.alert(`${info.nickname}님을 차단할까요?`, '서로의 글과 메시지가 보이지 않게 돼요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '차단하기',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.blocks.blockUser(info.id);
            onBlocked?.(info.id);
            onClose();
          } catch (e) {
            Alert.alert(e instanceof ApiError ? e.message : '차단하지 못했어요');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <BottomSheet visible={userId !== null} onClose={onClose} title="메이트 정보">
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !info ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.profile}>
            <Avatar nickname={info.nickname} photoUrl={info.photo_url} size={64} />
            <View style={styles.profileText}>
              <Text style={styles.nickname}>{info.nickname}</Text>
              <Text style={styles.sub}>{GENDER_LABELS[info.gender]}</Text>
              {info.bio ? <Text style={styles.bio}>{info.bio}</Text> : null}
            </View>
          </View>

          <View style={styles.stats}>
            <Text style={styles.heart}>♥ 메이트 하트 {info.heart_count}개</Text>
            <Text style={styles.sub}>만남 {info.meet_count}회</Text>
          </View>

          <View style={styles.reviews}>
            <Text style={styles.reviewTitle}>받은 후기</Text>
            {REVIEW_ITEMS.map(({ key, label }) => (
              <View key={key} style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>{label}</Text>
                <Text style={styles.reviewCount}>{info.review_counts[key]}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {info && !isMe ? <Button label={busy ? '차단 중...' : '차단'} variant="danger" onPress={onBlock} disabled={busy} /> : null}
      <Button label="닫기" variant="secondary" onPress={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: spacing.lg },
  error: { color: colors.danger, fontSize: fontSize.body, marginVertical: spacing.md },
  body: { gap: spacing.md, paddingBottom: spacing.sm },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileText: { flex: 1, gap: 2 },
  nickname: { color: colors.ink, fontSize: fontSize.body, fontWeight: '900' },
  sub: { color: colors.sub, fontSize: fontSize.caption + 1 },
  bio: { color: colors.ink, fontSize: fontSize.caption + 1 },
  stats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heart: { color: colors.alert, fontSize: fontSize.body, fontWeight: '700' },
  reviews: { gap: spacing.xs },
  reviewTitle: { color: colors.ink, fontSize: fontSize.caption + 1, fontWeight: '700' },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reviewLabel: { flex: 1, color: colors.sub, fontSize: fontSize.caption + 1 },
  reviewCount: { color: colors.ink, fontSize: fontSize.caption + 1, fontWeight: '700' },
});
