import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

type Props = {
  size?: number;
  /** 보라 배경 위(타이틀 화면)면 'light', 밝은 배경 위면 'dark' */
  tone?: 'light' | 'dark';
};

/** 공강메이트 로고: 겹친 두 원 (디자인팀 UI) */
export function Logo({ size = 64, tone = 'light' }: Props) {
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const first = tone === 'light' ? colors.white : colors.primary;
  const second = tone === 'light' ? colors.primarySoft : colors.primaryBright;
  return (
    <View style={[styles.wrap, { width: size * 1.6, height: size }]} accessible accessibilityLabel="공강메이트 로고">
      <View style={[styles.circle, circle, { left: 0, backgroundColor: first, opacity: 0.95 }]} />
      <View style={[styles.circle, circle, { left: size * 0.6, backgroundColor: second, opacity: 0.85 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  circle: { position: 'absolute', top: 0 },
});
