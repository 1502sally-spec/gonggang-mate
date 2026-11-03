/**
 * S14 약속 확정 — 채팅방(S12)에서 방장이 '약속 확정'을 누르면 뜬다.
 * 디자인팀 UI 반영(11/4, A): 아래 팝업 대신 전체 화면 카드 (시간·장소·활동, 아이콘 원, 위쪽 보라 띠), 오른쪽 아래 '확정'.
 * 디자인에 없는 참여 메이트, 종료 시각, 취소 버튼은 같은 카드 형식으로 넣었다. 쓰는 쪽 입력값은 그대로다.
 * 게시물 내용으로 미리 채우고 방장이 고칠 수 있다. 장소가 비면 '확정' 비활성.
 * 시간은 격자(S08)와 같은 30분 단위로 고른다.
 * 11/3 추가: appointment를 넘기면 '일정 변경' 모드 (S15, 방장만). 지금 약속 내용으로 채우고 '변경'을 누르면 updateAppointment
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type AppointmentItem, type RoomDetail } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Icon, type IconName } from '@/components/Icon';
import { DAY_END, DAY_START, SLOT_MINUTES } from '@/constants/config';
import { categoryInfo, colors, fontSize, radius, spacing } from '@/constants/theme';
import { formatDate, kstMinutesOfDay, minutesToTime, timeToMinutes } from '@/lib/time';

const SLOT_MS = SLOT_MINUTES * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const TEXT_MAX = 50;

type Props = {
  visible: boolean;
  roomId: string;
  onClose: () => void;
  /** 확정(또는 일정 변경)이 끝난 뒤 불린다. 팝업을 닫고 약속카드로 이동하는 일은 쓰는 쪽에서 한다 */
  onConfirmed: (appointment: AppointmentItem) => void;
  /** 선택: 넘기면 '일정 변경' 모드 (11/3 결정, S15 방장만) */
  appointment?: AppointmentItem | null;
};

export function ConfirmAppointmentPopup({ visible, roomId, onClose, onConfirmed, appointment = null }: Props) {
  const isEdit = appointment !== null;
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(0);
  const [place, setPlace] = useState('');
  const [activity, setActivity] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0); // 팝업을 연 시각. 지난 시간인지 판단용 (서버에서도 다시 확인)

  useEffect(() => {
    if (!visible) return;
    let active = true;
    api.rooms
      .getRoom(roomId)
      .then((detail) => {
        if (!active) return;
        if (!detail.post) {
          // 1:1 방은 약속 확정이 없다 (11/3 결정)
          Alert.alert('1:1 채팅방에서는 약속을 확정할 수 없어요');
          onClose();
          return;
        }
        setRoom(detail);
        setNow(Date.now());
        if (appointment) {
          setStartMs(new Date(appointment.start_at).getTime());
          setEndMs(new Date(appointment.end_at).getTime());
          setPlace(appointment.place);
          setActivity(appointment.activity);
        } else {
          setStartMs(new Date(detail.post.start_at).getTime());
          setEndMs(new Date(detail.post.end_at).getTime());
          setPlace('');
          setActivity(`${categoryInfo[detail.post.category].label} ${detail.post.title}`.slice(0, TEXT_MAX));
        }
      })
      .catch((e) => {
        if (!active) return;
        Alert.alert(e instanceof ApiError ? e.message : '채팅방을 불러오지 못했어요');
        onClose();
      });
    return () => {
      active = false;
      setRoom(null); // 다시 열 때 지난 내용이 보이지 않게
    };
  }, [visible, roomId, onClose, appointment]);

  const startMinutes = kstMinutesOfDay(new Date(startMs).toISOString());
  const endMinutes = kstMinutesOfDay(new Date(endMs).toISOString());
  const isPast = startMs <= now;

  const moveStart = (direction: 1 | -1) => {
    const next = startMs + direction * SLOT_MS;
    setStartMs(next);
    if (next >= endMs) setEndMs(next + SLOT_MS);
  };

  const moveDate = (direction: 1 | -1) => {
    setStartMs(startMs + direction * DAY_MS);
    setEndMs(endMs + direction * DAY_MS);
  };

  const onSubmit = async () => {
    setBusy(true);
    try {
      const input = { start_at: new Date(startMs).toISOString(), end_at: new Date(endMs).toISOString(), place, activity };
      const result = appointment
        ? await api.appointments.updateAppointment(appointment.id, input)
        : await api.appointments.confirmAppointment(roomId, input);
      onConfirmed(result);
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : isEdit ? '일정을 바꾸지 못했어요' : '약속을 확정하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.topBar}>
              <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={onClose} style={styles.back} hitSlop={8}>
                <Icon name="arrow-left" size={24} color={colors.ink} />
              </Pressable>
              <Text style={styles.title} accessibilityRole="header">
                {isEdit ? '일정 변경' : '약속 확정'}
              </Text>
              <View style={styles.back} />
            </View>

            {!room ? (
              <ActivityIndicator color={colors.primary} style={styles.loading} />
            ) : (
              <>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                  <View style={styles.card}>
                    <View style={styles.cardBar} />

                    <Section icon="clock" label="시간">
                      <View style={styles.valueBox}>
                        <Text style={styles.valueDate}>{formatDate(new Date(startMs).toISOString())}</Text>
                        <Text style={styles.valueTime}>
                          {minutesToTime(startMinutes)} ~ {minutesToTime(endMinutes)}
                        </Text>
                      </View>
                      <View style={styles.steppers}>
                        <Stepper
                          label="날짜"
                          value={formatDate(new Date(startMs).toISOString())}
                          onPrev={() => moveDate(-1)}
                          onNext={() => moveDate(1)}
                          prevDisabled={startMs - DAY_MS <= now}
                        />
                        <Stepper
                          label="시작"
                          value={minutesToTime(startMinutes)}
                          onPrev={() => moveStart(-1)}
                          onNext={() => moveStart(1)}
                          prevDisabled={startMinutes - SLOT_MINUTES < timeToMinutes(DAY_START)}
                          nextDisabled={startMinutes + 2 * SLOT_MINUTES > timeToMinutes(DAY_END)}
                        />
                        <Stepper
                          label="종료"
                          value={minutesToTime(endMinutes)}
                          onPrev={() => setEndMs(endMs - SLOT_MS)}
                          onNext={() => setEndMs(endMs + SLOT_MS)}
                          prevDisabled={endMs - SLOT_MS <= startMs}
                          nextDisabled={endMinutes + SLOT_MINUTES > timeToMinutes(DAY_END)}
                        />
                      </View>
                      {isPast ? <Text style={styles.error}>이미 지난 시간이에요. 날짜나 시간을 바꿔 주세요.</Text> : null}
                    </Section>

                    <View style={styles.divider} />
                    <Section icon="map-pin" label="장소">
                      <TextInput
                        value={place}
                        onChangeText={setPlace}
                        maxLength={TEXT_MAX}
                        placeholder="예: 중대 정문"
                        placeholderTextColor={colors.sub}
                        accessibilityLabel="장소"
                        style={styles.input}
                      />
                    </Section>

                    <View style={styles.divider} />
                    <Section icon="star" label="활동">
                      <TextInput
                        value={activity}
                        onChangeText={setActivity}
                        maxLength={TEXT_MAX}
                        placeholder="예: 카페 투어 + 공원 산책"
                        placeholderTextColor={colors.sub}
                        accessibilityLabel="활동"
                        style={styles.input}
                      />
                    </Section>

                    <View style={styles.divider} />
                    <Section icon="users" label={`참여 메이트 ${room.members.length}명`}>
                      <View style={styles.memberRow}>
                        {room.members.map((member) => (
                          <View key={member.id} style={styles.member}>
                            <Avatar nickname={member.nickname} photoUrl={member.photo_url} size={36} />
                            <Text style={styles.memberName} numberOfLines={1}>
                              {member.nickname}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </Section>
                  </View>

                  <Text style={styles.guide}>교내 공개 장소에서 만남을 권장드려요</Text>
                  <Text style={styles.guideSub}>
                    {isEdit
                      ? '바꾸면 채팅방에 "일정이 변경되었어요"가 남고, 메이트의 약속카드에 바로 반영돼요.'
                      : '확정하면 채팅방의 모든 메이트에게 약속카드가 전송되고, 게시물은 매칭 목록에서 내려가요.'}
                  </Text>
                </ScrollView>

                <View style={styles.buttons}>
                  <View style={styles.cancel}>
                    <Button label={isEdit ? '취소' : '수정'} variant="outline" onPress={onClose} disabled={busy} />
                  </View>
                  <View style={styles.confirm}>
                    <Button
                      label={busy ? (isEdit ? '변경 중...' : '확정 중...') : isEdit ? '변경' : '확정'}
                      onPress={onSubmit}
                      disabled={!place.trim() || isPast || busy}
                    />
                  </View>
                </View>
              </>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

/** 카드 안 한 칸: 아이콘 원 + 보라 라벨 + 내용 */
function Section({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.iconCircle}>
          <Icon name={icon} size={16} color={colors.primary} />
        </View>
        <Text style={styles.sectionLabel}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

function Stepper({
  label,
  value,
  onPrev,
  onNext,
  prevDisabled = false,
  nextDisabled = false,
}: {
  label: string;
  value: string;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 이전`}
        disabled={prevDisabled}
        onPress={onPrev}
        style={[styles.stepButton, prevDisabled && styles.stepButtonDisabled]}
      >
        <Icon name="chevron-left" size={18} color={colors.primary} />
      </Pressable>
      <Text style={styles.stepperValue} accessibilityLabel={`${label} ${value}`}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 다음`}
        disabled={nextDisabled}
        onPress={onNext}
        style={[styles.stepButton, nextDisabled && styles.stepButtonDisabled]}
      >
        <Icon name="chevron-right" size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm, minHeight: 52 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  loading: { marginTop: spacing.lg * 2 },
  content: { padding: spacing.lg - 4, gap: spacing.sm },
  card: { overflow: 'hidden', paddingHorizontal: spacing.md + 2, paddingBottom: spacing.md, paddingTop: spacing.md + 6, borderRadius: radius.card + 2, backgroundColor: colors.white, gap: spacing.md },
  cardBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 8, backgroundColor: colors.primary },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { color: colors.primary, fontSize: fontSize.body - 1, fontWeight: '800' },
  valueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  valueDate: { color: colors.ink, fontSize: fontSize.body, fontWeight: '600' },
  valueTime: { color: colors.primary, fontSize: fontSize.body, fontWeight: '800', fontVariant: ['tabular-nums'] },
  steppers: { gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperLabel: { width: 36, color: colors.sub, fontSize: fontSize.caption + 1, fontWeight: '700' },
  stepperValue: { flex: 1, color: colors.ink, fontSize: fontSize.body - 1, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  stepButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  stepButtonDisabled: { opacity: 0.3 },
  input: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontSize: fontSize.body,
  },
  divider: { height: 1, backgroundColor: colors.line },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  member: { width: 56, alignItems: 'center', gap: 2 },
  memberName: { color: colors.ink, fontSize: fontSize.caption },
  error: { color: colors.danger, fontSize: fontSize.caption + 1 },
  guide: { color: colors.sub, fontSize: fontSize.caption + 1, textAlign: 'center', marginTop: spacing.xs },
  guideSub: { color: colors.sub, fontSize: fontSize.caption, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg - 4, paddingVertical: spacing.sm },
  cancel: { flex: 1 },
  confirm: { flex: 1.4 },
});
