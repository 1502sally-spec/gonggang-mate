/** DateTimeField(네이티브·웹)가 같이 쓰는 props와 줄 모양 */
import { StyleSheet } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/constants/theme';

export type DateTimeFieldProps = {
  label: string;
  mode: 'date' | 'time';
  /** 지금 값 (절대 시각 ms) */
  value: number;
  /** 줄에 보여 줄 글자. 예: '11월 7일 (금)', '14:30' */
  display: string;
  onChange: (pickedMs: number) => void;
  minimumDate?: number;
  maximumDate?: number;
};

export const fieldStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  rowOpen: { borderColor: colors.primarySoft },
  pressed: { opacity: 0.7 },
  label: { width: 36, color: colors.sub, fontSize: fontSize.caption + 1, fontWeight: '700' },
  value: { flex: 1, color: colors.ink, fontSize: fontSize.body, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

