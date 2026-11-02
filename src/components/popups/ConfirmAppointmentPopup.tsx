/**
 * S14 약속 확정 팝업 — 채팅방(S12)에서 방장이 '약속 확정'을 누르면 뜬다.
 * 게시물 내용으로 미리 채우고 방장이 고칠 수 있다. 장소가 비면 '확정' 비활성.
 * 시간은 격자(S08)와 같은 30분 단위로 고른다.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api, ApiError, type AppointmentItem, type RoomDetail } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/popups/BottomSheet';
import { TextField } from '@/components/TextField';
import { DAY_END, DAY_START, SLOT_MINUTES } from '@/constants/config';
import { categoryInfo, colors, fontSize, MIN_TOUCH, spacing } from '@/constants/theme';
import { formatDate, kstMinutesOfDay, minutesToTime, timeToMinutes } from '@/lib/time';

const SLOT_MS = SLOT_MINUTES * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const TEXT_MAX = 50;

type Props = {
  visible: boolean;
  roomId: string;
  onClose: () => void;
  /** 확정이 끝난 뒤 불린다. 팝업을 닫고 약속카드로 이동하는 일은 채팅방에서 한다 */
  onConfirmed: (appointment: AppointmentItem) => void;
};

export function ConfirmAppointmentPopup({ visible, roomId, onClose, onConfirmed }: Props) {
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
        setRoom(detail);
        setNow(Date.now());
        setStartMs(new Date(detail.post.start_at).getTime());
        setEndMs(new Date(detail.post.end_at).getTime());
        setPlace('');
        setActivity(`${categoryInfo[detail.post.category].label} ${detail.post.title}`.slice(0, TEXT_MAX));
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
  }, [visible, roomId, onClose]);

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
      const appointment = await api.appointments.confirmAppointment(roomId, {
        start_at: new Date(startMs).toISOString(),
        end_at: new Date(endMs).toISOString(),
        place,
        activity,
      });
      onConfirmed(appointment);
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '약속을 확정하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="약속 확정">
      {!room ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <View style={styles.times}>
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
              {isPast ? <Text style={styles.error}>이미 지난 시간이에요. 날짜나 시간을 바꿔 주세요.</Text> : null}
            </View>

            <TextField label="장소" value={place} onChangeText={setPlace} maxLength={TEXT_MAX} placeholder="예: 정문 앞·스시하루 정문점" />
            <TextField label="활동" value={activity} onChangeText={setActivity} maxLength={TEXT_MAX} />

            <View style={styles.members}>
              <Text style={styles.label}>참여 메이트 {room.members.length}명</Text>
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
            </View>

            <Text style={styles.guide}>확정하면 채팅방의 모든 메이트에게 약속카드가 전송되고, 게시물은 매칭 목록에서 내려가요.</Text>
          </ScrollView>

          <View style={styles.buttons}>
            <View style={styles.button}>
              <Button label="수정" variant="secondary" onPress={onClose} disabled={busy} />
            </View>
            <View style={styles.button}>
              <Button label={busy ? '확정 중...' : '확정'} onPress={onSubmit} disabled={!place.trim() || isPast || busy} />
            </View>
          </View>
        </>
      )}
    </BottomSheet>
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
      <StepButton symbol="‹" accessibilityLabel={`${label} 앞으로`} onPress={onPrev} disabled={prevDisabled} />
      <Text style={styles.stepperValue}>{value}</Text>
      <StepButton symbol="›" accessibilityLabel={`${label} 뒤로`} onPress={onNext} disabled={nextDisabled} />
    </View>
  );
}

function StepButton({ symbol, accessibilityLabel, onPress, disabled }: { symbol: string; accessibilityLabel: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.stepButton, disabled && styles.stepButtonDisabled]}
    >
      <Text style={styles.stepSymbol}>{symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { marginVertical: spacing.lg },
  form: { gap: spacing.md, paddingBottom: spacing.sm },
  times: { gap: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepperLabel: { width: 36, color: colors.ink, fontSize: fontSize.caption + 1, fontWeight: '700' },
  stepperValue: { flex: 1, color: colors.ink, fontSize: fontSize.body, fontWeight: '700', textAlign: 'center' },
  stepButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepButtonDisabled: { opacity: 0.3 },
  stepSymbol: { color: colors.ink, fontSize: 22 },
  error: { color: colors.danger, fontSize: fontSize.caption },
  members: { gap: spacing.sm },
  label: { color: colors.ink, fontSize: fontSize.caption + 1, fontWeight: '700' },
  memberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  member: { width: 56, alignItems: 'center', gap: 2 },
  memberName: { color: colors.sub, fontSize: fontSize.caption },
  guide: { color: colors.sub, fontSize: fontSize.caption, lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  button: { flex: 1 },
});
