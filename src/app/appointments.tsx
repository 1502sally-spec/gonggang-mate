/**
 * S15 약속카드 — 담당: C
 * PRD: 다가오는 약속('약속 취소' 버튼, 확인 팝업) / 지난 약속('후기작성' → S17).
 * 11/3 추가: '일정 변경'(방장만, 시작 전 → 약속 확정 팝업을 변경 모드로), '완료 및 후기'(약속 시작 이후 → S17).
 * 11/3 결정: 하단 탭에서 빠지고 홈 약속카드 영역 → '전체 보기'로 들어온다(뒤로가기 있음). 이 화면을 열면 확인 안 한 약속 배지를 없앤다.
 * 만남 30분 전 알림은 아직 없다 (api/appointments.ts TODO).
 * 디자인팀 UI 반영(11/4, A): 위쪽 보라 띠 카드, 시간·장소·활동 칸(아이콘 원), 버튼 2×2(일정 변경·채팅 / 취소·완료 및 후기),
 *   '교내 공개 장소에서 만남을 권장드려요'. 디자인에 없는 다가오는/지난 약속 구분, 남은 시간, 참여 메이트는 같은 형식으로 넣었다.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type AppointmentItem, type MyAppointments } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { ConfirmAppointmentPopup } from '@/components/popups/ConfirmAppointmentPopup';
import { categoryInfo, colors, fontSize, radius, spacing } from '@/constants/theme';
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
      api.appointments.markAppointmentsSeen().catch(() => {}); // 홈 약속카드 배지 없애기
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
        <Header />
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
      <Header />
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

/** 탭에서 빠졌으므로 뒤로가기가 있는 상단 (11/3 결정) */
function Header() {
  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.back()} style={styles.back} hitSlop={8}>
        <Icon name="arrow-left" size={24} color={colors.ink} />
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">
        약속 카드
      </Text>
    </View>
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
  const host = item.members[0]; // 서버가 방장을 맨 앞에 둔다

  return (
    <View style={[styles.card, canceled && styles.cardCanceled]}>
      <View style={styles.cardBar} />

      {/* 위: 방장 + 제목 + 상태 */}
      <View style={styles.hostRow}>
        <Avatar nickname={host?.nickname ?? item.title} photoUrl={host?.photo_url ?? null} size={40} />
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.hostText} numberOfLines={1}>
            {info.label} · 방장 {item.is_host ? '나' : (host?.nickname ?? '')}
          </Text>
        </View>
        {canceled ? (
          <Text style={styles.canceled}>취소됨</Text>
        ) : !ended ? (
          <View style={styles.leftChip}>
            <Text style={styles.leftText}>{formatTimeLeft(item.start_at, new Date(now))}</Text>
          </View>
        ) : null}
      </View>

      <Field icon="clock" label="시간">
        <Text style={styles.valueText}>{formatDateRange(item.start_at, item.end_at)}</Text>
      </Field>
      <Field icon="map-pin" label="장소">
        <Text style={styles.valueText}>{item.place}</Text>
      </Field>
      {item.activity ? (
        <Field icon="star" label="활동">
          <Text style={styles.valueText}>{item.activity}</Text>
        </Field>
      ) : null}
      <Field icon="users" label={`참여 메이트 ${item.members.length}명`}>
        <View style={styles.members} accessibilityLabel={`참여 메이트 ${item.members.map((m) => m.nickname).join(', ')}`}>
          {item.members.map((member) => (
            <View key={member.id} style={styles.member}>
              <Avatar nickname={member.nickname} photoUrl={member.photo_url} size={28} />
              <Text style={styles.memberName} numberOfLines={1}>
                {member.nickname}
              </Text>
            </View>
          ))}
        </View>
      </Field>

      {canceled ? null : (
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <View style={styles.cell}>
              {/* 일정 변경: 방장만, 시작 전 (11/3 결정 11번) */}
              <Button label="일정 변경" size="sm" variant="secondary" onPress={onReschedule} disabled={!item.can_reschedule || busy} />
            </View>
            <View style={styles.cell}>
              <Button
                label="채팅"
                size="sm"
                variant="secondary"
                onPress={() => router.push({ pathname: '/chat/[roomId]', params: { roomId: item.room_id } })}
              />
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={styles.cell}>
              <Button label={busy ? '취소 중...' : '취소'} size="sm" variant="muted" onPress={onCancel} disabled={!item.can_cancel || busy} />
            </View>
            <View style={styles.cell}>
              {item.review_done && hasMates ? (
                <Button label="후기 완료" size="sm" variant="secondary" disabled />
              ) : (
                <Button
                  label="완료 및 후기"
                  size="sm"
                  onPress={() => router.push({ pathname: '/review/[appointmentId]', params: { appointmentId: item.id } })}
                  disabled={!item.can_complete || !hasMates}
                />
              )}
            </View>
          </View>
        </View>
      )}
      <Text style={styles.guide}>교내 공개 장소에서 만남을 권장드려요</Text>
    </View>
  );
}

/** 카드 안 한 칸: 아이콘 원 + 보라 라벨 + 회색 상자 */
function Field({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <View style={styles.iconCircle}>
          <Icon name={icon} size={14} color={colors.primary} />
        </View>
        <Text style={styles.fieldLabel}>{label}</Text>
      </View>
      <View style={styles.valueBox}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, minHeight: 52 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  title: { color: colors.ink, fontSize: fontSize.title, fontWeight: '900' },
  loading: { marginTop: spacing.lg },
  list: { paddingHorizontal: spacing.lg - 4, paddingBottom: spacing.lg, gap: spacing.md - 4, flexGrow: 1 },
  sectionTitle: { color: colors.primary, fontSize: fontSize.body, fontWeight: '900', marginTop: spacing.sm },
  empty: { color: colors.sub, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.lg, lineHeight: 22 },
  card: {
    overflow: 'hidden',
    gap: spacing.md - 4,
    padding: spacing.md,
    paddingTop: spacing.md + 6,
    borderRadius: radius.card + 2,
    backgroundColor: colors.white,
  },
  cardBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 8, backgroundColor: colors.primary },
  cardCanceled: { opacity: 0.6 },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md - 4,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTitle: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '800' },
  hostText: { color: colors.sub, fontSize: fontSize.caption + 1 },
  leftChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.primaryTint },
  leftText: { color: colors.primaryBright, fontSize: fontSize.caption, fontWeight: '800' },
  canceled: { color: colors.danger, fontSize: fontSize.caption + 1, fontWeight: '800' },
  field: { gap: 6 },
  fieldHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { color: colors.primary, fontSize: fontSize.caption + 1, fontWeight: '800' },
  valueBox: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md - 2, paddingVertical: spacing.sm, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg },
  valueText: { color: colors.ink, fontSize: fontSize.body, fontVariant: ['tabular-nums'] },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  member: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 120 },
  memberName: { color: colors.ink, fontSize: fontSize.caption + 1 },
  grid: { gap: spacing.sm, marginTop: spacing.xs },
  gridRow: { flexDirection: 'row', gap: spacing.sm },
  cell: { flex: 1 },
  guide: { color: colors.sub, fontSize: fontSize.caption, textAlign: 'center' },
});
