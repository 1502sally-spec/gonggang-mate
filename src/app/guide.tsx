/**
 * 첫 사용 가이드 — 담당: A (11/6 결정 10번)
 * - 이 기기에서 앱을 처음 켜면 S01 다음에 한 번 뜬다. 오른쪽 위 '건너뛰기'로 바로 끝낼 수 있다.
 * - 끝나면(건너뛰기 포함) 다시 뜨지 않게 기록하고 S01로 돌아가 원래 흐름(로그인/홈)을 탄다.
 * - 설정(S04) '앱 사용 가이드 다시 보기'로 열면(replay=1) 끝날 때 설정으로 돌아간다.
 * - 슬라이드 그림은 앱 화면 캡처(assets/guide). 화면이 바뀌면 캡처도 다시 찍는다.
 */
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { markGuideSeen } from '@/lib/guide';

const SLIDES = [
  {
    image: require('../../assets/guide/1-free-time.jpg'),
    title: '내 공강부터 칠해 주세요',
    body: '시간표에서 비는 시간을 손가락으로 쓱 칠하면 저장돼요. 이 시간으로 메이트를 찾아 드려요.',
  },
  {
    image: require('../../assets/guide/2-board.jpg'),
    title: '오늘 겹치는 메이트만 보여요',
    body: '식사·카페·공부·산책/운동 게시판에서 오늘 내 공강과 겹치는 글만 골라 보여 줘요. 직접 글을 올려도 돼요.',
  },
  {
    image: require('../../assets/guide/3-chat.jpg'),
    title: '채팅하고 게임으로 정해요',
    body: '마음에 드는 글에 채팅을 요청하고, 메뉴나 장소가 고민되면 채팅방 미니게임으로 정해 보세요.',
  },
  {
    image: require('../../assets/guide/4-appointment.jpg'),
    title: '약속을 확정하면 약속카드로',
    body: '방장이 시간·장소를 확정하면 모두에게 약속카드가 생겨요. 홈의 약속카드에서 언제든 확인해요.',
  },
  {
    image: require('../../assets/guide/5-review.jpg'),
    title: '만난 뒤엔 후기를 남겨요',
    body: '좋았던 점을 3개 이상 고르면 메이트하트가 쌓여요. 하트가 많을수록 믿을 수 있는 메이트예요.',
  },
  {
    image: require('../../assets/guide/6-solo.jpg'),
    title: '혼자여도 괜찮아요',
    body: '혼자놀기 탭에서 학교 근처 식당·카페·놀거리를 지도로 찾아볼 수 있어요.',
  },
] as const;

export default function GuideScreen() {
  const { replay } = useLocalSearchParams<{ replay?: string }>();
  const { width, height } = useWindowDimensions();
  const scroller = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  // 그림 크기: 화면 높이의 절반 정도, 휴대폰 비율(9:19.5) 유지
  const imageHeight = Math.min(height * 0.52, 520);
  const imageWidth = imageHeight * (390 / 844);

  const finish = () => {
    markGuideSeen();
    if (replay === '1' && router.canGoBack()) router.back();
    else router.replace('/');
  };

  const goTo = (next: number) => {
    scroller.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Text style={styles.step}>
          {index + 1} / {SLIDES.length}
        </Text>
        {!isLast ? (
          <Pressable accessibilityRole="button" onPress={finish} hitSlop={10} style={styles.skip}>
            <Text style={styles.skipText}>건너뛰기</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.flex}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={[styles.phone, { width: imageWidth, height: imageHeight }]}>
              <Image source={slide.image} style={styles.image} contentFit="cover" contentPosition="top" accessible={false} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              {slide.title}
            </Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots} accessibilityElementsHidden>
        {SLIDES.map((slide, i) => (
          <View key={slide.title} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
      <View style={styles.footer}>
        <Button label={isLast ? '공강메이트 시작하기' : '다음'} onPress={isLast ? finish : () => goTo(index + 1)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, minHeight: 48 },
  step: { color: colors.sub, fontSize: fontSize.caption + 1, fontWeight: '700', fontVariant: ['tabular-nums'] },
  skip: { paddingVertical: spacing.xs },
  skipText: { color: colors.primary, fontSize: fontSize.body - 1, fontWeight: '800' },
  slide: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  phone: {
    overflow: 'hidden',
    borderRadius: radius.card + 6,
    borderWidth: 6,
    borderColor: colors.ink,
    backgroundColor: colors.white,
    marginBottom: spacing.md,
  },
  image: { width: '100%', height: '100%' },
  title: { color: colors.primary, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.ink, fontSize: fontSize.body, lineHeight: 22, textAlign: 'center', maxWidth: 340 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primarySoft },
  dotOn: { width: 18, backgroundColor: colors.primary },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
