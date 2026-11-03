/**
 * S08 게시물 작성 — 담당: B
 * PRD: 제목(최대 30자), 약속시간(TimeGrid mode="single-range"), 내용(최대 500자), 사진(최대 5장).
 * '게시' 시 게시물과 채팅방이 함께 생성되고 작성자가 방장이 된다. 게시 후 S07로 돌아간다.
 * 10/31 회의: 매주 반복 없이 1회성 (가장 가까운 해당 요일). 하단에 실제 날짜를 보여 준다.
 * 격자의 옅은 칸 = 내 공강 (highlight). 사진 첨부는 P2 (api/posts.ts TODO), 지금은 없다.
 * 디자인은 나중에 피그마 반영 예정 (지금은 기능 위주).
 */
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError } from '@/api';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { TimeGrid, type TimeRange } from '@/components/TimeGrid';
import { POST_CONTENT_MAX, POST_TITLE_MAX } from '@/constants/config';
import { categoryInfo, colors, fontSize, MIN_TOUCH, radius, spacing, type Category } from '@/constants/theme';
import { formatDateRange, formatDuration, nextOccurrence, totalMinutes } from '@/lib/time';

export default function NewPostScreen() {
  const { category } = useLocalSearchParams<{ category: Category }>();
  const info = categoryInfo[category];
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [range, setRange] = useState<TimeRange[]>([]);
  const [myFree, setMyFree] = useState<TimeRange[]>([]);
  const [posting, setPosting] = useState(false);

  // 내 공강은 미리보기용이라 못 불러와도 작성은 계속할 수 있다
  useEffect(() => {
    api.freeSlots.getMyFreeRanges().then(setMyFree).catch(() => {});
  }, []);

  const dirty = !!title.trim() || !!content.trim() || range.length > 0;

  // 작성 중에 닫으려 하면 확인 (닫기 버튼, 안드로이드 뒤로 키)
  const disablePrevention = usePreventRemove(dirty && !posting, ({ repeat }) => {
    Alert.alert('작성을 그만둘까요?', '입력한 내용은 저장되지 않아요', [
      { text: '계속 작성', style: 'cancel' },
      { text: '그만두기', style: 'destructive', onPress: () => repeat() },
    ]);
  });

  const picked = range[0];
  const canPost = !!info && !!title.trim() && !!content.trim() && !!picked && !posting;

  const onPost = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      await api.posts.createPost({ category, title, content, range: picked });
      disablePrevention();
      router.back();
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '게시물을 올리지 못했어요. 다시 시도해 주세요');
      setPosting(false);
    }
  };

  const when = picked ? nextOccurrence(picked) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} style={styles.close} hitSlop={8}>
            <Icon name="x" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.title}>{info ? `${info.label} 게시물 작성` : '게시물 작성'}</Text>
          <View style={styles.close} />
        </View>

        {/* 입력칸만 스크롤. 격자는 ScrollView 밖에 둔다 (TimeGrid 사용법) */}
        <ScrollView style={styles.form} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <TextField
            label="제목"
            required
            value={title}
            onChangeText={setTitle}
            maxLength={POST_TITLE_MAX}
            showCount
            placeholder="예: 학식 같이 먹어요"
            returnKeyType="next"
          />
          <TextField
            label="내용"
            required
            value={content}
            onChangeText={setContent}
            maxLength={POST_CONTENT_MAX}
            showCount
            multiline
            textAlignVertical="top"
            placeholder="어디서 무엇을 할지 적어 주세요"
          />
        </ScrollView>

        <View style={styles.gridHeader}>
          <Text style={styles.label}>약속시간 *</Text>
          <Text style={styles.guide}>한 요일에서 드래그해서 골라 주세요. 옅은 칸은 내 공강이에요.</Text>
        </View>
        <View style={styles.gridArea} onTouchStart={Keyboard.dismiss}>
          <TimeGrid mode="single-range" value={range} onChange={setRange} highlight={myFree} />
        </View>

        <View style={styles.bottom}>
          <Text style={styles.summary} accessibilityLiveRegion="polite">
            {when ? `${formatDateRange(when.start_at, when.end_at)} · ${formatDuration(totalMinutes(range))}` : '아직 약속시간을 고르지 않았어요'}
          </Text>
          <Button label={posting ? '올리는 중…' : '게시하기'} onPress={onPost} disabled={!canPost} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: colors.primary },
  // 내용이 길어져도 격자 자리를 남겨 둔다
  form: { flexGrow: 0, maxHeight: '35%' },
  formContent: { paddingHorizontal: spacing.lg - 4, paddingBottom: spacing.sm, gap: spacing.md - 2 },
  gridHeader: { paddingHorizontal: spacing.lg - 4, paddingTop: spacing.sm, gap: 2 },
  label: { color: colors.primary, fontSize: fontSize.body - 1, fontWeight: '800' },
  guide: { color: colors.sub, fontSize: fontSize.caption, marginBottom: spacing.xs },
  gridArea: { flex: 1, paddingHorizontal: spacing.sm },
  bottom: { paddingHorizontal: spacing.lg - 4, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  summary: {
    color: colors.primary,
    fontSize: fontSize.body - 1,
    fontWeight: '800',
    textAlign: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.control,
    backgroundColor: colors.primaryTint,
    overflow: 'hidden',
  },
});
