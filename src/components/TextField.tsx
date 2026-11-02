import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, type TextInputInstance, type TextInputProps, View } from 'react-native';

import { colors, fontSize, MIN_TOUCH, spacing } from '@/constants/theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  /** 입력칸 아래 빨간 안내 문구 */
  error?: string | null;
  /** 입력칸 아래 회색 안내 문구 (error가 있으면 error가 우선) */
  hint?: string | null;
  /** maxLength가 있을 때 '12/40'처럼 글자 수 표시 */
  showCount?: boolean;
  /** 입력칸 오른쪽에 붙일 버튼 등 */
  right?: React.ReactNode;
};

/** 공통 입력칸 (라벨 + 입력 + 안내 문구). 로그인·가입·프로필 등에서 쓴다. */
export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, error, hint, showCount, right, maxLength, value, editable = true, ...rest },
  ref,
) {
  const message = error || hint;
  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {showCount && maxLength ? (
          <Text style={styles.count}>
            {(value ?? '').length}/{maxLength}
          </Text>
        ) : null}
      </View>
      <View style={styles.inputRow}>
        <TextInput
          ref={ref}
          value={value}
          maxLength={maxLength}
          editable={editable}
          accessibilityLabel={label}
          placeholderTextColor={colors.sub}
          style={[styles.input, !editable && styles.disabled, !!error && styles.inputError]}
          {...rest}
        />
        {right}
      </View>
      {message ? <Text style={[styles.message, !!error && styles.errorText]}>{message}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.ink, fontSize: fontSize.caption + 1, fontWeight: '700' },
  count: { color: colors.sub, fontSize: fontSize.caption },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: fontSize.body,
  },
  disabled: { backgroundColor: colors.bg, color: colors.sub },
  inputError: { borderColor: colors.danger },
  message: { color: colors.sub, fontSize: fontSize.caption },
  errorText: { color: colors.danger },
});
