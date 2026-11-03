/**
 * S05 메인 — 담당: A (디자인팀 UI 반영)
 * - 인사말 + 톱니바퀴(→ S04 설정)
 * - 오늘의 공강 시간 카드 (11/3 결정 4번): 오늘 요일의 공강 구간, '수정' → S06. 주말이거나 공강이 없으면 안내
 * - 무엇을 함께할까요? 카테고리 2×2 (→ S07). 내게 보이는 글이 있으면 개수 표시 (PRD S05)
 * - 약속카드 영역 (11/3 결정 5번: 하단 탭 대신 홈에서 진입): 가장 가까운 약속, 확인 안 한 약속 배지, '전체 보기' → S15
 * - 화면에 돌아올 때마다 다시 불러온다 (S06 저장, 약속 확정·변경이 바로 반영)
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type AppointmentItem } from '@/api';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { WEEKDAY_COUNT } from '@/constants/config';
import { CATEGORIES, categoryInfo, colors, fontSize, radius, spacing, type Category } from '@/constants/theme';
import { formatDateRange, formatTimeLeft, kstWeekday, WEEKDAY_LABELS } from '@/lib/time';
import type { TimeRange } from '@/types/db';

/** 카테고리 박스 아이콘과 부제 (디자인팀 UI) */
const CATEGORY_UI: Record<Category, { icon: IconName; caption: string }> = {
  meal: { icon: 'utensils', caption: '함께 먹기' },
  cafe: { icon: 'coffee', caption: '수다 한 잔' },
  study: { icon: 'book-open', caption: '같이 집중' },
  walk: { icon: 'map', caption: '캠퍼스 한 바퀴' },
};

type HomeData = {
  nickname: string;
  ranges: TimeRange[];
  counts: Record<Category, number> | null; // 보조 정보라 실패해도 나머지는 보여 준다
  nextAppointment: AppointmentItem | null;
  unseen: number;
};

async function loadHome(): Promise<HomeData> {
  const [me, ranges] = await Promise.all([api.users.getMe(), api.freeSlots.getMyFreeRanges()]);
  const [counts, appointments, unseen] = await Promise.all([
    api.posts.getMatchingCounts().catch(() => null),
    api.appointments.getMyAppointments().catch(() => null),
    api.appointments.getUnseenAppointmentCount().catch(() => 0),
  ]);
  const nextAppointment = appointments?.upcoming.find((a) => a.status !== 'canceled') ?? null;
  return { nickname: me.nickname, ranges, counts, nextAppointment, unseen };
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadHome()
        .then((d) => {
          if (!active) return;
          setData(d);
          setError(null);
        })
        .catch((e) => {
          if (active) setError(e instanceof ApiError ? e.message : '정보를 불러오지 못했어요');
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setData(await loadHome());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '정보를 불러오지 못했어요');
    } finally {
      setRefreshing(false);
    }
  };

  if (!data && !error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="불러오는 중" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.greeting} accessibilityRole="header">
              안녕하세요, {data?.nickname ?? ''}님!
            </Text>
            <Text style={styles.subGreeting}>오늘도 좋은 공강 시간 보내세요</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="설정" onPress={() => router.push('/settings')} style={styles.gear} hitSlop={6}>
            <Icon name="settings" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Button label="다시 시도" variant="secondary" size="sm" onPress={onRefresh} />
          </View>
        ) : null}

        {data ? (
          <>
            <TodayCard ranges={data.ranges} />

            <Text style={styles.sectionTitle}>무엇을 함께할까요?</Text>
            <View style={styles.grid}>
              {CATEGORIES.map((category) => {
                const ui = CATEGORY_UI[category];
                const label = categoryInfo[category].label;
                const count = data.counts?.[category] ?? 0;
                return (
                  <Pressable
                    key={category}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}, ${ui.caption}${count > 0 ? `, 내게 보이는 글 ${count}개` : ''}`}
                    onPress={() => router.push({ pathname: '/board/[category]', params: { category } })}
                    style={({ pressed }) => [styles.categoryBox, pressed && styles.pressed]}
                  >
                    <View style={styles.categoryTop}>
                      <View style={styles.iconCircle}>
                        <Icon name={ui.icon} size={20} color={colors.primary} />
                      </View>
                      {count > 0 ? (
                        <View style={styles.countPill}>
                          <Text style={styles.countText}>글 {count}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.categoryLabel}>
                      {label} / {ui.caption}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <AppointmentSection next={data.nextAppointment} unseen={data.unseen} />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** 오늘의 공강 시간 (보라 카드) */
function TodayCard({ ranges }: { ranges: TimeRange[] }) {
  const today = kstWeekday();
  const isWeekday = today < WEEKDAY_COUNT;
  const todayRanges = ranges.filter((r) => r.weekday === today);

  return (
    <View style={styles.todayCard}>
      <View style={styles.todayHead}>
        <Text style={styles.todayTitle}>
          오늘의 공강 시간 <Text style={styles.todayDay}>· {WEEKDAY_LABELS[today]}요일</Text>
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="공강 시간 수정" onPress={() => router.push('/free-time')} style={styles.editChip} hitSlop={8}>
          <Text style={styles.editChipText}>수정</Text>
        </Pressable>
      </View>
      {!isWeekday ? (
        <Text style={styles.todayEmpty}>오늘은 주말이에요.{'\n'}평일 공강을 미리 입력해 보세요.</Text>
      ) : todayRanges.length === 0 ? (
        <Text style={styles.todayEmpty}>
          {ranges.length === 0 ? '공강 시간을\n입력해 주세요.' : '오늘은 공강이 없어요.'}
        </Text>
      ) : (
        <View style={styles.todayList}>
          {todayRanges.map((r) => (
            <Text key={r.start} style={styles.todayRange}>
              {r.start} ~ {r.end}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

/** 약속카드 영역: 가장 가까운 약속 + 확인 안 한 약속 배지 + 전체 보기 */
function AppointmentSection({ next, unseen }: { next: AppointmentItem | null; unseen: number }) {
  return (
    <View style={styles.apptCard}>
      <View style={styles.apptHead}>
        <View style={styles.apptTitleRow}>
          <Text style={styles.apptTitle}>약속카드</Text>
          {unseen > 0 ? (
            <View style={styles.badge} accessibilityLabel={`확인 안 한 약속 ${unseen}개`}>
              <Text style={styles.badgeText}>{unseen}</Text>
            </View>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="약속카드 전체 보기" onPress={() => router.push('/appointments')} style={styles.more} hitSlop={8}>
          <Text style={styles.moreText}>전체 보기</Text>
          <Icon name="chevron-right" size={16} color={colors.primary} />
        </Pressable>
      </View>
      {next ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/appointments')} style={styles.apptInner}>
          <View style={styles.apptInnerTop}>
            <Text style={styles.apptName} numberOfLines={1}>
              {next.title}
            </Text>
            <Text style={styles.apptLeft}>{formatTimeLeft(next.start_at)}</Text>
          </View>
          <View style={styles.apptLine}>
            <Icon name="clock" size={15} color={colors.primary} />
            <Text style={styles.apptText}>{formatDateRange(next.start_at, next.end_at)}</Text>
          </View>
          <View style={styles.apptLine}>
            <Icon name="map-pin" size={15} color={colors.primary} />
            <Text style={styles.apptText} numberOfLines={1}>
              {next.place}
            </Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.apptEmpty}>
          <Text style={styles.apptEmptyTitle}>만남을 기다리고 있어요!</Text>
          <Text style={styles.apptEmptyText}>입력한 공강 시간에 맞는 약속이 생기면 여기서 확인할 수 있어요.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loading: { marginTop: spacing.lg * 2 },
  content: { padding: spacing.lg - 4, paddingTop: spacing.lg, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  greeting: { color: colors.primary, fontSize: fontSize.title, fontWeight: '900' },
  subGreeting: { color: colors.sub, fontSize: fontSize.body - 1, marginTop: 2 },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, backgroundColor: colors.white },
  errorText: { color: colors.danger, fontSize: fontSize.body },
  todayCard: { minHeight: 170, padding: spacing.md + 2, borderRadius: radius.card + 2, backgroundColor: colors.primary, gap: spacing.md },
  todayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todayTitle: { color: colors.white, fontSize: fontSize.body + 1, fontWeight: '800' },
  todayDay: { color: colors.primarySoft, fontWeight: '600' },
  editChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  editChipText: { color: colors.white, fontSize: fontSize.caption + 1, fontWeight: '800' },
  todayEmpty: { color: colors.white, fontSize: 26, fontWeight: '900', lineHeight: 34 },
  todayList: { gap: 4 },
  todayRange: { color: colors.white, fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  sectionTitle: { color: colors.ink, fontSize: fontSize.body + 3, fontWeight: '800', marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryBox: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 82,
    gap: spacing.sm,
    padding: spacing.md - 2,
    borderRadius: radius.card - 2,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  pressed: { opacity: 0.85 },
  categoryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  countPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.primaryTint },
  countText: { color: colors.primary, fontSize: fontSize.caption, fontWeight: '800' },
  categoryLabel: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700' },
  apptCard: { padding: spacing.md, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, gap: spacing.sm },
  apptHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  apptTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  apptTitle: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '800' },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.alert, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontSize: fontSize.caption, fontWeight: '800' },
  more: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  moreText: { color: colors.primary, fontSize: fontSize.caption + 1, fontWeight: '700' },
  apptInner: { padding: spacing.md - 2, borderRadius: radius.control, backgroundColor: colors.bg, gap: 6 },
  apptInnerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  apptName: { flex: 1, color: colors.primary, fontSize: fontSize.body, fontWeight: '800' },
  apptLeft: { color: colors.primaryBright, fontSize: fontSize.caption + 1, fontWeight: '800' },
  apptLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  apptText: { flex: 1, color: colors.ink, fontSize: fontSize.body - 1, fontVariant: ['tabular-nums'] },
  apptEmpty: { paddingVertical: spacing.lg - 4, paddingHorizontal: spacing.md, borderRadius: radius.control, backgroundColor: colors.bg, alignItems: 'center', gap: 6 },
  apptEmptyTitle: { color: colors.primary, fontSize: fontSize.body + 1, fontWeight: '800' },
  apptEmptyText: { color: colors.sub, fontSize: fontSize.caption + 1, textAlign: 'center', lineHeight: 18 },
});
