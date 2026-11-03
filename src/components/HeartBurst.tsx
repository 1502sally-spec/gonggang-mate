/**
 * 메이트 하트 적립 효과 (11/3 결정): 후기로 하트가 적립되면 화면 가운데에 하트가 커졌다가 사라진다.
 * 동작을 줄이는 설정(접근성)을 켠 사용자에게는 움직임 없이 잠깐 보여 준다.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize } from '@/constants/theme';

type Props = {
  visible: boolean;
  /** 하트를 받은 사람 닉네임 */
  nickname: string;
};

export function HeartBurst({ visible, nickname }: Props) {
  const [scale] = useState(() => new Animated.Value(0.4));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    AccessibilityInfo.announceForAccessibility(`${nickname}님에게 메이트 하트 1개가 적립됐어요`);
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) {
        scale.setValue(1);
        opacity.setValue(1);
        return;
      }
      scale.setValue(0.4);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.delay(800),
          Animated.timing(opacity, { toValue: 0, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [visible, nickname, scale, opacity]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={styles.backdrop} pointerEvents="none">
        <Animated.View style={[styles.card, { opacity, transform: [{ scale }] }]}>
          <Text style={styles.heart}>♥</Text>
          <Text style={styles.text}>{nickname}님에게{'\n'}메이트 하트 +1</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** HeartBurst를 보여 주는 시간 (ms). 이만큼 기다린 뒤 다음 화면으로 넘어간다 */
export const HEART_BURST_MS = 1300;

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 20, borderRadius: 24, backgroundColor: colors.white },
  heart: { color: colors.alert, fontSize: 72, lineHeight: 80 },
  text: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700', textAlign: 'center' },
});
