/**
 * S07 카테고리 게시판 (식사/카페/공부/산책) — 담당: B
 * 카테고리 4개가 이 파일 하나를 같이 쓴다. 주소의 [category] 값만 다르다.
 * PRD: "내 공강시간과 겹치는 게시물만 보여요". 노출 규칙은 PRD 7.1 (isPostVisibleTo).
 * 10/31 회의: 약속시간 전체가 아니라 30분(MIN_OVERLAP_MINUTES) 이상 겹치면 노출.
 * 목록은 바 형태. 말풍선 버튼 → 방장에게 채팅 요청 → 방장 수락 후 S12 입장.
 * 약속이 확정된 게시물은 목록에서 내려간다. 20명이 찬 방은 말풍선 버튼 비활성.
 * 디자인팀 UI 반영(11/4, A): 인사말 머리말, 카테고리 칩(화면 안에서 전환), '매칭 가능한 메이트' 카드 목록, 오른쪽 작은 버튼.
 * 디자인에 없는 '게시물 작성'은 머리말 오른쪽 '글쓰기' 버튼으로 둔다. 장소·예산 필터는 넣지 않는다 (11/3 결정 7번).
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type MyRequestStatus, type PostListItem } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { CATEGORIES, categoryInfo, colors, fontSize, radius, spacing, type Category } from '@/constants/theme';
import { formatRange } from '@/lib/time';

export default function BoardScreen() {
  const { category } = useLocalSearchParams<{ category: Category }>();
  const info = categoryInfo[category];
  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    api.users
      .getMe()
      .then((me) => setNickname(me.nickname))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!info) return;
    try {
      setPosts(await api.posts.getMatchingList(category));
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '게시물을 불러오지 못했어요');
    }
  }, [category, info]);

  // S08에서 글을 쓰고 돌아오거나 S12에서 돌아올 때도 최신 목록을 보여 준다
  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const setMyRequest = (postId: string, my_request: MyRequestStatus) =>
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, my_request } : p)));

  const onRequest = async (post: PostListItem) => {
    setBusyPostId(post.id);
    try {
      const status = await api.rooms.requestJoin(post.id);
      setMyRequest(post.id, status);
      if (status === 'accepted') router.push({ pathname: '/chat/[roomId]', params: { roomId: post.room_id } });
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : '채팅 요청을 보내지 못했어요');
      // 마감·인원 초과 등 목록 상태가 바뀌었을 수 있다
      await load();
    } finally {
      setBusyPostId(null);
    }
  };

  const onCancelRequest = (post: PostListItem) => {
    Alert.alert('채팅 요청을 취소할까요?', undefined, [
      { text: '아니요', style: 'cancel' },
      {
        text: '요청 취소',
        style: 'destructive',
        onPress: async () => {
          setBusyPostId(post.id);
          try {
            await api.rooms.cancelJoinRequest(post.id);
            setMyRequest(post.id, 'none');
          } catch (e) {
            Alert.alert(e instanceof ApiError ? e.message : '요청을 취소하지 못했어요');
          } finally {
            setBusyPostId(null);
          }
        },
      },
    ]);
  };

  const openRoom = (post: PostListItem) => router.push({ pathname: '/chat/[roomId]', params: { roomId: post.room_id } });

  /** 카테고리 칩: 같은 화면에서 게시판만 바꾼다 */
  const switchCategory = (next: Category) => {
    if (next === category) return;
    setLoading(true);
    setPosts([]);
    router.setParams({ category: next });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" onPress={() => router.back()} style={styles.iconButton} hitSlop={8}>
          <Icon name="arrow-left" size={24} color={colors.ink} />
        </Pressable>
        {info ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${info.label} 게시물 작성`}
            onPress={() => router.push({ pathname: '/post/new', params: { category } })}
            style={styles.writeButton}
            hitSlop={6}
          >
            <Icon name="edit-2" size={15} color={colors.white} />
            <Text style={styles.writeText}>글쓰기</Text>
          </Pressable>
        ) : null}
      </View>

      {!info ? (
        <Text style={styles.empty}>없는 카테고리예요</Text>
      ) : (
        <FlatList
          data={loading ? [] : posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.hello} accessibilityRole="header">
                {nickname ? `${nickname}님` : `${info.label} 게시판`}
              </Text>
              <Text style={styles.subtitle}>{LOOKING_FOR[category]} 메이트를 찾고 있어요</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="tablist">
                {CATEGORIES.map((c) => {
                  const on = c === category;
                  return (
                    <Pressable
                      key={c}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      onPress={() => switchCategory(c)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{categoryInfo[c].label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>매칭 가능한 메이트</Text>
                {!loading ? <Text style={styles.count}>{posts.length}개</Text> : null}
              </View>
              <Text style={styles.guide}>내 공강시간과 30분 이상 겹치는 게시물만 보여요</Text>
              {loading ? <ActivityIndicator style={styles.loading} color={colors.primary} /> : null}
            </View>
          }
          ListEmptyComponent={
            loading ? undefined : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>지금은 겹치는 게시물이 없어요</Text>
                <Text style={styles.emptyText}>직접 글을 올려 메이트를 찾아보세요!</Text>
                <Button label="글쓰기" size="sm" onPress={() => router.push({ pathname: '/post/new', params: { category } })} />
              </View>
            )
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              busy={busyPostId === item.id}
              onRequest={() => onRequest(item)}
              onCancelRequest={() => onCancelRequest(item)}
              onOpenRoom={() => openRoom(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

/** 머리말 부제: "함께 공부할 메이트를 찾고 있어요" */
const LOOKING_FOR: Record<Category, string> = {
  meal: '함께 식사할',
  cafe: '함께 카페 갈',
  study: '함께 공부할',
  walk: '함께 산책할',
};

type PostCardProps = {
  post: PostListItem;
  busy: boolean;
  onRequest: () => void;
  onCancelRequest: () => void;
  onOpenRoom: () => void;
};

/** 매칭 목록 카드 하나 (디자인: 사진 + 이름 + 상태 태그 + 겹치는 시간 + 태그 + 오른쪽 작은 버튼) */
function PostCard({ post, busy, onRequest, onCancelRequest, onOpenRoom }: PostCardProps) {
  const full = post.member_count >= post.max_members;

  return (
    <View style={styles.card}>
      <Avatar nickname={post.author.nickname} photoUrl={post.author.photo_url} size={56} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {post.title}
        </Text>
        <View style={styles.statusRow}>
          {post.is_mine ? (
            <View style={styles.statusTag}>
              <Text style={styles.statusText}>내 글</Text>
            </View>
          ) : post.author_is_active ? (
            <View style={styles.statusTag} accessibilityLabel="작성자 현재 활동 중">
              <View style={styles.activeDot} />
              <Text style={styles.statusText}>활동 중</Text>
            </View>
          ) : null}
          {!post.is_mine ? (
            <Text style={styles.author} numberOfLines={1}>
              {post.author.nickname}
            </Text>
          ) : null}
        </View>
        <Text style={styles.time}>{formatRange(post.range)}</Text>
        {post.content_preview ? (
          <Text style={styles.preview} numberOfLines={1}>
            {post.content_preview}
          </Text>
        ) : null}
        <View style={styles.tags}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>
              {post.member_count}/{post.max_members}명
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.action}>
        <ActionButton post={post} full={full} busy={busy} onRequest={onRequest} onCancelRequest={onCancelRequest} onOpenRoom={onOpenRoom} />
      </View>
    </View>
  );
}

/** 카드 오른쪽 버튼: 내 글·참여 중이면 채팅방, 아니면 채팅 요청 상태에 따라 바뀐다 */
function ActionButton({ post, full, busy, onRequest, onCancelRequest, onOpenRoom }: Omit<PostCardProps, 'accent'> & { full: boolean }) {
  if (post.is_mine) return <Button label="내 방" size="sm" variant="secondary" onPress={onOpenRoom} />;
  switch (post.my_request) {
    case 'accepted':
      return <Button label="채팅" size="sm" onPress={onOpenRoom} />;
    case 'pending':
      return <Button label="요청 보냄" size="sm" variant="secondary" onPress={onCancelRequest} disabled={busy} />;
    case 'rejected':
      return <Button label="거절됨" size="sm" variant="secondary" disabled />;
    default:
      return <Button label={full ? '마감' : '채팅 요청'} size="sm" onPress={onRequest} disabled={full || busy} />;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm, minHeight: 48 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  writeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 14,
    marginRight: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  writeText: { color: colors.white, fontSize: fontSize.body - 1, fontWeight: '800' },
  list: { paddingHorizontal: spacing.lg - 4, paddingBottom: spacing.lg, gap: spacing.md - 4 },
  header: { gap: spacing.xs, marginBottom: spacing.xs },
  hello: { color: colors.primary, fontSize: fontSize.title + 2, fontWeight: '900' },
  subtitle: { color: colors.sub, fontSize: fontSize.body - 1 },
  chips: { gap: spacing.sm, paddingVertical: spacing.md - 4 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.ink, fontSize: fontSize.body - 1, fontWeight: '700' },
  chipTextOn: { color: colors.white },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.xs },
  sectionTitle: { color: colors.ink, fontSize: fontSize.body + 4, fontWeight: '900' },
  count: { color: colors.sub, fontSize: fontSize.caption + 1, fontWeight: '700' },
  guide: { color: colors.sub, fontSize: fontSize.caption },
  loading: { marginTop: spacing.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '800' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.primaryTint },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  statusText: { color: colors.primaryBright, fontSize: fontSize.caption, fontWeight: '800' },
  author: { flexShrink: 1, color: colors.sub, fontSize: fontSize.caption + 1 },
  time: { color: colors.sub, fontSize: fontSize.body - 1, fontVariant: ['tabular-nums'] },
  preview: { color: colors.ink, fontSize: fontSize.caption + 1 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 2 },
  tag: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.primaryTint },
  tagText: { color: colors.primary, fontSize: fontSize.caption, fontWeight: '800' },
  action: { minWidth: 76 },
  empty: { color: colors.sub, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.lg },
  emptyBox: { alignItems: 'center', gap: spacing.sm, padding: spacing.lg, borderRadius: radius.card, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  emptyTitle: { color: colors.primary, fontSize: fontSize.body + 1, fontWeight: '800' },
  emptyText: { color: colors.sub, fontSize: fontSize.caption + 1, marginBottom: spacing.xs },
});
