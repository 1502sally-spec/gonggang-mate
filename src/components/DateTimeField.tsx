/**
 * 날짜·시간 고르는 한 줄 (S14 약속 확정·일정 변경, 11/6 결정 2번)
 * - 안드로이드: 누르면 기기 기본 창이 뜬다. 날짜 = 달력, 시간 = 시계 다이얼 (24시간제)
 * - iOS: 누르면 줄 아래에 펼쳐진다. 날짜 = 달력(inline), 시간 = 휠(5분 단위)
 * - 웹: DateTimeField.web.tsx
 * 시간대는 한국 시간으로 고정한다. 값은 절대 시각(ms)으로 주고받고, 날짜만/시각만 쓰는 일은 쓰는 쪽이 한다.
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { APPOINTMENT_MINUTE_STEP } from '@/constants/config';
import { colors, fontSize, spacing } from '@/constants/theme';

import { type DateTimeFieldProps, fieldStyles } from './DateTimeField.shared';

export type { DateTimeFieldProps };

export const TIME_ZONE = 'Asia/Seoul';

export function DateTimeField({ label, mode, value, display, onChange, minimumDate, maximumDate }: DateTimeFieldProps) {
  const [open, setOpen] = useState(false); // iOS 펼침

  const onPress = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: new Date(value),
        mode,
        display: mode === 'date' ? 'calendar' : 'clock',
        is24Hour: true,
        timeZoneName: TIME_ZONE,
        minimumDate: minimumDate === undefined ? undefined : new Date(minimumDate),
        maximumDate: maximumDate === undefined ? undefined : new Date(maximumDate),
        positiveButton: { label: '확인', textColor: colors.primary },
        negativeButton: { label: '취소', textColor: colors.sub },
        onValueChange: (_event, date) => onChange(date.getTime()),
      });
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} ${display}, 바꾸기`}
        onPress={onPress}
        style={({ pressed }) => [styles.row, open && styles.rowOpen, pressed && styles.pressed]}
      >
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{display}</Text>
        <Icon name={mode === 'date' ? 'calendar' : 'clock'} size={16} color={colors.primary} />
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <View style={styles.inline}>
          <DateTimePicker
            value={new Date(value)}
            mode={mode}
            display={mode === 'date' ? 'inline' : 'spinner'}
            minuteInterval={APPOINTMENT_MINUTE_STEP}
            timeZoneName={TIME_ZONE}
            locale="ko-KR"
            themeVariant="light"
            accentColor={colors.primary}
            minimumDate={minimumDate === undefined ? undefined : new Date(minimumDate)}
            maximumDate={maximumDate === undefined ? undefined : new Date(maximumDate)}
            onValueChange={(_event, date) => {
              onChange(date.getTime());
              if (mode === 'date') setOpen(false); // 날짜는 한 번 누르면 끝
            }}
          />
          {mode === 'time' ? (
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.done} hitSlop={6}>
              <Text style={styles.doneText}>완료</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ...fieldStyles,
  inline: { alignItems: 'center', marginTop: spacing.xs },
  done: { alignSelf: 'flex-end', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  doneText: { color: colors.primary, fontSize: fontSize.body, fontWeight: '800' },
});
