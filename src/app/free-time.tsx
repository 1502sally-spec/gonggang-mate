/**
 * S06 공강 설정 — 담당: A (디자인팀 UI 반영)
 * PRD: TimeGrid(mode="multi")로 매주 반복되는 공강을 칠한다. 한 칸 = 30분. 월~금 (11/3 결정).
 * - '공강 시간 저장' 시 저장 후 S05로 돌아간다. '취소'는 저장하지 않고 돌아간다.
 * - 저장하지 않고 나가면 "변경 사항을 저장하지 않을까요?" 확인.
 * - 아래 '입력한 공강 시간' 목록: 요일별 구간 (24시간제)
 */
import { router, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api';
import { Button } from '@/components/Button';
import { TimeGrid, type TimeRange } from '@/components/TimeGrid';
import { WEEKDAY_COUNT } from '@/constants/config';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { formatDuration, totalMinutes, WEEKDAY_LABELS } from '@/lib/time';

export default function FreeTimeScreen() {
  const [ranges, setRanges] = useState<TimeRange[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.freeSlots
      .getMyFreeRanges()
      // 월~금만 다룬다 (11/3 결정). 예전에 저장된 주말 공강은 보이지 않고, 저장하면 빠진다
      .then((list) => setRanges(list.filter((r) => r.weekday < WEEKDAY_COUNT)))
      .catch((e) => Alert.alert(e instanceof ApiError ? e.message : '공강을 불러오지 못했어요'))
      .finally(() => setLoading(false));
  }, []);

  // 저장하지 않고 나가려 하면 확인 (취소 버튼, 안드로이드 뒤로 키, 밀어서 뒤로가기 모두)
  const disablePrevention = usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert('변경 사항을 저장하지 않을까요?', undefined, [
      { text: '계속 편집', style: 'cancel' },
      {
        text: '저장 안 함',
        style: 'destructive',
        onPress: () => {
          setDirty(false);
          repeat();
        },
      },
    ]);
  });

  const onChange = (next: TimeRange[]) => {
    setRanges(next);
    setDirty(true);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await api.freeSlots.saveMyFreeRanges(ranges);
      setDirty(false);
      disablePrevention();
      goBack();
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '저장하지 못했어요. 다시 시도해 주세요');
    } finally {
      setSaving(false);
    }
  };

  const total = totalMinutes(ranges);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          공강 시간 설정
        </Text>
        <View style={styles.guideBox}>
          <Text style={styles.guide}>
            원하는 시간 범위를 <Text style={styles.guideStrong}>길게 눌러서 드래그</Text>해 공강 시간을 입력하세요. 한 칸은 30분 단위이고,
            이미 입력한 구간은 <Text style={styles.guideStrong}>다시 눌러 드래그</Text>하면 선택을 취소할 수 있어요.
          </Text>
        </View>
      </View>

      <View style={styles.gridArea}>
        {loading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : <TimeGrid mode="multi" value={ranges} onChange={onChange} />}
      </View>

      <View style={styles.bottom}>
        <View style={styles.listCard}>
          <View style={styles.listHead}>
            <Text style={styles.listTitle}>입력한 공강 시간</Text>
            {total > 0 ? <Text style={styles.total}>총 {formatDuration(total)}</Text> : null}
          </View>
          {ranges.length === 0 ? (
            <Text style={styles.empty}>아직 입력한 공강 시간이 없어요</Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} nestedScrollEnabled>
              {ranges.map((r) => (
                <View key={`${r.weekday}-${r.start}`} style={styles.row}>
                  <Text style={styles.rowDay}>{WEEKDAY_LABELS[r.weekday]}요일</Text>
                  <Text style={styles.rowTime}>
                    {r.start} ~ {r.end}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
        <Button label={saving ? '저장 중…' : '공강 시간 저장'} variant="bright" onPress={onSave} disabled={loading || saving} />
        <Button label="취소" variant="outline" size="sm" onPress={goBack} disabled={saving} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: spacing.lg - 4, paddingTop: spacing.md, gap: spacing.sm },
  title: { color: colors.primary, fontSize: fontSize.title + 2, fontWeight: '900' },
  guideBox: { padding: spacing.md - 4, borderRadius: radius.control, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  guide: { color: colors.sub, fontSize: fontSize.caption, lineHeight: 17 },
  guideStrong: { color: colors.primary, fontWeight: '800' },
  gridArea: { flex: 1, marginTop: spacing.sm, marginHorizontal: spacing.sm },
  loading: { marginTop: spacing.lg },
  bottom: { paddingHorizontal: spacing.lg - 4, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  listCard: {
    padding: spacing.md - 4,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    gap: spacing.sm,
  },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listTitle: { color: colors.primary, fontSize: fontSize.body - 1, fontWeight: '800' },
  total: { color: colors.primaryBright, fontSize: fontSize.caption + 1, fontWeight: '700' },
  empty: { color: colors.sub, fontSize: fontSize.caption + 1 },
  list: { maxHeight: 76 },
  listContent: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md - 4,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.bg,
  },
  rowDay: { color: colors.ink, fontSize: fontSize.body - 1, fontWeight: '700' },
  rowTime: { color: colors.sub, fontSize: fontSize.body - 1, fontVariant: ['tabular-nums'] },
});
