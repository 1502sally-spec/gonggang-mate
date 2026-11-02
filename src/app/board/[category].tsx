/**
 * S07 카테고리 게시판 (식사/카페/공부/산책) — 담당: B
 * 카테고리 4개가 이 파일 하나를 같이 쓴다. 주소의 [category] 값만 다르다.
 * PRD: "내 공강시간과 겹치는 게시물만 보여요". 노출 규칙은 PRD 7.1 (isPostVisibleTo).
 * 10/31 회의: 약속시간 전체가 아니라 30분(MIN_OVERLAP_MINUTES) 이상 겹치면 노출.
 * 목록은 바 형태. 말풍선 버튼 → 방장에게 채팅 요청 → 방장 수락 후 S12 입장.
 * 약속이 확정된 게시물은 목록에서 내려간다. 20명이 찬 방은 말풍선 버튼 비활성.
 * 디자인은 나중에 피그마 반영 예정 (지금은 기능 위주).
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type MyRequestStatus, type PostListItem } from '@/api';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { categoryInfo, colors, fontSize, MIN_TOUCH, spacing, type Category } from '@/constants/theme';
import { formatRange } from '@/lib/time';

export default function BoardScreen() {
  const { category } = useLocalSearchParams<{ category: Category }>();
  const info = categoryInfo[category];
  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);

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

  const title = info ? `${info.label} 게시판` : '게시판';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
          onPress={() => router.back()}
          style={styles.back}
          hitSlop={8}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.back} />
      </View>

      {!info ? (
        <Text style={styles.empty}>없는 카테고리예요</Text>
      ) : (
        <>
          <Text style={styles.guide}>내 공강시간과 겹치는 게시물만 보여요</Text>
          {loading ? (
            <ActivityIndicator style={styles.loading} color={colors.primary} />
          ) : (
            <FlatList
              data={posts}
              keyExtractor={(p) => p.id}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
              ListEmptyComponent={
                <Text style={styles.empty}>
                  지금은 내 공강과 겹치는 게시물이 없어요.{'\n'}직접 글을 올려 메이트를 찾아보세요!
                </Text>
              }
              renderItem={({ item }) => (
                <PostBar
                  post={item}
                  accent={info.accent}
                  busy={busyPostId === item.id}
                  onRequest={() => onRequest(item)}
                  onCancelRequest={() => onCancelRequest(item)}
                  onOpenRoom={() => openRoom(item)}
                />
              )}
            />
          )}
          <View style={styles.bottom}>
            <Button label="게시물 작성" onPress={() => router.push({ pathname: '/post/new', params: { category } })} />
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

type PostBarProps = {
  post: PostListItem;
  accent: string;
  busy: boolean;
  onRequest: () => void;
  onCancelRequest: () => void;
  onOpenRoom: () => void;
};

/** 매칭 목록의 바 하나 */
function PostBar({ post, accent, busy, onRequest, onCancelRequest, onOpenRoom }: PostBarProps) {
  const full = post.member_count >= post.max_members;

  return (
    <View style={styles.bar}>
      <View style={styles.barBody}>
        <Text style={[styles.range, { color: accent }]}>{formatRange(post.range)}</Text>
        <Text style={styles.postTitle} numberOfLines={1}>
          {post.title}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {post.content_preview}
        </Text>
        <View style={styles.meta}>
          <Avatar nickname={post.author.nickname} photoUrl={post.author.photo_url} size={20} />
          <Text style={styles.metaText}>
            {post.is_mine ? '내 글' : post.author.nickname} · {post.member_count}/{post.max_members}명
          </Text>
        </View>
      </View>
      <View style={styles.action}>
        <ActionButton
          post={post}
          full={full}
          busy={busy}
          onRequest={onRequest}
          onCancelRequest={onCancelRequest}
          onOpenRoom={onOpenRoom}
        />
      </View>
    </View>
  );
}

/** 바 오른쪽 버튼: 내 글·참여 중이면 채팅방 입장, 아니면 말풍선(채팅 요청) 상태에 따라 바뀐다 */
function ActionButton({ post, full, busy, onRequest, onCancelRequest, onOpenRoom }: Omit<PostBarProps, 'accent'> & { full: boolean }) {
  if (post.is_mine) return <Button label="내 채팅방" variant="secondary" onPress={onOpenRoom} />;
  switch (post.my_request) {
    case 'accepted':
      return <Button label="채팅방 입장" variant="secondary" onPress={onOpenRoom} />;
    case 'pending':
      return <Button label="요청 보냄" variant="secondary" onPress={onCancelRequest} disabled={busy} />;
    case 'rejected':
      return <Button label="거절됨" variant="secondary" disabled />;
    default:
      return <Button label={full ? '인원 마감' : '💬 채팅 요청'} onPress={onRequest} disabled={full || busy} />;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  back: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, color: colors.ink },
  title: { fontSize: 18, fontWeight: '900', color: colors.ink },
  guide: { color: colors.sub, fontSize: fontSize.caption, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  loading: { marginTop: spacing.lg },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm, flexGrow: 1 },
  empty: { color: colors.sub, fontSize: fontSize.body, textAlign: 'center', marginTop: spacing.lg, lineHeight: 22 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  barBody: { flex: 1, gap: 2 },
  range: { fontSize: fontSize.caption, fontWeight: '700' },
  postTitle: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700' },
  preview: { color: colors.sub, fontSize: fontSize.caption },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  metaText: { color: colors.sub, fontSize: fontSize.caption },
  action: { flexShrink: 0 },
  bottom: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.white },
});
