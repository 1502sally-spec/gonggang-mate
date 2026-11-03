/**
 * S11 채팅 목록 — 담당: B
 * PRD: 상단 탭(식사/카페/공부/산책), 채팅방 미리보기, 안 읽은 메시지 배지, 실시간 갱신.
 * - 탭마다 안 읽은 메시지 합계를 숫자로 보여 줘서 다른 카테고리의 새 메시지도 놓치지 않게 한다.
 * - 방장에게는 대기 중인 채팅 요청 수를 따로 표시한다 (10/31 회의: 방장이 S12에서 수락).
 * - 실시간 갱신: 화면에 들어올 때, 앱으로 돌아올 때, 보고 있는 동안 REFRESH_MS마다 다시 불러온다.
 * - 방장이 약속을 취소해 닫힌 방은 서버가 목록에서 뺀다 (11/3 결정).
 * 11/3 결정 12번: 1:1 방(kind = 'direct')은 카테고리가 없어서 맨 끝 '1:1' 탭에 모은다.
 * 디자인팀 UI 반영(11/4, A): 제목 + 검색 아이콘, 채팅 검색 칸, 방 한 줄(사진·이름·방장 태그·시간·미리보기·보라 배지).
 * 디자인에 없는 카테고리·1:1 탭은 둥근 칩으로 검색 칸 아래에 둔다.
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type RoomListItem } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { CATEGORIES, categoryInfo, colors, fontSize, radius, spacing, type Category } from '@/constants/theme';
import { formatDate, kstMinutesOfDay, minutesToTime } from '@/lib/time';

const REFRESH_MS = 15_000;

/** 탭: 게시물 카테고리 4개 + 1:1 방 */
type Tab = Category | 'direct';
const TABS: Tab[] = [...CATEGORIES, 'direct'];
const tabLabel = (t: Tab) => (t === 'direct' ? '1:1' : categoryInfo[t].label);
const inTab = (r: RoomListItem, t: Tab) => (t === 'direct' ? r.kind === 'direct' : r.kind !== 'direct' && r.category === t);

export default function ChatsScreen() {
  const [rooms, setRooms] = useState<RoomListItem[] | null>(null);
  const [tab, setTab] = useState<Tab | null>(null); // null = 아직 안 고름 (처음 불러온 뒤 정한다)
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(true);

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

  const q = query.trim().toLowerCase();
  const matches = (r: RoomListItem) =>
    !q || r.title.toLowerCase().includes(q) || (r.last_message?.body ?? '').toLowerCase().includes(q) || r.members.some((m) => m.nickname.toLowerCase().includes(q));
  // 검색 중에는 모든 탭에서 찾는다
  const visible = rooms.filter((r) => (q ? matches(r) : inTab(r, tab)));
  const unreadOf = (t: Tab) => rooms.filter((r) => inTab(r, t)).reduce((sum, r) => sum + r.unread_count + r.pending_request_count, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">
          채팅
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? '검색 닫기' : '채팅 검색'}
          onPress={() => {
            setSearchOpen((v) => !v);
            setQuery('');
          }}
          style={styles.iconButton}
          hitSlop={8}
        >
          <Icon name={searchOpen ? 'x' : 'search'} size={22} color={colors.ink} />
        </Pressable>
      </View>

      {searchOpen ? (
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.sub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="채팅 검색"
            placeholderTextColor={colors.sub}
            accessibilityLabel="채팅 검색"
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>
      ) : null}

      {!q ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsWrap} accessibilityRole="tablist">
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
        </ScrollView>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <RoomRow room={item} onPress={() => router.push({ pathname: '/chat/[roomId]', params: { roomId: item.id } })} />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {q
              ? '검색 결과가 없어요'
              : tab === 'direct'
                ? '1:1 채팅방이 없어요.\n메이트 프로필에서 1:1 채팅을 눌러 보세요.'
                : `${tabLabel(tab)} 채팅방이 없어요.\n게시판에서 채팅 요청을 보내거나 글을 써 보세요.`}
          </Text>
        }
      />
    </SafeAreaView>
  );
}

/** 채팅방 한 줄 (디자인: 사진 · 이름 + 방장 태그 · 시간 / 미리보기 · 안 읽은 수) */
function RoomRow({ room, onPress }: { room: RoomListItem; onPress: () => void }) {
  const last = room.last_message;
  const preview = last ? (last.sender_nickname ? `${last.sender_nickname}: ${last.body}` : last.body) : '아직 메시지가 없어요';
  const isDirect = room.kind === 'direct';
  // 게시물 방은 처음 들어온 사람(목록 맨 앞)이 방장이다
  const face = isDirect ? room.partner : room.members[0];
  const host = isDirect ? null : room.members[0];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${room.title}, ${room.member_count}명${room.unread_count > 0 ? `, 안 읽은 메시지 ${room.unread_count}개` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View>
        <Avatar nickname={face?.nickname ?? room.title} photoUrl={face?.photo_url ?? null} size={52} />
        {!isDirect && room.member_count > 1 ? (
          <View style={styles.memberBubble}>
            <Text style={styles.memberBubbleText}>{room.member_count}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.roomTitle} numberOfLines={1}>
            {room.title}
          </Text>
          {host ? (
            <View style={styles.hostTag}>
              <Text style={styles.hostTagText} numberOfLines={1}>
                방장: {room.is_host ? '나' : host.nickname}
              </Text>
            </View>
          ) : (
            <View style={styles.hostTag}>
              <Text style={styles.hostTagText}>1:1</Text>
            </View>
          )}
          <View style={styles.flex} />
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
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.lg - 4, paddingRight: spacing.sm, paddingTop: spacing.md },
  title: { color: colors.ink, fontSize: fontSize.title + 2, fontWeight: '900' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: spacing.lg },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg - 4,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  searchInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: fontSize.body },
  tabsWrap: { flexGrow: 0 },
  tabs: { gap: spacing.sm, paddingHorizontal: spacing.lg - 4, paddingVertical: spacing.md - 4 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.ink, fontSize: fontSize.body - 1, fontWeight: '700' },
  tabTextSelected: { color: colors.white },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, flexGrow: 1 },
  empty: { color: colors.sub, fontSize: fontSize.body - 1, textAlign: 'center', marginTop: spacing.lg * 2, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md - 4, paddingVertical: spacing.md - 4, paddingHorizontal: spacing.xs },
  pressed: { opacity: 0.7 },
  memberBubble: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.bg,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberBubbleText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  rowBody: { flex: 1, gap: 3 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomTitle: { flexShrink: 1, color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '800' },
  hostTag: { flexShrink: 1, maxWidth: 110, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.lineSoft },
  hostTagText: { color: colors.sub, fontSize: fontSize.caption - 1, fontWeight: '700' },
  time: { color: colors.sub, fontSize: fontSize.caption },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  preview: { flex: 1, color: colors.sub, fontSize: fontSize.body - 1 },
  request: { color: colors.danger, fontSize: fontSize.caption, fontWeight: '700' },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontSize: fontSize.caption, fontWeight: '800' },
});
