/**
 * 대표 후기 — 많이 받은 후기 항목 상위 3개 (11/6 결정 6번)
 * 설정(S04 내 프로필)과 메이트 정보(S13)가 같이 쓴다. 받은 적 없는 항목(0회)은 넣지 않는다. 누가 남겼는지는 숨긴다.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { MateInfo } from '@/api';
import { Icon } from '@/components/Icon';
import { colors, fontSize, spacing } from '@/constants/theme';
import { REVIEW_ITEMS } from '@/types/db';

export const TOP_REVIEW_COUNT = 3;

export function topReviews(counts: MateInfo['review_counts'] | null | undefined) {
  if (!counts) return [];
  return REVIEW_ITEMS.map((item) => ({ ...item, count: counts[item.key] ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count) // 같은 개수면 REVIEW_ITEMS 순서 (sort는 안정 정렬)
    .slice(0, TOP_REVIEW_COUNT);
}

export function TopReviews({ counts, emptyText }: { counts: MateInfo['review_counts'] | null | undefined; emptyText: string }) {
  const top = topReviews(counts);
  if (top.length === 0) {
    return (
      <View style={styles.row}>
        <Icon name="message-circle" size={18} color={colors.primarySoft} />
        <Text style={styles.muted}>{emptyText}</Text>
      </View>
    );
  }
  return (
    <View style={styles.list}>
      {top.map((item, index) => (
        <View key={item.key} style={styles.row} accessibilityLabel={`대표 후기 ${index + 1}위, ${item.label}, ${item.count}회`}>
          <View style={styles.rank}>
            <Text style={styles.rankText}>{index + 1}</Text>
          </View>
          <Text style={styles.label}>{item.label}</Text>
          <Text style={styles.count}>{item.count}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: colors.primary, fontSize: fontSize.caption, fontWeight: '900' },
  label: { flex: 1, color: colors.ink, fontSize: fontSize.body - 1, fontWeight: '700' },
  count: { color: colors.primary, fontSize: fontSize.body - 1, fontWeight: '800', fontVariant: ['tabular-nums'] },
  muted: { flex: 1, color: colors.sub, fontSize: fontSize.body - 1 },
});
