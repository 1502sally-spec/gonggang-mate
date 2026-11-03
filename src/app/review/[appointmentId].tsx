/**
 * S17 후기작성 — 담당: C
 * PRD: 체크 5문항(types/db.ts의 REVIEW_ITEMS). 3개 이상 체크하면 메이트 하트 +1 (HEART_THRESHOLD, 11/3 결정).
 * 11/3 추가: 하트가 적립되면 HeartBurst 효과. 약속 시작 이후부터 작성 가능(약속카드 '완료 및 후기').
 * 하단 '후기 남기기' → S15, 그 아래 '차단' 버튼(PRD 8.2). 신고 기능은 삭제됨(10/31 회의).
 * 메이트가 여러 명이면 저장 후 다음 메이트로 넘어가고, 모두 남기면 S15로 돌아간다.
 * 디자인팀 UI 반영(11/4, A): '후기 남기기' 제목, 테두리 체크 항목, 메이트하트 상태 카드(3개 이상이면 하트가 채워짐), 후기남기기·차단하기 버튼.
 *   디자인에 없는 메이트 고르기(여러 명일 때)는 둥근 칩으로 둔다.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError, type AppointmentItem, type ReviewAnswers, type ReviewTarget } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FormScreen } from '@/components/FormScreen';
import { HEART_BURST_MS, HeartBurst } from '@/components/HeartBurst';
import { Icon } from '@/components/Icon';
import { HEART_THRESHOLD } from '@/constants/config';
import { colors, fontSize, radius, spacing } from '@/constants/theme';
import { formatDateRange } from '@/lib/time';
import { REVIEW_ITEMS } from '@/types/db';

const EMPTY_ANSWERS = Object.fromEntries(REVIEW_ITEMS.map(({ key }) => [key, false])) as ReviewAnswers;

export default function ReviewScreen() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  const [appointment, setAppointment] = useState<AppointmentItem | null>(null);
  const [targets, setTargets] = useState<ReviewTarget[] | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ReviewAnswers>(EMPTY_ANSWERS);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [heartFor, setHeartFor] = useState<string | null>(null); // 하트 적립 효과를 보여 줄 메이트 닉네임

  useEffect(() => {
    let active = true;
    Promise.all([api.reviews.getReviewTargets(appointmentId), api.appointments.getMyAppointments()])
      .then(([list, mine]) => {
        if (!active) return;
        setTargets(list);
        setTargetId((list.find((t) => !t.reviewed) ?? list[0])?.id ?? null);
        setAppointment([...mine.past, ...mine.upcoming].find((a) => a.id === appointmentId) ?? null);
      })
      .catch((e) => {
        if (!active) return;
        setTargets([]);
        Alert.alert(e instanceof ApiError ? e.message : '메이트 목록을 불러오지 못했어요');
      });
    return () => {
      active = false;
    };
  }, [appointmentId]);

  const target = targets?.find((t) => t.id === targetId) ?? null;
  const checkedCount = REVIEW_ITEMS.filter(({ key }) => answers[key]).length;

  const selectTarget = (id: string) => {
    setTargetId(id);
    setAnswers(EMPTY_ANSWERS);
  };

  const onSubmit = async () => {
    if (!target || !targets) return;
    setBusy(true);
    try {
      const { heart_added } = await api.reviews.submitReview(appointmentId, target.id, answers);
      if (heart_added) {
        setHeartFor(target.nickname);
        await new Promise((resolve) => setTimeout(resolve, HEART_BURST_MS));
        setHeartFor(null);
      }
      const next = targets.map((t) => (t.id === target.id ? { ...t, reviewed: true } : t));
      setTargets(next);
      const remaining = next.find((t) => !t.reviewed);
      if (remaining) selectTarget(remaining.id);
      else router.back();
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '후기를 저장하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const onBlock = () => {
    if (!target) return;
    Alert.alert(`${target.nickname}님을 차단할까요?`, '서로의 글과 메시지가 보이지 않게 돼요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '차단하기',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.blocks.blockUser(target.id);
            setBlockedIds((prev) => [...prev, target.id]);
          } catch (e) {
            Alert.alert(e instanceof ApiError ? e.message : '차단하지 못했어요');
          }
        },
      },
    ]);
  };

  const subtitle = appointment
    ? `${appointment.title} · ${formatDateRange(appointment.start_at, appointment.end_at)}`
    : '만남에 대한 소중한 피드백을 남겨주세요';
  const blocked = !!target && blockedIds.includes(target.id);
  const heartOn = checkedCount >= HEART_THRESHOLD;

  return (
    <FormScreen
      title="후기 남기기"
      subtitle={subtitle}
      onBack={() => router.back()}
      footer={
        target ? (
          <>
            <Button
              label={target.reviewed ? '이미 후기를 남겼어요' : busy ? '저장 중...' : '후기남기기'}
              onPress={onSubmit}
              disabled={target.reviewed || busy}
            />
            <Button label={blocked ? '차단했어요' : '차단하기'} variant="outline" onPress={onBlock} disabled={blocked} />
          </>
        ) : null
      }
    >
      {!targets ? (
        <ActivityIndicator color={colors.primary} />
      ) : !target ? (
        <Text style={styles.empty}>후기를 남길 메이트가 없어요.</Text>
      ) : (
        <>
          {targets.length > 1 ? (
            <View style={styles.mates}>
              {targets.map((mate) => {
                const on = mate.id === target.id;
                return (
                  <Pressable
                    key={mate.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${mate.nickname}${mate.reviewed ? ', 후기 완료' : ''}`}
                    accessibilityState={{ selected: on }}
                    onPress={() => selectTarget(mate.id)}
                    style={[styles.mate, on && styles.mateOn]}
                  >
                    <Avatar nickname={mate.nickname} photoUrl={mate.photo_url} size={28} />
                    <Text style={[styles.mateName, on && styles.mateNameOn]} numberOfLines={1}>
                      {mate.nickname}
                    </Text>
                    {mate.reviewed ? <Icon name="check" size={14} color={on ? colors.white : colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.questionBox}>
            <Text style={styles.question}>어떤 점이 좋았나요?</Text>
            <Text style={styles.questionSub}>{target.nickname}님과의 만남은 어땠나요?</Text>
          </View>

          <View style={styles.items}>
            {REVIEW_ITEMS.map(({ key, label }) => {
              const on = answers[key];
              return (
                <Pressable
                  key={key}
                  accessibilityRole="checkbox"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: on, disabled: target.reviewed }}
                  disabled={target.reviewed}
                  onPress={() => setAnswers({ ...answers, [key]: !on })}
                  style={[styles.item, on && styles.itemOn]}
                >
                  <View style={[styles.box, on && styles.boxOn]}>{on ? <Icon name="check" size={14} color={colors.primary} /> : null}</View>
                  <Text style={[styles.itemLabel, on && styles.itemLabelOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* 메이트하트: 3개 이상 체크하면 자동 적립 (11/3 결정 10번). 직접 누르는 버튼이 아니라 상태 표시 */}
          <Text style={styles.heartTitle}>메이트하트</Text>
          <View style={[styles.heartCard, heartOn && styles.heartCardOn]} accessibilityLiveRegion="polite">
            <Text style={styles.heartGuide}>
              {heartOn
                ? `좋았던 만남이네요! 후기를 남기면 ${target.nickname}님에게 메이트하트가 적립돼요`
                : `${HEART_THRESHOLD}개 이상 체크하면 메이트하트가 적립돼요 (${checkedCount}/${REVIEW_ITEMS.length})`}
            </Text>
            <View style={[styles.heartCircle, heartOn && styles.heartCircleOn]}>
              <Icon name="heart" size={26} color={heartOn ? colors.white : colors.primary} />
            </View>
            <Text style={[styles.heartLabel, heartOn && styles.heartLabelOn]}>{heartOn ? '하트 적립!' : '좋았어요'}</Text>
          </View>
        </>
      )}
      <HeartBurst visible={heartFor !== null} nickname={heartFor ?? ''} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.sub, fontSize: fontSize.body, textAlign: 'center' },
  mates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 12,
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  mateOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  mateName: { maxWidth: 90, color: colors.ink, fontSize: fontSize.body - 1, fontWeight: '700' },
  mateNameOn: { color: colors.white },
  questionBox: { gap: 2 },
  question: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '900' },
  questionSub: { color: colors.sub, fontSize: fontSize.caption + 1 },
  items: { gap: spacing.sm },
  item: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  itemOn: { borderWidth: 2, borderColor: colors.primary },
  box: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primarySoft,
    backgroundColor: colors.bg,
  },
  boxOn: { borderColor: colors.primaryTint, backgroundColor: colors.primaryTint },
  itemLabel: { flex: 1, color: colors.sub, fontSize: fontSize.body - 1 },
  itemLabelOn: { color: colors.ink, fontWeight: '800' },
  heartTitle: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '900', marginBottom: -spacing.xs },
  heartCard: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.control + 2,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  heartCardOn: { borderColor: colors.primarySoft, backgroundColor: colors.primaryTint },
  heartGuide: { color: colors.sub, fontSize: fontSize.caption + 1, textAlign: 'center', lineHeight: 18 },
  heartCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  heartCircleOn: { backgroundColor: colors.alert },
  heartLabel: { color: colors.primary, fontSize: fontSize.caption + 1, fontWeight: '800' },
  heartLabelOn: { color: colors.alert },
});
