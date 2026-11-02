/**
 * S05 메인 — 담당: A
 * PRD
 * - 상단: 로고, 오른쪽 톱니바퀴(→ S04 설정)
 * - 내 공강시간 박스: 요일(월~일)별 미니 막대로 공강 위치 표시 + 공강 구간 칩 목록(예: 월 12:00-13:00)
 *   '내 공강시간 설정' 버튼 → S06. 공강이 없으면 "공강시간을 설정하면 맞는 메이트 글이 보여요" + 버튼 강조
 * - 카테고리 박스 4개(2×2): 식사·카페·공부·산책 → S07. 각 박스에 내게 보이는 글 수
 * - [AC] S06에서 저장한 공강이 바로 반영된다 (화면에 돌아올 때마다 다시 불러옴)
 * - [AC] 연속된 공강 칸은 하나의 구간으로 합쳐 표시한다 (api가 합친 구간을 돌려줌)
 * 디자인은 나중에 피그마 반영 예정 (지금은 기능 위주).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api';
import { Button } from '@/components/Button';
import { DAY_END, DAY_START } from '@/constants/config';
import { CATEGORIES, categoryInfo, colors, fontSize, MIN_TOUCH, spacing, type Category } from '@/constants/theme';
import { formatRange, timeToMinutes, WEEKDAY_LABELS } from '@/lib/time';
import type { TimeRange } from '@/types/db';

type HomeData = {
  nickname: string;
  ranges: TimeRange[];
  counts: Record<Category, number> | null; // 글 수를 못 불러와도 나머지는 보여 준다
};

const BAR_HEIGHT = 72;
const DAY_START_MIN = timeToMinutes(DAY_START);
const DAY_LENGTH_MIN = timeToMinutes(DAY_END) - DAY_START_MIN;

async function loadHome(): Promise<HomeData> {
  const [me, ranges] = await Promise.all([api.users.getMe(), api.freeSlots.getMyFreeRanges()]);
  const counts = await api.posts.getMatchingCounts().catch(() => null);
  return { nickname: me.nickname, ranges, counts };
}

export default function HomeScreen() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // 화면에 들어올 때마다(S06·S04에서 돌아올 때 포함) 다시 불러온다
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

  const hasFreeTime = (data?.ranges.length ?? 0) > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.logo} accessibilityRole="header">
          공강메이트
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="설정"
          onPress={() => router.push('/settings')}
          style={styles.gear}
          hitSlop={8}
        >
          <Text style={styles.gearText}>⚙︎</Text>
        </Pressable>
      </View>

      {!data && !error ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="불러오는 중" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Button label="다시 시도" variant="secondary" onPress={onRefresh} />
            </View>
          ) : null}

          {data ? (
            <>
              <Text style={styles.greeting}>안녕하세요, {data.nickname}님!</Text>

              {/* 내 공강시간 박스 */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>내 공강시간</Text>
                <FreeTimeBars ranges={data.ranges} />
                {hasFreeTime ? (
                  <View style={styles.chips}>
                    {data.ranges.map((r) => (
                      <View key={`${r.weekday}-${r.start}`} style={styles.chip}>
                        <Text style={styles.chipText}>{formatRange(r)}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.emptyText}>공강시간을 설정하면 맞는 메이트 글이 보여요</Text>
                )}
                <Button
                  label="내 공강시간 설정"
                  variant={hasFreeTime ? 'secondary' : 'primary'}
                  onPress={() => router.push('/free-time')}
                />
              </View>

              {/* 카테고리 2×2 */}
              <Text style={styles.sectionTitle}>무엇을 함께할까요?</Text>
              <View style={styles.grid}>
                {CATEGORIES.map((category) => {
                  const info = categoryInfo[category];
                  const count = data.counts?.[category];
                  return (
                    <Pressable
                      key={category}
                      accessibilityRole="button"
                      accessibilityLabel={`${info.label}${count !== undefined ? `, 보이는 글 ${count}개` : ''}`}
                      onPress={() => router.push({ pathname: '/board/[category]', params: { category } })}
                      style={({ pressed }) => [styles.categoryBox, { backgroundColor: info.background }, pressed && styles.pressed]}
                    >
                      <Text style={[styles.categoryLabel, { color: info.accent }]}>{info.label}</Text>
                      <Text style={styles.categoryCount}>
                        {count === undefined ? '글 수를 불러오지 못했어요' : count > 0 ? `내게 보이는 글 ${count}개` : '아직 맞는 글이 없어요'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** 요일별 미니 막대: 위가 DAY_START, 아래가 DAY_END. 칠한 부분이 공강 */
function FreeTimeBars({ ranges }: { ranges: TimeRange[] }) {
  return (
    <View style={styles.bars} accessible accessibilityLabel={ranges.length ? `공강 ${ranges.map(formatRange).join(', ')}` : '공강 없음'}>
      {WEEKDAY_LABELS.map((day, weekday) => (
        <View key={day} style={styles.barCol}>
          <View style={styles.bar}>
            {ranges
              .filter((r) => r.weekday === weekday)
              .map((r) => {
                const top = ((timeToMinutes(r.start) - DAY_START_MIN) / DAY_LENGTH_MIN) * BAR_HEIGHT;
                const height = ((timeToMinutes(r.end) - timeToMinutes(r.start)) / DAY_LENGTH_MIN) * BAR_HEIGHT;
                return <View key={r.start} style={[styles.barFill, { top, height: Math.max(2, height) }]} />;
              })}
          </View>
          <Text style={styles.barLabel}>{day}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    minHeight: MIN_TOUCH + 8,
  },
  logo: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  gear: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  gearText: { fontSize: 24, color: colors.ink },
  loading: { marginTop: spacing.lg * 2 },
  content: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  greeting: { color: colors.ink, fontSize: fontSize.title, fontWeight: '900' },
  errorBox: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: colors.white },
  errorText: { color: colors.danger, fontSize: fontSize.body },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.md, gap: spacing.md },
  cardTitle: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '700' },
  bars: { flexDirection: 'row', gap: spacing.sm },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
  bar: { width: '100%', maxWidth: 28, height: BAR_HEIGHT, borderRadius: 6, backgroundColor: colors.bg, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, right: 0, backgroundColor: colors.primary },
  barLabel: { color: colors.sub, fontSize: fontSize.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.primaryTint },
  chipText: { color: colors.primary, fontSize: fontSize.caption, fontWeight: '700', fontVariant: ['tabular-nums'] },
  emptyText: { color: colors.sub, fontSize: fontSize.body },
  sectionTitle: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '700', marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryBox: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 96,
    borderRadius: 16,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.8 },
  categoryLabel: { fontSize: 20, fontWeight: '900' },
  categoryCount: { color: colors.ink, fontSize: fontSize.caption },
});
