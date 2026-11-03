/**
 * S12 채팅방 — 담당: B
 * PRD: 실시간 메시지, 프로필 사진 탭 → S13, 방장에게만 '약속 확정' → S14, '게임' 버튼 → S16.
 * 10/31 회의 추가: 방장에게 입장 요청 수락/거절, 약속 확정 시 대기 중인 요청은 자동 거절 (최대 20명).
 * - 메시지: 구독을 먼저 시작하고 목록을 불러와 id로 합친다 (api/messages.ts 사용법). 위로 올리면 이전 메시지
 * - 시스템 메시지(입장·나가기·약속 확정)가 오면 상단 정보(인원, 약속 여부)를 다시 불러온다
 * - 채팅 요청은 실시간 구독이 없어서 보고 있는 동안 REFRESH_MS마다 다시 불러온다
 * - 메뉴: 메이트는 '나가기' (약속이 있으면 약속 취소와 같음, 11/3 결정), 방장은 '게시물 삭제' (약속 확정 전만)
 * 11/3 결정 12번: 1:1 방(room.kind = 'direct')은 post가 없다. 제목은 상대 닉네임, 대화와 게임만 (약속 확정 없음), 메뉴는 '나가기'만.
 * 디자인팀 UI 반영(11/4, A): 상단 참여자 이름 칩, '약속 확정' 알약 버튼, 이름이 들어간 말풍선과 시간, 날짜 구분,
 *   입력창 옆 게임 버튼 → 미니게임 선택창(아래에서 올라옴) → 바로 게임 설정 화면. 디자인에 없는 채팅 요청·게시물 요약은 같은 형식으로 추가.
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type JoinRequestItem, type MessageItem, type RoomDetail } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { BottomSheet } from '@/components/popups/BottomSheet';
import { Button } from '@/components/Button';
import { ConfirmAppointmentPopup } from '@/components/popups/ConfirmAppointmentPopup';
import { MateInfoPopup } from '@/components/popups/MateInfoPopup';
import { categoryInfo, colors, fontSize, MIN_TOUCH, radius, spacing } from '@/constants/theme';
import { describeGameResult, GAME_CARD, GAME_INFO, GAME_TYPES } from '@/lib/gameResult';
import { formatDate, formatDateRange, kstMinutesOfDay, minutesToTime } from '@/lib/time';

const PAGE_SIZE = 50;
const REFRESH_MS = 15_000;
const MESSAGE_MAX = 1000; // DB messages.body 제한과 같다

const errorMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** id로 중복을 없애고 오래된 것부터 정렬 */
function mergeMessages(prev: MessageItem[], incoming: MessageItem[]): MessageItem[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  incoming.forEach((m) => byId.set(m.id, m));
  return [...byId.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

export default function ChatRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [requests, setRequests] = useState<JoinRequestItem[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mateId, setMateId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [gameSheet, setGameSheet] = useState(false); // 미니게임 선택창
  const [myId, setMyId] = useState<string | null>(null); // 상단 이름 칩에서 나를 빼려고

  useEffect(() => {
    api.users
      .getMe()
      .then((me) => setMyId(me.id))
      .catch(() => {});
  }, []);
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);

  /** 상단 정보 + (방장이면) 채팅 요청. 한 번도 못 불러왔을 때만 실패를 화면에 보여 준다 */
  const roomLoaded = useRef(false);
  const loadRoom = useCallback(async () => {
    try {
      const detail = await api.rooms.getRoom(roomId);
      roomLoaded.current = true;
      setRoom(detail);
      setRequests(detail.is_host ? await api.rooms.getJoinRequests(roomId) : []);
    } catch (e) {
      if (!roomLoaded.current) setLoadError(errorMessage(e, '채팅방을 불러오지 못했어요'));
    }
  }, [roomId]);

  const reloadMessages = useCallback(async () => {
    const list = await api.messages.getMessages(roomId, { limit: PAGE_SIZE });
    setMessages((prev) => mergeMessages(prev ?? [], list));
    setHasMore(list.length === PAGE_SIZE);
    api.messages.markRead(roomId).catch(() => {});
  }, [roomId]);

  useEffect(() => {
    let active = true;
    const unsubscribe = api.messages.subscribeMessages(roomId, (m) => {
      if (!active) return;
      setMessages((prev) => mergeMessages(prev ?? [], [m]));
      api.messages.markRead(roomId).catch(() => {});
      if (m.type === 'system') loadRoom();
    });
    api.messages
      .getMessages(roomId, { limit: PAGE_SIZE })
      .then((list) => {
        if (!active) return;
        setMessages((prev) => mergeMessages(prev ?? [], list));
        setHasMore(list.length === PAGE_SIZE);
        api.messages.markRead(roomId).catch(() => {});
      })
      .catch((e) => {
        if (active) setLoadError(errorMessage(e, '메시지를 불러오지 못했어요'));
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [roomId, loadRoom]);

  // 상단 정보는 들어올 때(S14·S16에서 돌아올 때 포함) 불러오고, 채팅 요청·인원은 보고 있는 동안 주기적으로 다시 확인한다
  useFocusEffect(
    useCallback(() => {
      loadRoom();
      const timer = setInterval(loadRoom, REFRESH_MS);
      return () => clearInterval(timer);
    }, [loadRoom]),
  );

  const loadOlder = async () => {
    if (!messages?.length || !hasMore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await api.messages.getMessages(roomId, { before: messages[0].id, limit: PAGE_SIZE });
      setMessages((prev) => mergeMessages(prev ?? [], older));
      setHasMore(older.length === PAGE_SIZE);
    } catch {
      // 다시 위로 올리면 또 시도한다
    } finally {
      setLoadingOlder(false);
    }
  };

  const onSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const sent = await api.messages.sendMessage(roomId, body);
      setMessages((prev) => mergeMessages(prev ?? [], [sent]));
      setText('');
    } catch (e) {
      Alert.alert(errorMessage(e, '메시지를 보내지 못했어요'));
    } finally {
      setSending(false);
    }
  };

  const onRespond = async (request: JoinRequestItem, accept: boolean) => {
    setRespondingId(request.id);
    try {
      await api.rooms.respondJoinRequest(request.id, accept);
    } catch (e) {
      Alert.alert(errorMessage(e, accept ? '수락하지 못했어요' : '거절하지 못했어요'));
    } finally {
      setRespondingId(null);
      await loadRoom();
    }
  };

  /** 확인 팝업 → 실행 → 성공하면 이전 화면으로 */
  const confirmAndLeave = (title: string, message: string, label: string, action: () => Promise<void>, fallback: string) => {
    Alert.alert(title, message, [
      { text: '취소', style: 'cancel' },
      {
        text: label,
        style: 'destructive',
        onPress: async () => {
          try {
            await action();
            router.back();
          } catch (e) {
            Alert.alert(errorMessage(e, fallback));
          }
        },
      },
    ]);
  };

  const onMenu = () => {
    if (!room) return;
    // 1:1 방: 누구나 나갈 수 있다. 상대 프로필의 '1:1 채팅'을 다시 누르면 다시 들어온다
    if (room.kind === 'direct' || !room.post) {
      const partner = room.partner;
      Alert.alert('1:1 채팅방', undefined, [
        ...(partner
          ? [
              {
                text: '차단하기',
                style: 'destructive' as const,
                onPress: () =>
                  confirmAndLeave(
                    `${partner.nickname}님을 차단할까요?`,
                    '서로의 글과 메시지가 보이지 않고, 이 채팅방에서 나가요.',
                    '차단하기',
                    async () => {
                      await api.blocks.blockUser(partner.id);
                      await api.rooms.leaveRoom(roomId).catch(() => {});
                    },
                    '차단하지 못했어요',
                  ),
              },
            ]
          : []),
        {
          text: '나가기',
          onPress: () =>
            confirmAndLeave(
              '1:1 채팅방을 나갈까요?',
              '상대 프로필에서 1:1 채팅을 다시 누르면 다시 들어올 수 있어요.',
              '나가기',
              () => api.rooms.leaveRoom(roomId),
              '채팅방을 나가지 못했어요',
            ),
        },
        { text: '취소', style: 'cancel' },
      ]);
      return;
    }
    const post = room.post;
    if (room.is_host && room.appointment_id) {
      Alert.alert('방장은 채팅방을 나갈 수 없어요', '약속을 취소하려면 약속카드에서 취소해 주세요.', [
        { text: '닫기', style: 'cancel' },
        { text: '약속카드 보기', onPress: () => router.push('/appointments') },
      ]);
    } else if (room.is_host) {
      confirmAndLeave(
        '게시물을 삭제할까요?',
        '방장은 채팅방을 나갈 수 없어서 게시물을 삭제해야 해요. 매칭 목록과 채팅 목록에서 함께 사라져요.',
        '삭제',
        () => api.posts.deletePost(post.id),
        '게시물을 삭제하지 못했어요',
      );
    } else {
      confirmAndLeave(
        '채팅방을 나갈까요?',
        room.appointment_id ? '확정된 약속도 함께 취소돼요.' : '다시 들어오려면 채팅 요청을 다시 보내야 해요.',
        '나가기',
        () => api.rooms.leaveRoom(roomId),
        '채팅방을 나가지 못했어요',
      );
    }
  };

  // 게임 결과 문장에 쓸 닉네임 (나간 사람도 메시지에 남아 있으면 찾는다)
  const nameOf = useMemo(() => {
    const names = new Map<string, string>();
    messages?.forEach((m) => {
      if (m.sender) names.set(m.sender.id, m.sender.nickname);
    });
    room?.members.forEach((m) => names.set(m.id, m.nickname));
    return (userId: string) => names.get(userId) ?? '알 수 없음';
  }, [messages, room]);

  // 아래부터 쌓이는 목록 (inverted): 최신 메시지가 0번
  const reversed = useMemo(() => (messages ? [...messages].reverse() : []), [messages]);

  if (loadError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Header names={[]} onBack={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.errorText}>{loadError}</Text>
          <Button label="돌아가기" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const post = room?.post ?? null; // 1:1 방이면 null
  const isDirect = room?.kind === 'direct';
  const info = post ? categoryInfo[post.category] : null;
  const full = !!room && room.members.length >= room.max_members;
  // 상단 이름 칩: 나를 뺀 참여자 (1:1이면 상대)
  const names = isDirect
    ? [room?.partner?.nickname ?? '1:1 채팅']
    : (room?.members ?? []).filter((m) => m.id !== myId).map((m) => m.nickname);
  const summary =
    post && info && room ? `${info.label} · ${post.title} · ${formatDateRange(post.start_at, post.end_at)} · ${room.members.length}/${room.max_members}명` : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Header names={names} onBack={() => router.back()} onMenu={room ? onMenu : undefined} />

        {room && (summary || room.appointment_id || (room.is_host && !isDirect)) ? (
          <View style={styles.subBar}>
            {room.appointment_id ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/appointments')} style={[styles.pill, styles.pillSoft]}>
                <Text style={[styles.pillText, styles.pillTextSoft]}>약속카드 보기</Text>
              </Pressable>
            ) : room.is_host && !isDirect ? (
              <Pressable accessibilityRole="button" onPress={() => setConfirmOpen(true)} style={styles.pill}>
                <Text style={styles.pillText}>약속 확정</Text>
              </Pressable>
            ) : null}
            {summary ? (
              <Text style={styles.summary} numberOfLines={1}>
                {summary}
              </Text>
            ) : null}
          </View>
        ) : null}

        {requests.length > 0 ? (
          <View style={styles.requests}>
            <Text style={styles.requestsTitle}>
              채팅 요청 {requests.length}건{full ? ' · 인원이 가득 찼어요' : ''}
            </Text>
            <ScrollView style={styles.requestList} nestedScrollEnabled>
              {requests.map((request) => {
                const busy = respondingId === request.id;
                return (
                  <View key={request.id} style={styles.requestRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${request.user.nickname} 메이트 정보`}
                      onPress={() => setMateId(request.user.id)}
                    >
                      <Avatar nickname={request.user.nickname} photoUrl={request.user.photo_url} size={32} />
                    </Pressable>
                    <Text style={styles.requestName} numberOfLines={1}>
                      {request.user.nickname}
                    </Text>
                    <Button label="거절" size="sm" variant="secondary" onPress={() => onRespond(request, false)} disabled={busy} />
                    <Button label="수락" size="sm" onPress={() => onRespond(request, true)} disabled={busy || full} />
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {!room || !messages ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : messages.length === 0 ? (
          // inverted 목록의 빈 화면은 뒤집혀 보일 수 있어서 목록 밖에 둔다
          <Text style={styles.empty}>첫 메시지를 보내 보세요</Text>
        ) : (
          <FlatList
            inverted
            data={reversed}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingOlder ? <ActivityIndicator color={colors.primary} /> : undefined}
            renderItem={({ item, index }) => {
              const older = reversed[index + 1];
              const firstOfGroup = !older || older.type === 'system' || older.sender_id !== item.sender_id;
              const newDay = !older || formatDate(older.created_at) !== formatDate(item.created_at);
              return (
                <View>
                  {newDay ? <DateChip at={item.created_at} /> : null}
                  <MessageRow message={item} showSender={firstOfGroup || newDay} nameOf={nameOf} onPressAvatar={setMateId} />
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="메시지를 입력하세요"
            placeholderTextColor={colors.sub}
            accessibilityLabel="메시지 입력"
            multiline
            maxLength={MESSAGE_MAX}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="미니게임"
            onPress={() => setGameSheet(true)}
            disabled={!room}
            style={styles.gameButton}
            hitSlop={4}
          >
            <Icon name="gamepad" size={22} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="전송"
            accessibilityState={{ disabled: !text.trim() || sending || !room }}
            onPress={onSend}
            disabled={!text.trim() || sending || !room}
            style={[styles.sendButton, (!text.trim() || sending || !room) && styles.sendDisabled]}
            hitSlop={4}
          >
            <Icon name="send" size={20} color={colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* 미니게임 선택창 (디자인팀 UI) → 고른 게임의 설정 화면으로 바로 */}
      <BottomSheet visible={gameSheet} onClose={() => setGameSheet(false)} title="미니게임 선택 🎮">
        <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetContent}>
          {GAME_TYPES.map((t) => {
            const card = GAME_CARD[t];
            return (
              <Pressable
                key={t}
                accessibilityRole="button"
                accessibilityLabel={`${GAME_INFO[t].label}, ${GAME_INFO[t].description}`}
                onPress={() => {
                  setGameSheet(false);
                  router.push({ pathname: '/game/[roomId]', params: { roomId, type: t } });
                }}
                style={({ pressed }) => [styles.sheetItem, pressed && styles.pressed]}
              >
                <View style={[styles.sheetTile, { backgroundColor: card.tile }]}>
                  <Text style={styles.sheetEmoji}>{GAME_INFO[t].emoji}</Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.sheetNameRow}>
                    <Text style={styles.sheetName}>{GAME_INFO[t].label}</Text>
                    <View style={[styles.sheetTag, { backgroundColor: card.tile }]}>
                      <Text style={[styles.sheetTagText, { color: card.tagColor }]}>{card.tag}</Text>
                    </View>
                  </View>
                  <Text style={styles.sheetDesc} numberOfLines={2}>
                    {GAME_INFO[t].description}
                  </Text>
                </View>
                <View style={[styles.sheetArrow, { backgroundColor: card.tile }]}>
                  <Icon name="chevron-right" size={16} color={card.tagColor} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>

      <MateInfoPopup userId={mateId} onClose={() => setMateId(null)} onBlocked={() => reloadMessages().catch(() => {})} />
      <ConfirmAppointmentPopup
        visible={confirmOpen}
        roomId={roomId}
        onClose={closeConfirm}
        onConfirmed={() => {
          setConfirmOpen(false);
          loadRoom();
          router.push('/appointments');
        }}
      />
    </SafeAreaView>
  );
}

/** 상단: 뒤로가기 · 참여자 이름 칩 · 메뉴 */
function Header({ names, onBack, onMenu }: { names: string[]; onBack: () => void; onMenu?: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={onBack} style={styles.iconButton} hitSlop={8}>
        <Icon name="arrow-left" size={24} color={colors.ink} />
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nameChips} style={styles.flex}>
        {names.map((name, i) => (
          <View key={`${name}-${i}`} style={styles.nameChip}>
            <Text style={styles.nameChipText} numberOfLines={1}>
              {name}
            </Text>
          </View>
        ))}
      </ScrollView>
      {onMenu ? (
        <Pressable accessibilityRole="button" accessibilityLabel="채팅방 메뉴" onPress={onMenu} style={styles.iconButton} hitSlop={8}>
          <Icon name="more-horizontal" size={22} color={colors.ink} />
        </Pressable>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
}

/** 날짜 구분 칩: 오늘이면 '오늘' */
function DateChip({ at }: { at: string }) {
  const day = formatDate(at);
  const label = day === formatDate(new Date().toISOString()) ? '오늘' : day;
  return (
    <View style={styles.dateChip}>
      <Text style={styles.dateChipText}>{label}</Text>
    </View>
  );
}

function MessageRow({
  message,
  showSender,
  nameOf,
  onPressAvatar,
}: {
  message: MessageItem;
  showSender: boolean;
  nameOf: (userId: string) => string;
  onPressAvatar: (userId: string) => void;
}) {
  const { sender, payload } = message;
  if (message.type === 'system' || !sender) {
    return (
      <View style={styles.systemChip}>
        <Text style={styles.system}>{message.body}</Text>
      </View>
    );
  }

  const mine = message.is_mine;
  const time = <Text style={[styles.time, mine && styles.timeMine]}>{minutesToTime(kstMinutesOfDay(message.created_at))}</Text>;

  if (message.type === 'game_result' && payload) {
    return (
      <View style={[mine ? styles.rowMine : styles.rowOther, showSender && styles.groupGap]}>
        {!mine ? <View style={styles.avatarSlot} /> : null}
        <View style={[styles.bubble, styles.gameCard]}>
          <Text style={styles.gameTitle}>
            {GAME_INFO[payload.type].emoji} {GAME_INFO[payload.type].label} 결과
          </Text>
          {describeGameResult(payload.type, payload.result, nameOf).map((line, i) => (
            <Text key={i} style={styles.gameLine}>
              {line}
            </Text>
          ))}
          <Text style={styles.time}>
            {sender.nickname} · {minutesToTime(kstMinutesOfDay(message.created_at))}
          </Text>
        </View>
      </View>
    );
  }

  if (mine) {
    return (
      <View style={[styles.rowMine, showSender && styles.groupGap]}>
        <View style={[styles.bubble, styles.bubbleMine]}>
          <Text style={[styles.body, styles.bodyMine]}>{message.body}</Text>
          {time}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.rowOther, showSender && styles.groupGap]}>
      <View style={styles.avatarSlot}>
        {showSender ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${sender.nickname} 메이트 정보`} onPress={() => onPressAvatar(sender.id)}>
            <Avatar nickname={sender.nickname} photoUrl={sender.photo_url} size={36} />
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.bubble, styles.bubbleOther]}>
        <Text style={styles.body}>
          {showSender ? <Text style={styles.senderName}>{sender.nickname}: </Text> : null}
          {message.body}
        </Text>
        {time}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs, minHeight: 56 },
  iconButton: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  nameChips: { gap: 6, alignItems: 'center', paddingHorizontal: spacing.xs },
  nameChip: { maxWidth: 120, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.lineSoft },
  nameChipText: { color: colors.ink, fontSize: fontSize.body - 1, fontWeight: '700' },
  subBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  pill: { minHeight: 38, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.primaryBright, justifyContent: 'center' },
  pillSoft: { backgroundColor: colors.primaryTint },
  pillText: { color: colors.white, fontSize: fontSize.body - 1, fontWeight: '800' },
  pillTextSoft: { color: colors.primary },
  summary: { flex: 1, color: colors.sub, fontSize: fontSize.caption },
  requests: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md - 4,
    gap: spacing.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    backgroundColor: colors.primaryTint,
  },
  requestsTitle: { color: colors.primary, fontSize: fontSize.caption + 1, fontWeight: '800' },
  requestList: { maxHeight: 160 }, // 요청이 많아도 메시지 자리를 남겨 둔다
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  requestName: { flex: 1, color: colors.ink, fontSize: fontSize.body, fontWeight: '700' },
  loading: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  errorText: { color: colors.ink, fontSize: fontSize.body, textAlign: 'center' },
  messages: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  empty: { flex: 1, color: colors.sub, fontSize: fontSize.body, textAlign: 'center', textAlignVertical: 'center', paddingTop: spacing.lg },
  dateChip: { alignSelf: 'center', marginVertical: spacing.sm, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.lineSoft },
  dateChipText: { color: colors.sub, fontSize: fontSize.caption, fontWeight: '700' },
  systemChip: { alignSelf: 'center', marginVertical: spacing.xs, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.primaryTint },
  system: { color: colors.primary, fontSize: fontSize.caption, textAlign: 'center' },
  groupGap: { marginTop: spacing.sm },
  rowMine: { flexDirection: 'row', justifyContent: 'flex-end' },
  rowOther: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  avatarSlot: { width: 36 },
  senderName: { fontWeight: '700' },
  bubble: { maxWidth: '78%', paddingHorizontal: spacing.md - 2, paddingVertical: spacing.sm + 2, borderRadius: 18, gap: 4 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 6 },
  body: { color: colors.ink, fontSize: fontSize.body, lineHeight: 21 },
  bodyMine: { color: colors.white, fontWeight: '700' },
  gameCard: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.primarySoft, gap: 4 },
  gameTitle: { color: colors.primary, fontSize: fontSize.body, fontWeight: '800' },
  gameLine: { color: colors.ink, fontSize: fontSize.body - 1 },
  time: { color: colors.sub, fontSize: fontSize.caption - 1 },
  timeMine: { color: colors.primarySoft },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    paddingHorizontal: spacing.md + 2,
    paddingTop: 12,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 23,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: fontSize.body,
  },
  gameButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.4 },
  sheetList: { maxHeight: 420 },
  sheetContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, padding: spacing.md - 4, borderRadius: radius.control + 2, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  sheetTile: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetEmoji: { fontSize: 24 },
  sheetNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sheetName: { color: colors.ink, fontSize: fontSize.body, fontWeight: '800' },
  sheetTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  sheetTagText: { fontSize: fontSize.caption - 1, fontWeight: '800' },
  sheetDesc: { color: colors.sub, fontSize: fontSize.caption + 1, marginTop: 2 },
  sheetArrow: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
