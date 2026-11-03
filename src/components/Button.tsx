import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSize, MIN_TOUCH, radius, spacing } from '@/constants/theme';

type Props = {
  label: string;
  onPress?: () => void;
  /**
   * primary: 짙은 보라 버튼 (주요 동작)
   * bright: 밝은 보라 버튼 (공강 저장 등)
   * secondary: 연보라 버튼 (보조 동작: 일정 변경, 채팅방 가기 등)
   * outline: 흰 바탕 + 보라 테두리 (차단하기, 취소 등)
   * danger: 흰 바탕 + 빨간 테두리 (약속 취소 등 되돌리기 어려운 동작)
   * muted: 회색 버튼 (약속카드의 '취소' 등 덜 강조할 동작)
   */
  variant?: 'primary' | 'bright' | 'secondary' | 'outline' | 'danger' | 'muted';
  /** 작은 버튼 (카드 안 '게임 시작', '인증요청' 등) */
  size?: 'md' | 'sm';
  disabled?: boolean;
};

/** 공통 버튼. 화면에서 버튼이 필요하면 이걸 쓴다. */
export function Button({ label, onPress, variant = 'primary', size = 'md', disabled = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, size === 'sm' && styles.smLabel, labelStyles[variant]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.md, borderRadius: 12 },
  primary: { backgroundColor: colors.primary },
  bright: { backgroundColor: colors.primaryBright },
  secondary: { backgroundColor: colors.primaryTint },
  outline: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primary },
  danger: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.danger },
  muted: { backgroundColor: '#E5E7EB' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  label: { fontSize: fontSize.body + 1, fontWeight: '700' },
  smLabel: { fontSize: fontSize.body - 1 },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.white },
  bright: { color: colors.white },
  secondary: { color: colors.primary },
  outline: { color: colors.primary },
  danger: { color: colors.danger },
  muted: { color: colors.ink },
});
