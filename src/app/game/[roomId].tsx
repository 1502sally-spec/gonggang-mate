/**
 * S16 게임 — 담당: A (디자인팀 UI 반영: 보라 배너, 게임 카드, '게임 시작' 버튼. 게임은 결정용 5종 유지, 11/3 결정 8번)
 * 채팅방에서 함께 무언가를 정할 때 쓰는 게임 5종 (PRD S16). 결과는 서버가 정하고 모든 참여자가 같은 결과를 본다.
 * 흐름: ① 게임 고르기 → ② 설정(참여자 + 게임별 옵션) → '시작' → ③ 결과
 *       → '다시 하기'(새 결과) 또는 '결과 채팅방에 공유하기'(game_result 메시지) → S12로 돌아감
 * - 참여자: 기본으로 채팅방 전원 체크, 최소 2명
 * - 옵션이 잘못되면 '시작' 비활성 (예: 당첨 인원 ≥ 참여자 수, 돌림판 항목 1개)
 * - 채팅방에는 공유한 결과만 올라간다
 * 일정: 사다리 타기·당첨자 추첨이 P1, 나머지 3종은 같은 틀로 함께 동작 (결과 애니메이션은 디자인 반영 때)
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type GameRunResult, type MiniUser } from '@/api';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { colors, fontSize, MIN_TOUCH, radius, spacing } from '@/constants/theme';
import { describeGameResult, GAME_INFO } from '@/lib/gameResult';
import type { GameType } from '@/types/db';

const GAME_TYPES: GameType[] = ['ladder', 'draw', 'order', 'wheel', 'teams'];

/** 게임 카드 꾸밈 (디자인팀 UI: 색 타일, 태그, 아래 힌트) */
const GAME_CARD: Record<GameType, { tag: string; tile: string; tagColor: string; hint: string }> = {
  ladder: { tag: '짝짓기', tile: '#EDE9FE', tagColor: '#7C3AED', hint: '누가 무엇을 맡을까?' },
  draw: { tag: '뽑기', tile: '#FEF3C7', tagColor: '#D97706', hint: '오늘의 당첨자는?' },
  order: { tag: '순서', tile: '#DCFCE7', tagColor: '#16A34A', hint: '누가 먼저 할까?' },
  wheel: { tag: '뽑기', tile: '#FCE7F3', tagColor: '#DB2777', hint: '메뉴 고르기에 딱' },
  teams: { tag: '팀', tile: '#E0F2FE', tagColor: '#0284C7', hint: '공평하게 팀 나누기' },
};
const WHEEL_MIN = 2;
const WHEEL_MAX = 10;

type Step = 'select' | 'setup' | 'result';

const errorMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [members, setMembers] = useState<MiniUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('select');
  const [type, setType] = useState<GameType>('ladder');

  // 설정
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [ladderItems, setLadderItems] = useState<Record<string, string>>({}); // user_id별 아래 칸 항목
  const [winners, setWinners] = useState(1);
  const [wheelItems, setWheelItems] = useState<string[]>([]);
  const [teams, setTeams] = useState(2);

  // 결과
  const [run, setRun] = useState<GameRunResult | null>(null);
  const [busy, setBusy] = useState<'run' | 'share' | null>(null);

  useEffect(() => {
    let active = true;
    api.rooms
      .getRoom(roomId)
      .then((room) => {
        if (!active) return;
        setMembers(room.members);
        setParticipantIds(room.members.map((m) => m.id));
        setWheelItems(room.members.map((m) => m.nickname).slice(0, WHEEL_MAX));
      })
      .catch((e) => {
        if (active) setLoadError(errorMessage(e, '채팅방 정보를 불러오지 못했어요'));
      });
    return () => {
      active = false;
    };
  }, [roomId]);

  const nameOf = useMemo(() => {
    const map = new Map((members ?? []).map((m) => [m.id, m.nickname]));
    return (id: string) => map.get(id) ?? '알 수 없음';
  }, [members]);

  const participants = (members ?? []).filter((m) => participantIds.includes(m.id));
  const count = participants.length;

  // 게임별 입력 검사 → 잘못되면 '시작' 비활성
  const validation = useMemo((): string | null => {
    if (count < 2) return '참여자를 2명 이상 골라 주세요';
    switch (type) {
      case 'ladder':
        return participants.every((p) => (ladderItems[p.id] ?? '').trim()) ? null : '참여자 수만큼 항목을 모두 입력해 주세요';
      case 'draw':
        return winners >= 1 && winners < count ? null : '당첨 인원은 1명 이상, 참여자 수보다 적어야 해요';
      case 'wheel': {
        const filled = wheelItems.filter((i) => i.trim());
        return filled.length >= WHEEL_MIN && filled.length <= WHEEL_MAX ? null : `항목을 ${WHEEL_MIN}~${WHEEL_MAX}개 입력해 주세요`;
      }
      case 'teams':
        return teams >= 2 && teams <= count ? null : '팀 수는 2 이상, 참여자 수 이하여야 해요';
      default:
        return null;
    }
  }, [type, count, participants, ladderItems, winners, wheelItems, teams]);

  const options = (): Record<string, unknown> => {
    switch (type) {
      case 'ladder':
        return { items: participants.map((p) => ladderItems[p.id].trim()) };
      case 'draw':
        return { winners };
      case 'wheel':
        return { items: wheelItems.map((i) => i.trim()).filter(Boolean) };
      case 'teams':
        return { teams };
      default:
        return {};
    }
  };

  const onStart = async () => {
    if (validation) return;
    setBusy('run');
    try {
      const result = await api.games.runGame(roomId, { type, participant_ids: participantIds, options: options() });
      setRun(result);
      setStep('result');
    } catch (e) {
      Alert.alert(errorMessage(e, '게임을 시작하지 못했어요'));
    } finally {
      setBusy(null);
    }
  };

  const onShare = async () => {
    if (!run) return;
    setBusy('share');
    try {
      await api.games.shareGame(run.id);
      router.back();
    } catch (e) {
      Alert.alert(errorMessage(e, '결과를 공유하지 못했어요'));
    } finally {
      setBusy(null);
    }
  };

  const pickGame = (t: GameType) => {
    setType(t);
    // 인원이 바뀌었을 수 있으니 숫자 옵션을 범위 안으로 맞춘다
    setWinners(1);
    setTeams(2);
    setStep('setup');
  };

  const toggleParticipant = (id: string) =>
    setParticipantIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const goBack = () => {
    if (step === 'result') setStep('setup');
    else if (step === 'setup') setStep('select');
    else router.back();
  };

  const title = step === 'select' ? '' : GAME_INFO[type].label; // 선택 화면은 배너가 제목 역할

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={goBack} style={styles.back} hitSlop={8}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.back} />
      </View>

      {loadError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{loadError}</Text>
          <Button label="돌아가기" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : !members ? (
        <ActivityIndicator style={styles.center} color={colors.primary} accessibilityLabel="불러오는 중" />
      ) : step === 'select' ? (
        <ScrollView contentContainerStyle={styles.selectContent}>
          <View style={styles.banner}>
            <Text style={styles.bannerSmall}>공강메이트와 함께하는</Text>
            <Text style={styles.bannerTitle}>미니게임 한 판 🎮</Text>
            <Text style={styles.bannerSmall}>메이트와 함께 정하고 더 가까워져요</Text>
          </View>
          <View style={styles.cards}>
            <Text style={styles.selectTitle}>게임 선택</Text>
            {GAME_TYPES.map((t) => {
              const card = GAME_CARD[t];
              return (
                <View key={t} style={styles.gameCard}>
                  <View style={styles.gameTop}>
                    <View style={[styles.tile, { backgroundColor: card.tile }]}>
                      <Text style={styles.gameEmoji}>{GAME_INFO[t].emoji}</Text>
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.nameRow}>
                        <Text style={styles.gameName}>{GAME_INFO[t].label}</Text>
                        <View style={[styles.tag, { backgroundColor: card.tagColor }]}>
                          <Text style={styles.tagText}>{card.tag}</Text>
                        </View>
                      </View>
                      <Text style={styles.gameDesc}>{GAME_INFO[t].description}</Text>
                    </View>
                  </View>
                  <View style={styles.gameBottom}>
                    <View style={styles.hintRow}>
                      <Icon name="users" size={14} color={colors.sub} />
                      <Text style={styles.hint}>{card.hint}</Text>
                    </View>
                    <Button label="게임 시작" size="sm" onPress={() => pickGame(t)} />
                  </View>
                </View>
              );
            })}
            <View style={styles.infoBox}>
              <Icon name="info" size={18} color={colors.primaryBright} />
              <View style={styles.flex}>
                <Text style={styles.infoTitle}>결과를 채팅방에 공유할 수 있어요</Text>
                <Text style={styles.infoText}>결과는 서버가 정하고, 모든 메이트에게 같은 결과가 보여요</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : step === 'setup' ? (
        <>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.section}>참여자 ({count}명)</Text>
            <View style={styles.participants}>
              {members.map((m) => {
                const on = participantIds.includes(m.id);
                return (
                  <Pressable
                    key={m.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={m.nickname}
                    onPress={() => toggleParticipant(m.id)}
                    style={[styles.person, on && styles.personOn]}
                  >
                    <Text style={[styles.personText, on && styles.personTextOn]}>
                      {on ? '✓ ' : ''}
                      {m.nickname}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {type === 'ladder' ? (
              <>
                <Text style={styles.section}>아래 칸 항목</Text>
                <Text style={styles.hint}>참여자 수만큼 입력해요. 예: 커피 쏘기, 통과</Text>
                {participants.map((p, i) => (
                  <TextInput
                    key={p.id}
                    value={ladderItems[p.id] ?? ''}
                    onChangeText={(t) => setLadderItems((items) => ({ ...items, [p.id]: t }))}
                    placeholder={`항목 ${i + 1}`}
                    placeholderTextColor={colors.sub}
                    accessibilityLabel={`항목 ${i + 1}`}
                    maxLength={20}
                    style={styles.input}
                  />
                ))}
              </>
            ) : null}

            {type === 'draw' ? (
              <Stepper label="당첨 인원" value={winners} min={1} max={Math.max(1, count - 1)} onChange={setWinners} />
            ) : null}

            {type === 'teams' ? <Stepper label="팀 수" value={teams} min={2} max={Math.max(2, count)} onChange={setTeams} /> : null}

            {type === 'wheel' ? (
              <>
                <Text style={styles.section}>돌림판 항목</Text>
                <Text style={styles.hint}>
                  {WHEEL_MIN}~{WHEEL_MAX}개. 기본값은 참여자 이름이에요. 예: 메뉴 후보
                </Text>
                {wheelItems.map((item, i) => (
                  <View key={i} style={styles.wheelRow}>
                    <TextInput
                      value={item}
                      onChangeText={(t) => setWheelItems((items) => items.map((x, j) => (j === i ? t : x)))}
                      placeholder={`항목 ${i + 1}`}
                      placeholderTextColor={colors.sub}
                      accessibilityLabel={`돌림판 항목 ${i + 1}`}
                      maxLength={20}
                      style={[styles.input, styles.flex]}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`항목 ${i + 1} 삭제`}
                      onPress={() => setWheelItems((items) => items.filter((_, j) => j !== i))}
                      style={styles.remove}
                    >
                      <Text style={styles.removeText}>✕</Text>
                    </Pressable>
                  </View>
                ))}
                {wheelItems.length < WHEEL_MAX ? (
                  <Button label="항목 추가" variant="secondary" onPress={() => setWheelItems((items) => [...items, ''])} />
                ) : null}
              </>
            ) : null}
          </ScrollView>
          <View style={styles.footer}>
            {validation ? <Text style={styles.hintCenter}>{validation}</Text> : null}
            <Button label={busy === 'run' ? '결과 뽑는 중…' : '시작'} onPress={onStart} disabled={!!validation || busy !== null} />
          </View>
        </>
      ) : run ? (
        <>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.resultEmoji}>{GAME_INFO[run.type].emoji}</Text>
            <View style={styles.resultCard} accessibilityLiveRegion="polite">
              {describeGameResult(run.type, run.result, nameOf).map((line) => (
                <Text key={line} style={styles.resultLine}>
                  {line}
                </Text>
              ))}
            </View>
            <Text style={styles.hintCenter}>공유하면 채팅방 모든 메이트에게 같은 결과가 보여요</Text>
          </ScrollView>
          <View style={styles.footer}>
            <Button label={busy === 'share' ? '공유 중…' : '결과 채팅방에 공유하기'} onPress={onShare} disabled={busy !== null} />
            <Button label={busy === 'run' ? '다시 뽑는 중…' : '다시 하기'} variant="secondary" onPress={onStart} disabled={busy !== null} />
          </View>
        </>
      ) : null}
    </SafeAreaView>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.section}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 줄이기`}
          disabled={value <= min}
          onPress={() => onChange(value - 1)}
          style={[styles.stepButton, value <= min && styles.disabled]}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue} accessibilityLabel={`${label} ${value}`}>
          {value}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 늘리기`}
          disabled={value >= max}
          onPress={() => onChange(value + 1)}
          style={[styles.stepButton, value >= max && styles.disabled]}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  back: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  error: { color: colors.danger, fontSize: fontSize.body },
  content: { padding: spacing.lg, gap: spacing.sm },
  guide: { color: colors.sub, fontSize: fontSize.body, marginBottom: spacing.sm },
  selectContent: { paddingBottom: spacing.lg },
  banner: { paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, backgroundColor: colors.primary, alignItems: 'center', gap: 4 },
  bannerSmall: { color: colors.primaryTint, fontSize: fontSize.caption + 1 },
  bannerTitle: { color: colors.white, fontSize: 24, fontWeight: '900' },
  cards: { padding: spacing.lg - 4, gap: spacing.md - 4 },
  selectTitle: { color: colors.primary, fontSize: fontSize.body + 1, fontWeight: '900' },
  gameCard: {
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  gameTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4 },
  tile: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  gameEmoji: { fontSize: 26 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  gameName: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '800' },
  tag: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill },
  tagText: { color: colors.white, fontSize: fontSize.caption - 1, fontWeight: '800' },
  gameDesc: { color: colors.sub, fontSize: fontSize.caption + 1, marginTop: 2 },
  gameBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  infoBox: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md - 2, borderRadius: radius.control, backgroundColor: colors.primaryTint, marginTop: spacing.sm },
  infoTitle: { color: colors.primary, fontSize: fontSize.caption + 1, fontWeight: '800' },
  infoText: { color: colors.primaryBright, fontSize: fontSize.caption },
  section: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700', marginTop: spacing.sm },
  hint: { color: colors.sub, fontSize: fontSize.caption },
  hintCenter: { color: colors.sub, fontSize: fontSize.caption, textAlign: 'center' },
  participants: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  person: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  personOn: { borderColor: colors.primary, backgroundColor: colors.primary },
  personText: { color: colors.ink, fontSize: fontSize.body },
  personTextOn: { color: colors.white, fontWeight: '800' },
  input: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: fontSize.body,
  },
  wheelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  remove: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.sub, fontSize: 18 },
  stepper: { gap: spacing.sm },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  stepText: { color: colors.ink, fontSize: 22 },
  stepValue: { minWidth: 32, textAlign: 'center', color: colors.ink, fontSize: 20, fontWeight: '900' },
  footer: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  resultEmoji: { fontSize: 48, textAlign: 'center', marginTop: spacing.lg },
  resultCard: { padding: spacing.lg, borderRadius: radius.card, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, gap: spacing.sm },
  resultLine: { color: colors.primary, fontSize: 19, fontWeight: '800', textAlign: 'center' },
});
