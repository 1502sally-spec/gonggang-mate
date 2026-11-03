import { forwardRef, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, type TextInputInstance, type TextInputProps, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/constants/theme';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  /** 필수 항목이면 라벨 뒤에 * 표시 */
  required?: boolean;
  /** 입력칸 아래 빨간 안내 문구 */
  error?: string | null;
  /** 입력칸 아래 회색 안내 문구 (error가 있으면 error가 우선) */
  hint?: string | null;
  /** maxLength가 있을 때 '12/40'처럼 글자 수 표시 */
  showCount?: boolean;
  /** 입력칸 바깥 오른쪽에 붙일 버튼 (예: 인증요청) */
  right?: ReactNode;
  /** 입력칸 안쪽 오른쪽에 넣을 작은 버튼 (예: 중복 확인) */
  inside?: ReactNode;
  /** 라벨을 입력칸 왼쪽에 두는 모양 (설정 화면 카드) */
  inlineLabel?: boolean;
};

/** 공통 입력칸 (라벨 + 입력 + 안내 문구). 디자인팀 UI: 보라 라벨, 흰 바탕 둥근 칸 */
export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, required, error, hint, showCount, right, inside, inlineLabel, maxLength, value, editable = true, ...rest },
  ref,
) {
  const message = error || hint;
  const labelText = (
    <Text style={[styles.label, inlineLabel && styles.inlineLabel]}>
      {label}
      {required ? ' *' : ''}
    </Text>
  );
  const input = (
    <View style={[styles.box, !editable && styles.disabled, !!error && styles.boxError, inlineLabel && styles.boxInline]}>
      <TextInput
        ref={ref}
        value={value}
        maxLength={maxLength}
        editable={editable}
        accessibilityLabel={label}
        placeholderTextColor={colors.sub}
        style={[styles.input, !editable && styles.inputDisabled]}
        {...rest}
      />
      {inside}
    </View>
  );

  return (
    <View style={styles.wrap}>
      {inlineLabel ? (
        <View style={styles.inlineRow}>
          {labelText}
          {input}
        </View>
      ) : (
        <>
          <View style={styles.labelRow}>
            {labelText}
            {showCount && maxLength ? (
              <Text style={styles.count}>
                {(value ?? '').length}/{maxLength}
              </Text>
            ) : null}
          </View>
          <View style={styles.inputRow}>
            {input}
            {right}
          </View>
        </>
      )}
      {message ? <Text style={[styles.message, !!error && styles.errorText]}>{message}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs + 2 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  label: { color: colors.primary, fontSize: fontSize.body - 1, fontWeight: '800' },
  inlineLabel: { width: 64 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: { color: colors.sub, fontSize: fontSize.caption },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  box: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.control,
    backgroundColor: colors.white,
  },
  boxInline: { minHeight: 42, backgroundColor: colors.bg, borderRadius: 10 },
  input: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, minHeight: 42, paddingHorizontal: spacing.md, color: colors.ink, fontSize: fontSize.body },
  disabled: { backgroundColor: colors.bg },
  inputDisabled: { color: colors.sub },
  boxError: { borderColor: colors.danger },
  message: { color: colors.sub, fontSize: fontSize.caption },
  errorText: { color: colors.danger },
});
