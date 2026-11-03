import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radius, spacing } from '@/constants/theme';

export type Gender = 'male' | 'female';

const OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: '남' },
  { value: 'female', label: '여' },
];

type Props = {
  value: Gender | null;
  onChange: (value: Gender) => void;
  label?: string;
};

/** 성별 선택 (디자인팀 UI: 흰 칸 두 개, 선택하면 보라) — S03 회원가입, S04 설정 */
export function GenderPicker({ value, onChange, label = '성별 *' }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="성별">
        {OPTIONS.map((o) => {
          const on = value === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.value === 'male' ? '남성' : '여성'}
              onPress={() => onChange(o.value)}
              style={[styles.option, on && styles.optionOn]}
            >
              <Text style={[styles.text, on && styles.textOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs + 2 },
  label: { color: colors.primary, fontSize: fontSize.body - 1, fontWeight: '800' },
  row: { flexDirection: 'row', gap: spacing.sm },
  option: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { color: colors.ink, fontSize: fontSize.body, fontWeight: '600' },
  textOn: { color: colors.white, fontWeight: '800' },
});
