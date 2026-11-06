/**
 * 시간 계산 도우미 (화면·서버 공용)
 * - 모든 계산은 한국 시간(KST, UTC+9) 기준. DB에는 UTC ISO 문자열로 저장한다.
 * - 이 파일은 순수 함수만 둔다 (React, Supabase를 import하지 않음).
 */
import { SLOT_MINUTES } from '../constants/config';
import type { TimeRange, TimeString, Timestamp, Weekday } from '../types/db';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

/** '12:30' → 750 */
export function timeToMinutes(time: TimeString): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 750 → '12:30' */
export function minutesToTime(minutes: number): TimeString {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 구간 → 30분 칸 시작 시각 목록. 예: 월 12:00-13:00 → ['12:00', '12:30'] */
export function rangeToSlots(range: TimeRange): TimeString[] {
  const slots: TimeString[] = [];
  for (let t = timeToMinutes(range.start); t < timeToMinutes(range.end); t += SLOT_MINUTES) {
    slots.push(minutesToTime(t));
  }
  return slots;
}

/** 칸 목록 → 연속된 칸을 합친 구간 목록 (요일·시각 순 정렬) */
export function slotsToRanges(slots: { weekday: Weekday; slot_start: TimeString }[]): TimeRange[] {
  const sorted = [...slots].sort(
    (a, b) => a.weekday - b.weekday || timeToMinutes(a.slot_start) - timeToMinutes(b.slot_start),
  );
  const ranges: TimeRange[] = [];
  for (const slot of sorted) {
    const start = timeToMinutes(slot.slot_start);
    const last = ranges[ranges.length - 1];
    if (last && last.weekday === slot.weekday && timeToMinutes(last.end) === start) {
      last.end = minutesToTime(start + SLOT_MINUTES);
    } else if (!last || last.weekday !== slot.weekday || timeToMinutes(last.end) < start) {
      ranges.push({ weekday: slot.weekday, start: slot.slot_start, end: minutesToTime(start + SLOT_MINUTES) });
    }
  }
  return ranges;
}

/** 구간 목록 → 칸 목록 (DB free_slots 저장용) */
export function rangesToSlots(ranges: TimeRange[]): { weekday: Weekday; slot_start: TimeString }[] {
  return ranges.flatMap((r) => rangeToSlots(r).map((slot_start) => ({ weekday: r.weekday, slot_start })));
}

/** target 구간이 ranges와 몇 분 겹치는지 (같은 요일만 계산) */
export function overlapMinutes(target: TimeRange, ranges: TimeRange[]): number {
  const free = new Set(ranges.filter((r) => r.weekday === target.weekday).flatMap(rangeToSlots));
  return rangeToSlots(target).filter((slot) => free.has(slot)).length * SLOT_MINUTES;
}

/** UTC Date → 한국 시간 기준 { weekday(0=월), minutes(0시부터 분) } */
function toKstParts(date: Date): { weekday: Weekday; minutes: number; dayStartUtcMs: number } {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const weekday = ((kst.getUTCDay() + 6) % 7) as Weekday;
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const dayStartUtcMs = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS;
  return { weekday, minutes, dayStartUtcMs };
}

/** 한국 시간 기준 0시부터 지난 분. 예: 12:30 → 750 */
export function kstMinutesOfDay(at: Timestamp): number {
  return toKstParts(new Date(at)).minutes;
}

/** 한국 시간 기준 그날 0시의 UTC 밀리초 */
export function kstDayStartMs(ms: number): number {
  return toKstParts(new Date(ms)).dayStartUtcMs;
}

/** '11월 2일 (월)' */
export function formatDate(at: Timestamp): string {
  const kst = new Date(new Date(at).getTime() + KST_OFFSET_MS);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 (${WEEKDAY_LABELS[toKstParts(new Date(at)).weekday]})`;
}

/**
 * 게시물 약속 날짜 계산 (PRD S08)
 * 선택한 요일의 가장 가까운 다가오는 날짜. 오늘이 그 요일이고 시작 시각이 안 지났으면 오늘, 지났으면 다음 주.
 */
export function nextOccurrence(range: TimeRange, now: Date = new Date()): { start_at: Timestamp; end_at: Timestamp } {
  const today = toKstParts(now);
  let diff = (range.weekday - today.weekday + 7) % 7;
  if (diff === 0 && timeToMinutes(range.start) <= today.minutes) diff = 7;
  const dayStart = today.dayStartUtcMs + diff * DAY_MS;
  return {
    start_at: new Date(dayStart + timeToMinutes(range.start) * 60_000).toISOString(),
    end_at: new Date(dayStart + timeToMinutes(range.end) * 60_000).toISOString(),
  };
}

/** '월 12:00-13:00' */
export function formatRange(range: TimeRange): string {
  return `${WEEKDAY_LABELS[range.weekday]} ${range.start}-${range.end}`;
}

/** '11월 2일 (월) 12:00-13:00' */
export function formatDateRange(startAt: Timestamp, endAt: Timestamp): string {
  const s = new Date(new Date(startAt).getTime() + KST_OFFSET_MS);
  const start = toKstParts(new Date(startAt));
  const end = toKstParts(new Date(endAt));
  return `${s.getUTCMonth() + 1}월 ${s.getUTCDate()}일 (${WEEKDAY_LABELS[start.weekday]}) ${minutesToTime(start.minutes)}-${minutesToTime(end.minutes)}`;
}

/** 약속까지 남은 시간 문구. 예: '30분 전', '2시간 전', '3일 전' */
export function formatTimeLeft(startAt: Timestamp, now: Date = new Date()): string {
  const min = Math.round((new Date(startAt).getTime() - now.getTime()) / 60_000);
  if (min <= 0) return '진행 중';
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / (24 * 60))}일 전`;
}

/** 구간들의 총 길이(분) */
export function totalMinutes(ranges: TimeRange[]): number {
  return ranges.reduce((sum, r) => sum + timeToMinutes(r.end) - timeToMinutes(r.start), 0);
}

/** 270 → '4시간 30분', 60 → '1시간', 30 → '30분' */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  return h ? `${h}시간` : `${m}분`;
}

/** 한국 시간 기준 오늘 요일 (0=월 … 6=일) */
export function kstWeekday(now: Date = new Date()): Weekday {
  return toKstParts(now).weekday;
}
