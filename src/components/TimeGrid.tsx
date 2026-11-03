/**
 * 공통 컴포넌트: TimeGrid (요일×시간 격자) — PRD "공통 컴포넌트: TimeGrid"
 *
 * S06 공강 설정(mode="multi")과 S08 게시물 약속시간 설정(mode="single-range")이 함께 쓴다.
 *
 * 쓰는 법
 *   <View style={{ flex: 1 }}>
 *     <TimeGrid mode="multi" value={ranges} onChange={setRanges} />
 *   </View>
 * - 남은 높이에 맞춰 칸 높이를 정한다. 부모를 ScrollView로 감싸지 말고 flex: 1 공간에 둔다.
 * - 드래그와 스크롤이 겹치지 않도록 격자는 항상 한 화면에 맞춘다 (휴대폰 확인 결과, 11/3).
 *   칸 높이가 MIN_ROW_HEIGHT(8px)보다 작아져야 할 만큼 아주 좁을 때만 격자 안에서 세로 스크롤된다.
 *   이때는 칸을 잠깐(0.2초) 눌렀다가 끌어야 칠해지고, 바로 끌면 스크롤된다.
 *
 * 동작
 * - mode="multi": 드래그 시작 칸이 비어 있으면 칠하기, 칠해져 있으면 지우기. 지나가는 칸에 같은 모드 적용.
 *   한 칸만 탭하면 켜기/끄기.
 * - mode="single-range": 드래그를 시작한 요일 열에서 시작 칸~현재 칸을 빈틈없이 선택 (연속 구간 1개).
 *   다른 칸을 새로 누르면 이전 선택은 지워진다. 선택이 한 칸뿐일 때 그 칸을 다시 탭하면 선택 해제.
 * - highlight: 칠하지 않은 칸 중 highlight 구간을 옅은 색으로 표시 (S08에서 내 공강 미리보기).
 * - onChange는 손을 뗄 때 한 번 호출된다. 값은 연속 칸을 합친 TimeRange[].
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import { DAY_END, DAY_START, SLOT_MINUTES, WEEKDAY_COUNT } from '@/constants/config';
import { colors, fontSize, radius } from '@/constants/theme';
import { minutesToTime, rangesToSlots, slotsToRanges, timeToMinutes, WEEKDAY_LABELS } from '@/lib/time';
import type { TimeRange, Weekday } from '@/types/db';

/** 출력 값: 연속된 칸을 하나의 구간으로 합친 결과 (타입 정의는 types/db.ts) */
export type { TimeRange };

export type TimeGridProps = {
  mode: 'multi' | 'single-range';
  value: TimeRange[];
  onChange: (next: TimeRange[]) => void;
  /** 옅게 미리 보여 줄 구간 (S08에서 내 공강 표시용) */
  highlight?: TimeRange[];
};

const DAYS = WEEKDAY_COUNT; // 월~금 (11/3 결정)
const DAY_LABELS = WEEKDAY_LABELS.slice(0, DAYS);
const MIN_ROW_HEIGHT = 8; // 이보다 좁을 때만 스크롤 (보통 휴대폰에서는 스크롤 없이 한 화면에 들어간다)
const MAX_ROW_HEIGHT = 32;
const HEADER_HEIGHT = 40;
const TIME_COL_WIDTH = 48;
const LABEL_OFFSET = 7; // 시간 글자를 줄 위에 걸치게 올리는 정도
const AUTO_SCROLL_EDGE = 32; // 스크롤 모드에서 위·아래 끝 몇 px 안에 손가락이 있으면 자동 스크롤
const AUTO_SCROLL_STEP = 8;

/** 격자의 행 = 칸 시작 시각 목록 (예: ['09:00', '09:30', ...]) */
const ROW_TIMES: string[] = (() => {
  const times: string[] = [];
  for (let t = timeToMinutes(DAY_START); t < timeToMinutes(DAY_END); t += SLOT_MINUTES) times.push(minutesToTime(t));
  return times;
})();
const ROWS = ROW_TIMES.length;

type Cell = { col: number; row: number };

const keyOf = (col: number, row: number) => `${col}-${ROW_TIMES[row]}`;

function toKeySet(ranges: TimeRange[] | undefined): Set<string> {
  const set = new Set<string>();
  // 격자에 없는 요일(주말)은 버린다: 저장하면 월~금만 남는다
  rangesToSlots(ranges ?? []).forEach((s) => {
    if (s.weekday < DAYS) set.add(`${s.weekday}-${s.slot_start}`);
  });
  return set;
}

function toRanges(keys: Set<string>): TimeRange[] {
  return slotsToRanges(
    [...keys].map((k) => {
      const [weekday, slot_start] = k.split('-');
      return { weekday: Number(weekday) as Weekday, slot_start };
    }),
  );
}

/** a → b 사이에 지나가는 칸들 (빠르게 끌어서 칸을 건너뛰어도 빠짐없이 채우기) */
function cellsBetween(a: Cell, b: Cell): Cell[] {
  const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
  const cells: Cell[] = [];
  for (let i = 1; i <= steps; i += 1) {
    cells.push({
      col: Math.round(a.col + ((b.col - a.col) * i) / steps),
      row: Math.round(a.row + ((b.row - a.row) * i) / steps),
    });
  }
  return cells;
}

export function TimeGrid({ mode, value, onChange, highlight }: TimeGridProps) {
  const [selected, setSelected] = useState<Set<string>>(() => toKeySet(value));
  const highlightKeys = useMemo(() => toKeySet(highlight), [highlight]);

  // 부모가 value를 바꾸면(불러오기 등) 화면에 반영. 드래그 중에는 건드리지 않는다.
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setSelected(toKeySet(value));
  }, [value]);

  // ── 크기 계산 ──
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };
  const colWidth = Math.max(0, (size.width - TIME_COL_WIDTH) / DAYS);
  const fitRowHeight = (size.height - HEADER_HEIGHT - LABEL_OFFSET) / ROWS;
  // 높이를 모르면(부모가 높이를 안 줌) 기본 20px로 그린다
  const rowHeight = size.height > 0 ? Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, fitRowHeight)) : 20;
  const scrollMode = size.height > 0 && fitRowHeight < MIN_ROW_HEIGHT;

  // ── 드래그 상태 (렌더링과 무관한 값은 ref) ──
  const drag = useRef<{
    paint: boolean; // true = 칠하기, false = 지우기
    start: Cell;
    last: Cell;
    base: Set<string>; // 드래그 시작 전 선택
    working: Set<string>;
  } | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const lastTouchY = useRef(0);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);

  const cellAt = useCallback(
    (x: number, y: number): Cell => ({
      col: Math.min(DAYS - 1, Math.max(0, Math.floor(x / (colWidth || 1)))),
      row: Math.min(ROWS - 1, Math.max(0, Math.floor(y / rowHeight))),
    }),
    [colWidth, rowHeight],
  );

  /** 현재 드래그 상태로 선택 칸 계산 */
  const applyTo = useCallback(
    (cell: Cell) => {
      const d = drag.current;
      if (!d) return;
      if (mode === 'single-range') {
        const col = d.start.col;
        const [from, to] = [Math.min(d.start.row, cell.row), Math.max(d.start.row, cell.row)];
        const next = new Set<string>();
        for (let r = from; r <= to; r += 1) next.add(keyOf(col, r));
        d.working = next;
      } else {
        const path = [d.last, ...cellsBetween(d.last, cell)];
        path.forEach((c) => (d.paint ? d.working.add(keyOf(c.col, c.row)) : d.working.delete(keyOf(c.col, c.row))));
      }
      d.last = cell;
      setSelected(new Set(d.working));
    },
    [mode],
  );

  const stopAutoScroll = () => {
    if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    autoScrollTimer.current = null;
  };

  const onDragStart = (x: number, y: number) => {
    const cell = cellAt(x, y);
    const key = keyOf(cell.col, cell.row);
    const base = new Set(selected);
    dragging.current = true;
    if (scrollMode) setScrollLocked(true);
    lastTouchY.current = y;

    if (mode === 'single-range') {
      // 한 칸만 선택된 상태에서 그 칸을 다시 누르면 해제 (손을 뗄 때 판단)
      drag.current = { paint: true, start: cell, last: cell, base, working: new Set() };
      applyTo(cell);
      return;
    }
    const paint = !base.has(key);
    const working = new Set(base);
    if (paint) working.add(key);
    else working.delete(key);
    drag.current = { paint, start: cell, last: cell, base, working };
    setSelected(new Set(working));
  };

  const onDragMove = (x: number, y: number) => {
    if (!drag.current) return;
    lastTouchY.current = y;
    const cell = cellAt(x, y);
    if (cell.col !== drag.current.last.col || cell.row !== drag.current.last.row) applyTo(cell);

    if (!scrollMode) return;
    // 스크롤 모드: 화면 위·아래 끝에 닿으면 자동 스크롤
    const viewportY = y - scrollY.current;
    const viewportH = size.height - HEADER_HEIGHT;
    const direction = viewportY < AUTO_SCROLL_EDGE ? -1 : viewportY > viewportH - AUTO_SCROLL_EDGE ? 1 : 0;
    stopAutoScroll();
    if (direction !== 0) {
      autoScrollTimer.current = setInterval(() => {
        const maxScroll = ROWS * rowHeight + LABEL_OFFSET - viewportH;
        const nextY = Math.min(maxScroll, Math.max(0, scrollY.current + direction * AUTO_SCROLL_STEP));
        if (nextY === scrollY.current) return;
        const delta = nextY - scrollY.current;
        scrollY.current = nextY;
        scrollRef.current?.scrollTo({ y: nextY, animated: false });
        lastTouchY.current += delta;
        if (drag.current) applyTo(cellAt(x, lastTouchY.current));
      }, 16);
    }
  };

  const onDragEnd = () => {
    stopAutoScroll();
    setScrollLocked(false);
    const d = drag.current;
    drag.current = null;
    dragging.current = false;
    if (!d) return;
    let result = d.working;
    if (mode === 'single-range') {
      const tappedOnly = d.start.col === d.last.col && d.start.row === d.last.row;
      const startKey = keyOf(d.start.col, d.start.row);
      if (tappedOnly && d.base.size === 1 && d.base.has(startKey)) result = new Set();
    }
    setSelected(new Set(result));
    onChange(toRanges(result));
  };

  const pan = usePanGesture({
    runOnJS: true,
    // 스크롤 모드에서는 0.2초 누른 뒤에만 칠하기가 시작되고, 그 전에 움직이면 스크롤로 넘어간다
    minDistance: scrollMode ? undefined : 0,
    activateAfterLongPress: scrollMode ? 200 : undefined,
    // 일반 모드: 손가락이 닿자마자 시작 (탭만 해도 켜기/끄기)
    // 스크롤 모드: 0.2초 누른 뒤 활성화될 때 시작 (바로 끌면 스크롤)
    onBegin: (e) => {
      if (!scrollMode) onDragStart(e.x, e.y);
    },
    onActivate: (e) => {
      if (scrollMode) onDragStart(e.x, e.y);
    },
    onUpdate: (e) => {
      if ('x' in e) onDragMove(e.x, e.y);
    },
    onFinalize: () => onDragEnd(),
  });

  useEffect(() => stopAutoScroll, []);

  /** 스크린리더용: 칸 하나 켜기/끄기 */
  const toggleForAccessibility = (col: number, row: number) => {
    const key = keyOf(col, row);
    const next = mode === 'single-range' ? new Set<string>() : new Set(selected);
    if (selected.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
    onChange(toRanges(next));
  };

  const gridHeight = ROWS * rowHeight;

  const grid = (
    <View style={[styles.body, { height: gridHeight + LABEL_OFFSET }]}>
      {/* 왼쪽 시간 열: 정시에만 표시 */}
      <View style={{ width: TIME_COL_WIDTH }}>
        {ROW_TIMES.map((time, row) =>
          time.endsWith(':00') ? (
            <Text key={time} style={[styles.timeLabel, { top: row * rowHeight }]}>
              {time}
            </Text>
          ) : null,
        )}
      </View>

      <GestureDetector gesture={pan}>
        <View style={[styles.cells, { height: gridHeight, marginTop: LABEL_OFFSET }]}>
          {ROW_TIMES.map((time, row) => {
            const nextIsHour = ROW_TIMES[row + 1]?.endsWith(':00') ?? true;
            return (
              <View key={time} style={[styles.row, { height: rowHeight }]}>
                {DAY_LABELS.map((day, col) => {
                  const key = keyOf(col, row);
                  const isOn = selected.has(key);
                  const isHighlight = !isOn && highlightKeys.has(key);
                  return (
                    <View
                      key={key}
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel={`${day}요일 ${time}`}
                      accessibilityState={{ selected: isOn }}
                      onAccessibilityTap={() => toggleForAccessibility(col, row)}
                      style={[
                        styles.cell,
                        { borderBottomColor: nextIsHour ? colors.line : colors.lineSoft },
                        isHighlight && styles.highlight,
                        isOn && styles.on,
                      ]}
                    />
                  );
                })}
              </View>
            );
          })}
        </View>
      </GestureDetector>
    </View>
  );

  return (
    <View style={styles.root} onLayout={onLayout}>
      {/* 요일 머리글 */}
      <View style={[styles.header, { height: HEADER_HEIGHT }]}>
        <Text style={styles.timeHead}>시간</Text>
        {DAY_LABELS.map((day) => (
          <View key={day} style={styles.dayCell}>
            <Text style={styles.dayChip}>{day}</Text>
          </View>
        ))}
      </View>

      {scrollMode ? (
        <ScrollView
          ref={scrollRef}
          scrollEnabled={!scrollLocked}
          onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {grid}
        </ScrollView>
      ) : (
        grid
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  timeHead: { width: TIME_COL_WIDTH, color: colors.sub, fontSize: fontSize.caption, textAlign: 'center' },
  dayCell: { flex: 1, alignItems: 'center' },
  dayChip: {
    minWidth: 36,
    paddingVertical: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: colors.primaryTint,
    color: colors.primary,
    fontSize: fontSize.caption + 1,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: { flexDirection: 'row' },
  timeLabel: {
    position: 'absolute',
    right: 8,
    color: colors.sub,
    fontSize: fontSize.caption,
    fontVariant: ['tabular-nums'],
  },
  cells: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  row: { flexDirection: 'row' },
  cell: {
    flex: 1,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
  },
  highlight: { backgroundColor: colors.primaryTint },
  on: { backgroundColor: colors.primaryBright, borderBottomColor: colors.primaryBright, borderRightColor: colors.primaryBright },
});
