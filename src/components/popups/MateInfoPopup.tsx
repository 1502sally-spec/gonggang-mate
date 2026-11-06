/**
 * S13 상대 프로필 — 채팅방(S12)에서 프로필 사진을 누르면 뜬다.
 * 디자인팀 UI 반영(11/4, A): 아래 팝업 대신 전체 화면. 프로필 카드, 받은 메이트 하트, 대표 후기, '1:1 채팅' 버튼.
 * 쓰는 쪽 입력값(userId, onClose, onBlocked)은 그대로다. 관심활동·학과는 넣지 않는다 (11/3 결정 6번, 데이터 없음).
 * 후기는 누가 남겼는지 숨기고 항목별 합계만 보여 준다. 내 정보에는 '차단' 버튼이 없다.
 * 11/3 추가: 현재 활동 중 표시(최근 15분), '1:1 채팅' 버튼(같은 두 사람의 방은 하나, 차단 사이엔 정보 자체가 안 보임)
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type MateInfo } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TopReviews } from '@/components/TopReviews';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

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

  const onDirectChat = async () => {
    if (!info) return;
    setBusy(true);
    try {
      const roomId = await api.rooms.openDirectRoom(info.id);
      onClose();
      router.push({ pathname: '/chat/[roomId]', params: { roomId } });
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '1:1 채팅방을 열지 못했어요');
    } finally {
      setBusy(false);
    }
  };

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
    <Modal visible={userId !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={onClose} style={styles.back} hitSlop={8}>
              <Icon name="arrow-left" size={24} color={colors.ink} />
            </Pressable>
          </View>

          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !info ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.title} accessibilityRole="header">
                  {isMe ? '내 프로필' : '상대 프로필'}
                </Text>
                <Text style={styles.subtitle}>공강메이트 정보를 확인해보세요</Text>

                {/* 프로필 카드 */}
                <View style={styles.card}>
                  <View style={styles.profile}>
                    <Avatar nickname={info.nickname} photoUrl={info.photo_url} size={64} />
                    <View style={styles.profileText}>
                      <Text style={styles.nickname}>{info.nickname}</Text>
                      <View style={styles.metaRow}>
                        <Text style={styles.sub}>{GENDER_LABELS[info.gender]}</Text>
                        {info.is_active ? (
                          <View style={styles.active} accessibilityLabel="현재 활동 중">
                            <View style={styles.activeDot} />
                            <Text style={styles.activeText}>활동 중</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>한줄소개</Text>
                    <Text style={styles.fieldValue}>{info.bio || '아직 한줄소개가 없어요'}</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>만남</Text>
                    <Text style={styles.fieldValue}>{info.meet_count}회</Text>
                  </View>
                </View>

                {/* 받은 메이트 하트 */}
                <View style={[styles.card, styles.heartCard]}>
                  <View style={styles.iconCircle}>
                    <Icon name="heart" size={18} color={colors.primary} />
                  </View>
                  <Text style={styles.heartLabel}>받은 메이트 하트</Text>
                  <Text style={styles.heartCount}>
                    {info.heart_count}
                    <Text style={styles.heartUnit}> 개</Text>
                  </Text>
                </View>

                {/* 대표 후기: 많이 받은 항목 상위 3개 (11/6 결정 6번). 누가 남겼는지는 숨김 */}
                <Text style={styles.sectionTitle}>대표 후기</Text>
                <View style={styles.card}>
                  <TopReviews counts={info.review_counts} emptyText="아직 받은 후기가 없어요" />
                </View>
              </ScrollView>

              {!isMe ? (
                <View style={styles.footer}>
                  <Button label="1:1 채팅 하기" onPress={onDirectChat} disabled={busy} />
                  <Pressable accessibilityRole="button" onPress={onBlock} disabled={busy} style={styles.blockLink} hitSlop={8}>
                    <Text style={styles.blockText}>{busy ? '처리 중...' : '차단하기'}</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { minHeight: 48, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: spacing.lg * 2 },
  error: { color: colors.danger, fontSize: fontSize.body, margin: spacing.lg },
  body: { paddingHorizontal: spacing.lg - 4, paddingBottom: spacing.lg, gap: spacing.md - 2 },
  title: { color: colors.primary, fontSize: fontSize.title + 2, fontWeight: '900' },
  subtitle: { color: colors.sub, fontSize: fontSize.body - 1, marginTop: -spacing.sm },
  card: { padding: spacing.md, gap: spacing.md - 4, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileText: { flex: 1, gap: 4 },
  nickname: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sub: { color: colors.sub, fontSize: fontSize.body - 1 },
  active: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryTint },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  activeText: { color: colors.primary, fontSize: fontSize.caption, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.line },
  field: { gap: 2 },
  fieldLabel: { color: colors.sub, fontSize: fontSize.caption },
  fieldValue: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700' },
  heartCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  heartLabel: { flex: 1, color: colors.ink, fontSize: fontSize.body, fontWeight: '800' },
  heartCount: { color: colors.primary, fontSize: 22, fontWeight: '900' },
  heartUnit: { color: colors.ink, fontSize: fontSize.body - 1, fontWeight: '600' },
  sectionTitle: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '800', marginBottom: -spacing.xs },
  footer: { paddingHorizontal: spacing.lg - 4, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs, alignItems: 'stretch' },
  blockLink: { alignSelf: 'center', paddingVertical: spacing.sm },
  blockText: { color: colors.sub, fontSize: fontSize.body - 1, textDecorationLine: 'underline' },
});
