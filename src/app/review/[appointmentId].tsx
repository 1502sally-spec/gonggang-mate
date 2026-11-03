/**
 * S17 후기작성 — 담당: C
 * PRD: 체크 5문항(types/db.ts의 REVIEW_ITEMS). 3개 이상 체크하면 메이트 하트 +1 (HEART_THRESHOLD, 11/3 결정).
 * 11/3 추가: 하트가 적립되면 HeartBurst 효과. 약속 시작 이후부터 작성 가능(약속카드 '완료 및 후기').
 * 하단 '후기 남기기' → S15, 그 아래 '차단' 버튼(PRD 8.2). 신고 기능은 삭제됨(10/31 회의).
 * 메이트가 여러 명이면 저장 후 다음 메이트로 넘어가고, 모두 남기면 S15로 돌아간다.
 * 디자인은 나중에 피그마 반영 예정 (지금은 기능 위주).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { api, ApiError, type AppointmentItem, type ReviewAnswers, type ReviewTarget } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { FormScreen } from '@/components/FormScreen';
import { HEART_BURST_MS, HeartBurst } from '@/components/HeartBurst';
import { HEART_THRESHOLD } from '@/constants/config';
import { colors, fontSize, MIN_TOUCH, spacing } from '@/constants/theme';
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

  const title = appointment?.title ?? '후기작성';
  const subtitle = appointment ? formatDateRange(appointment.start_at, appointment.end_at) : undefined;
  const blocked = !!target && blockedIds.includes(target.id);

  return (
    <FormScreen
      title={title}
      subtitle={subtitle}
      onBack={() => router.back()}
      footer={
        target ? (
          <>
            <Button
              label={target.reviewed ? '이미 후기를 남겼어요' : busy ? '저장 중...' : '후기 남기기'}
              onPress={onSubmit}
              disabled={target.reviewed || busy}
            />
            <Button label={blocked ? '차단했어요' : '차단'} variant="danger" onPress={onBlock} disabled={blocked} />
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
          <View style={styles.mates}>
            {targets.map((mate) => (
              <Pressable
                key={mate.id}
                accessibilityRole="button"
                accessibilityLabel={`${mate.nickname}${mate.reviewed ? ', 후기 완료' : ''}`}
                accessibilityState={{ selected: mate.id === target.id }}
                onPress={() => selectTarget(mate.id)}
                style={[styles.mate, mate.id === target.id && styles.mateSelected]}
              >
                <Avatar nickname={mate.nickname} photoUrl={mate.photo_url} size={44} />
                <Text style={styles.mateName} numberOfLines={1}>
                  {mate.nickname}
                </Text>
                {mate.reviewed ? <Text style={styles.mateDone}>완료</Text> : null}
              </Pressable>
            ))}
          </View>

          <Text style={styles.question}>{target.nickname}님과의 만남은 어땠나요?</Text>

          <View style={styles.items}>
            {REVIEW_ITEMS.map(({ key, label }) => (
              <Pressable
                key={key}
                accessibilityRole="checkbox"
                accessibilityLabel={label}
                accessibilityState={{ checked: answers[key], disabled: target.reviewed }}
                disabled={target.reviewed}
                onPress={() => setAnswers({ ...answers, [key]: !answers[key] })}
                style={styles.item}
              >
                <View style={[styles.box, answers[key] && styles.boxChecked]}>
                  {answers[key] ? <Text style={styles.check}>✓</Text> : null}
                </View>
                <Text style={styles.itemLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.guide, checkedCount >= HEART_THRESHOLD && styles.guideHeart]}>
            {checkedCount >= HEART_THRESHOLD
              ? '메이트 하트 1개가 적립돼요!'
              : `${HEART_THRESHOLD}개 이상 체크하면 메이트 하트 1개가 적립돼요 (${checkedCount}/${REVIEW_ITEMS.length})`}
          </Text>
        </>
      )}
      <HeartBurst visible={heartFor !== null} nickname={heartFor ?? ''} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.sub, fontSize: fontSize.body, textAlign: 'center' },
  mates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mate: { width: 72, alignItems: 'center', gap: 2, padding: spacing.xs, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  mateSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  mateName: { color: colors.ink, fontSize: fontSize.caption },
  mateDone: { color: colors.sub, fontSize: fontSize.caption, fontWeight: '700' },
  question: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700' },
  items: { gap: spacing.xs },
  item: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  box: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: colors.white, fontSize: fontSize.caption + 1, fontWeight: '900' },
  itemLabel: { flex: 1, color: colors.ink, fontSize: fontSize.body },
  guide: { color: colors.sub, fontSize: fontSize.caption + 1 },
  guideHeart: { color: colors.alert, fontWeight: '700' },
});
