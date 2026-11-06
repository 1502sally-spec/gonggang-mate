/**
 * 날짜·시간 고르는 한 줄 — 웹 (개발 확인용). 브라우저 기본 <input type="date|time">을 쓴다.
 * 네이티브 설명과 props는 DateTimeField.tsx
 */
import { createElement } from 'react';
import { Text, View } from 'react-native';

import { APPOINTMENT_MINUTE_STEP } from '@/constants/config';
import { colors } from '@/constants/theme';

import { type DateTimeFieldProps, fieldStyles } from './DateTimeField.shared';

const KST_OFFSET_MS = 9 * 60 * 60_000;
const pad = (n: number) => String(n).padStart(2, '0');

/** ms → 한국 시간 'YYYY-MM-DD' / 'HH:MM' */
function toInput(ms: number, mode: 'date' | 'time'): string {
  const k = new Date(ms + KST_OFFSET_MS);
  return mode === 'date'
    ? `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`
    : `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}

/** 입력값 → ms. 날짜만 바꾸면 시각은 그대로, 시각만 바꾸면 날짜는 그대로 */
function fromInput(text: string, mode: 'date' | 'time', current: number): number | null {
  const date = mode === 'date' ? text : toInput(current, 'date');
  const time = mode === 'time' ? text : toInput(current, 'time');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]) - KST_OFFSET_MS;
}

export function DateTimeField({ label, mode, value, onChange, minimumDate, maximumDate }: DateTimeFieldProps) {
  return (
    <View style={fieldStyles.row}>
      <Text style={fieldStyles.label}>{label}</Text>
      {createElement('input', {
        type: mode,
        'aria-label': label,
        value: toInput(value, mode),
        step: mode === 'time' ? APPOINTMENT_MINUTE_STEP * 60 : undefined,
        min: mode === 'date' && minimumDate !== undefined ? toInput(minimumDate, 'date') : undefined,
        max: mode === 'date' && maximumDate !== undefined ? toInput(maximumDate, 'date') : undefined,
        onChange: (e: { target: { value: string } }) => {
          const ms = fromInput(e.target.value, mode, value);
          if (ms !== null) onChange(ms);
        },
        style: webInput,
      })}
    </View>
  );
}

const webInput = {
  flex: 1,
  border: 'none',
  background: 'transparent',
  color: colors.ink,
  fontSize: 15,
  fontWeight: 700,
  fontFamily: 'inherit',
};
