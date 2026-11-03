/**
 * S15 약속카드 — 담당: C
 * PRD: 다가오는 약속('약속 취소' 버튼, 확인 팝업) / 지난 약속('후기작성' → S17).
 * 11/3 추가: '일정 변경'(방장만, 시작 전 → 약속 확정 팝업을 변경 모드로), '완료 및 후기'(약속 시작 이후 → S17).
 * 탭 숫자 배지는 (tabs)/_layout.tsx. 만남 30분 전 알림은 아직 없다 (api/appointments.ts TODO).
 * 디자인은 나중에 피그마 반영 예정 (지금은 기능 위주).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type AppointmentItem, type MyAppointments } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { ConfirmAppointmentPopup } from '@/components/popups/ConfirmAppointmentPopup';
import { categoryInfo, colors, fontSize, spacing } from '@/constants/theme';
import { formatDateRange, formatTimeLeft } from '@/lib/time';

export default function AppointmentsScreen() {
  const [appointments, setAppointments] = useState<MyAppointments | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(0); // 마지막으로 불러온 시각. 남은 시간 표시용
  const [editing, setEditing] = useState<AppointmentItem | null>(null); // '일정 변경' 중인 약속
  const closeEdit = useCallback(() => setEditing(null), []);

  const load = useCallback(async () => {
    try {
      setAppointments(await api.appointments.getMyAppointments());
      setNow(Date.now());
    } catch (e) {
      setAppointments((prev) => prev ?? { upcoming: [], past: [] });
      Alert.alert(e instanceof ApiError ? e.message : '약속카드를 불러오지 못했어요');
    }
  }, []);

  // S14에서 확정하고 오거나 S17에서 후기를 쓰고 돌아올 때도 최신 카드를 보여 준다
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onCancel = (item: AppointmentItem) => {
    Alert.alert(
      '약속을 취소할까요?',
      item.is_host ? '방장이 취소하면 약속 전체가 취소되고 채팅방이 닫혀요.' : '취소하면 이 채팅방에서 자동으로 나가게 돼요.',
      [
        { text: '아니요', style: 'cancel' },
        {
          text: '약속 취소',
          style: 'destructive',
          onPress: async () => {
            setBusyId(item.id);
            try {
              await api.appointments.cancelAppointment(item.id);
            } catch (e) {
              Alert.alert(e instanceof ApiError ? e.message : '약속을 취소하지 못했어요');
            } finally {
              setBusyId(null);
              await load();
            }
          },
        },
      ],
    );
  };

  if (!appointments) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.title}>약속카드</Text>
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </SafeAreaView>
    );
  }

  const sections = [
    { title: '다가오는 약속', data: appointments.upcoming },
    { title: '지난 약속', data: appointments.past },
  ].filter((section) => section.data.length > 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>약속카드</Text>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          <AppointmentCard item={item} now={now} busy={busyId === item.id} onCancel={() => onCancel(item)} onReschedule={() => setEditing(item)} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>아직 약속이 없어요.{'\n'}채팅방에서 약속을 확정하면 여기에 카드가 생겨요.</Text>}
      />
      <ConfirmAppointmentPopup
        visible={editing !== null}
        roomId={editing?.room_id ?? ''}
        appointment={editing}
        onClose={closeEdit}
        onConfirmed={() => {
          setEditing(null);
          load();
        }}
      />
    </SafeAreaView>
  );
}

function AppointmentCard({
  item,
  now,
  busy,
  onCancel,
  onReschedule,
}: {
  item: AppointmentItem;
  now: number;
  busy: boolean;
  onCancel: () => void;
  onReschedule: () => void;
}) {
  const info = categoryInfo[item.category];
  const canceled = item.status === 'canceled';
  const ended = new Date(item.end_at).getTime() <= now;
  const hasMates = item.members.length > 1;

  return (
    <View style={[styles.card, canceled && styles.cardCanceled]}>
      <View style={styles.cardTop}>
        <View style={[styles.tag, { backgroundColor: info.background }]}>
          <Text style={[styles.tagText, { color: info.accent }]}>{info.label}</Text>
        </View>
        {canceled ? (
          <Text style={styles.canceled}>취소됨</Text>
        ) : !ended ? (
          <Text style={styles.timeLeft}>{formatTimeLeft(item.start_at, new Date(now))}</Text>
        ) : null}
      </View>

      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.detail}>{formatDateRange(item.start_at, item.end_at)}</Text>
      <Text style={styles.detail}>장소: {item.place}</Text>
      {item.activity ? <Text style={styles.detail}>활동: {item.activity}</Text> : null}

      <View style={styles.members} accessibilityLabel={`참여 메이트 ${item.members.map((m) => m.nickname).join(', ')}`}>
        {item.members.map((member) => (
          <Avatar key={member.id} nickname={member.nickname} photoUrl={member.photo_url} size={28} />
        ))}
      </View>

      {canceled ? null : (
        <View style={styles.actions}>
          <Button label="채팅방 가기" variant="secondary" onPress={() => router.push({ pathname: '/chat/[roomId]', params: { roomId: item.room_id } })} />
          {item.can_reschedule ? <Button label="일정 변경" variant="secondary" onPress={onReschedule} disabled={busy} /> : null}
          {item.can_cancel ? <Button label={busy ? '취소 중...' : '약속 취소'} variant="danger" onPress={onCancel} disabled={busy} /> : null}
          {item.can_complete && hasMates ? (
            item.review_done ? (
              <Text style={styles.reviewDone}>후기 완료</Text>
            ) : (
              <Button label="완료 및 후기" onPress={() => router.push({ pathname: '/review/[appointmentId]', params: { appointmentId: item.id } })} />
            )
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.ink, fontSize: fontSize.title, fontWeight: '900', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  loading: { marginTop: spacing.lg },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  sectionTitle: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700', marginTop: spacing.sm },
  empty: { color: colors.sub, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.lg, lineHeight: 22 },
  card: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  cardCanceled: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: fontSize.caption, fontWeight: '700' },
  timeLeft: { color: colors.alert, fontSize: fontSize.caption, fontWeight: '700' },
  canceled: { color: colors.danger, fontSize: fontSize.caption, fontWeight: '700' },
  cardTitle: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700', marginTop: spacing.xs },
  detail: { color: colors.sub, fontSize: fontSize.caption + 1 },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  reviewDone: { color: colors.sub, fontSize: fontSize.caption + 1, fontWeight: '700', textAlign: 'center' },
});
