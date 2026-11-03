/**
 * S11 채팅 목록 — 담당: B
 * PRD: 상단 탭(식사/카페/공부/산책), 채팅방 미리보기, 안 읽은 메시지 배지, 실시간 갱신.
 * - 탭마다 안 읽은 메시지 합계를 숫자로 보여 줘서 다른 카테고리의 새 메시지도 놓치지 않게 한다.
 * - 방장에게는 대기 중인 채팅 요청 수를 따로 표시한다 (10/31 회의: 방장이 S12에서 수락).
 * - 실시간 갱신: 화면에 들어올 때, 앱으로 돌아올 때, 보고 있는 동안 REFRESH_MS마다 다시 불러온다.
 * - 방장이 약속을 취소해 닫힌 방은 서버가 목록에서 뺀다 (11/3 결정).
 * 11/3 결정 12번: 1:1 방(kind = 'direct')은 카테고리가 없어서 맨 끝 '1:1' 탭에 모은다.
 * 디자인은 나중에 피그마 반영 예정 (지금은 기능 위주).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type RoomListItem } from '@/api';
import { Avatar } from '@/components/Avatar';
import { CATEGORIES, categoryInfo, colors, fontSize, MIN_TOUCH, spacing, type Category } from '@/constants/theme';
import { formatDate, kstMinutesOfDay, minutesToTime } from '@/lib/time';

const REFRESH_MS = 15_000;

/** 탭: 게시물 카테고리 4개 + 1:1 방 */
type Tab = Category | 'direct';
const TABS: Tab[] = [...CATEGORIES, 'direct'];
const tabLabel = (t: Tab) => (t === 'direct' ? '1:1' : categoryInfo[t].label);
const inTab = (r: RoomListItem, t: Tab) => (t === 'direct' ? r.kind === 'direct' : r.kind !== 'direct' && r.category === t);
const AVATAR_STACK = 3; // 겹쳐 보여 줄 아바타 수

export default function ChatsScreen() {
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null);
  const [tab, setTab] = useState<Tab | null>(null); // null = 아직 안 고름 (처음 불러온 뒤 정한다)
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showError: boolean) => {
    try {
      const next = await api.rooms.getMyRooms();
      setRooms(next);
      // 처음 들어오면 가장 최근에 대화한 방의 카테고리를 연다 (목록은 최근 메시지 순)
      setTab((prev) => prev ?? (next[0] ? (next[0].kind === 'direct' ? 'direct' : (next[0].category ?? CATEGORIES[0])) : CATEGORIES[0]));
    } catch (e) {
      setRooms((prev) => prev ?? []);
      setTab((prev) => prev ?? CATEGORIES[0]);
      if (showError) Alert.alert(e instanceof ApiError ? e.message : '채팅 목록을 불러오지 못했어요');
    }
  }, []);

  // 보고 있는 동안만 주기적으로 다시 불러온다. 주기 갱신 실패는 조용히 넘긴다
  useFocusEffect(
    useCallback(() => {
      load(true);
      const timer = setInterval(() => load(false), REFRESH_MS);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') load(false);
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  if (!rooms || !tab) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.title}>채팅</Text>
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      </SafeAreaView>
    );
  }

  const visible = rooms.filter((r) => inTab(r, tab));
  const unreadOf = (t: Tab) => rooms.filter((r) => inTab(r, t)).reduce((sum, r) => sum + r.unread_count + r.pending_request_count, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>채팅</Text>

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((c) => {
          const selected = c === tab;
          const count = unreadOf(c);
          return (
            <Pressable
              key={c}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={count > 0 ? `${tabLabel(c)}, 새 소식 ${count}개` : tabLabel(c)}
              onPress={() => setTab(c)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{tabLabel(c)}</Text>
              {count > 0 ? <Badge count={count} /> : null}
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <RoomRow room={item} onPress={() => router.push({ pathname: '/chat/[roomId]', params: { roomId: item.id } })} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {tab === 'direct'
              ? '1:1 채팅방이 없어요.\n메이트 프로필에서 1:1 채팅을 눌러 보세요.'
              : `${tabLabel(tab)} 채팅방이 없어요.\n게시판에서 채팅 요청을 보내거나 글을 써 보세요.`}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

function RoomRow({ room, onPress }: { room: RoomListItem; onPress: () => void }) {
  const last = room.last_message;
  const preview = last ? (last.sender_nickname ? `${last.sender_nickname}: ${last.body}` : last.body) : '아직 메시지가 없어요';
  const stack = room.members.slice(0, AVATAR_STACK);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${room.title}, ${room.member_count}명${room.unread_count > 0 ? `, 안 읽은 메시지 ${room.unread_count}개` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.stack, { width: 40 + (stack.length - 1) * 14 }]}>
        {stack.map((m, i) => (
          <View key={m.id} style={[styles.stackItem, { left: i * 14, zIndex: AVATAR_STACK - i }]}>
            <Avatar nickname={m.nickname} photoUrl={m.photo_url} size={40} />
          </View>
        ))}
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.roomTitle} numberOfLines={1}>
            {room.title}
          </Text>
          <Text style={styles.memberCount}>{room.member_count}</Text>
          {last ? <Text style={styles.time}>{formatMessageTime(last.created_at)}</Text> : null}
        </View>
        <View style={styles.rowBottom}>
          <Text style={styles.preview} numberOfLines={1}>
            {preview}
          </Text>
          {room.unread_count > 0 ? <Badge count={room.unread_count} /> : null}
        </View>
        {room.is_host && room.pending_request_count > 0 ? (
          <Text style={styles.request}>채팅 요청 {room.pending_request_count}건 대기 중</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

/** 오늘 보낸 메시지는 '14:05', 그 전은 '11월 2일 (월)' */
function formatMessageTime(at: string): string {
  const today = formatDate(new Date().toISOString());
  const day = formatDate(at);
  return day === today ? minutesToTime(kstMinutesOfDay(at)) : day;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.ink, fontSize: fontSize.title, fontWeight: '900', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  loading: { marginTop: spacing.lg },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700' },
  tabTextSelected: { color: colors.white },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.8 },
  stack: { height: 40 },
  stackItem: { position: 'absolute', top: 0, borderRadius: 20, borderWidth: 2, borderColor: colors.white },
  rowBody: { flex: 1, gap: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roomTitle: { flexShrink: 1, color: colors.ink, fontSize: fontSize.body, fontWeight: '700' },
  memberCount: { color: colors.sub, fontSize: fontSize.caption, marginRight: 'auto' },
  time: { color: colors.sub, fontSize: fontSize.caption },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  preview: { flex: 1, color: colors.sub, fontSize: fontSize.caption + 1 },
  request: { color: colors.alert, fontSize: fontSize.caption, fontWeight: '700' },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.alert,
  },
  badgeText: { color: colors.white, fontSize: fontSize.caption - 1, fontWeight: '700' },
  empty: { color: colors.sub, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.lg, lineHeight: 22 },
});
