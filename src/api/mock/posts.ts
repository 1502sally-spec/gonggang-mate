/** 가짜 게시물·매칭 목록 (api/posts.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import { ApiError, type CreatePostInput, type MyRequestStatus, type PostListItem } from '@/api/types';
import { blockedUserIdsOf, requireMeId, roomMemberIds, toMini, isUserActive } from '@/api/mock/helpers';
import { copy, db, delay, newId, nowIso } from '@/api/mock/store';
import { MAX_ROOM_MEMBERS, POST_CONTENT_MAX, POST_TITLE_MAX } from '@/constants/config';
import { nextOccurrence, slotsToRanges, timeToMinutes } from '@/lib/time';
import { isPostVisibleTo } from '@/lib/visibility';
import type { Category, Post } from '@/types/db';

/** S07: 카테고리별 매칭 목록 (최신순). 노출 규칙은 lib/visibility.ts */
export async function getMatchingList(category: Category): Promise<PostListItem[]> {
  await delay();
  const meId = requireMeId();
  const myRanges = slotsToRanges(db.freeSlots.filter((s) => s.user_id === meId));
  const blocked = blockedUserIdsOf(meId);
  return copy(
    db.posts
      .filter((p) => p.category === category)
      .filter((p) => isPostVisibleTo({ post: p, viewerId: meId, viewerFreeRanges: myRanges, blockedUserIds: blocked }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => toListItem(p, meId)),
  );
}

/** S05: 카테고리 박스에 표시할 '내게 보이는 글 수' */
export async function getMatchingCounts(): Promise<Record<Category, number>> {
  const categories: Category[] = ['meal', 'cafe', 'study', 'walk'];
  const lists = await Promise.all(categories.map((c) => getMatchingList(c)));
  return Object.fromEntries(categories.map((c, i) => [c, lists[i].filter((p) => !p.is_mine).length])) as Record<Category, number>;
}

/** S08 '게시': 게시물과 채팅방을 같이 만들고, 작성자가 방장이 된다 */
export async function createPost(input: CreatePostInput): Promise<{ post: PostListItem; room_id: string }> {
  await delay();
  const meId = requireMeId();
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || title.length > POST_TITLE_MAX) throw new ApiError(`제목은 1~${POST_TITLE_MAX}자로 입력해 주세요`, 'invalid_input');
  if (!content || content.length > POST_CONTENT_MAX) throw new ApiError(`내용은 1~${POST_CONTENT_MAX}자로 입력해 주세요`, 'invalid_input');
  if (timeToMinutes(input.range.end) <= timeToMinutes(input.range.start)) throw new ApiError('약속시간을 설정해 주세요', 'invalid_input');

  const { start_at, end_at } = nextOccurrence(input.range);
  const post: Post = {
    id: newId('p'),
    author_id: meId,
    category: input.category,
    title,
    content,
    weekday: input.range.weekday,
    start_time: input.range.start,
    end_time: input.range.end,
    start_at,
    end_at,
    status: 'open',
    created_at: nowIso(),
  };
  const room = { id: newId('r'), kind: 'post' as const, post_id: post.id, host_id: meId, direct_key: null, created_at: post.created_at };
  db.posts.push(post);
  db.rooms.push(room);
  db.members.push({ room_id: room.id, user_id: meId, joined_at: post.created_at, last_read_message_id: null });
  return { post: copy(toListItem(post, meId)), room_id: room.id };
}

/** 내 게시물 삭제 (채팅방 나가기 대신 방장이 쓰는 기능) */
export async function deletePost(postId: string): Promise<void> {
  await delay();
  const meId = requireMeId();
  const post = db.posts.find((p) => p.id === postId);
  if (!post) throw new ApiError('게시물을 찾을 수 없어요', 'not_found');
  if (post.author_id !== meId) throw new ApiError('내 게시물만 삭제할 수 있어요', 'not_allowed');
  post.status = 'deleted';
}

function toListItem(p: Post, meId: string): PostListItem {
  const room = db.rooms.find((r) => r.post_id === p.id)!;
  const req = db.joinRequests
    .filter((j) => j.room_id === room.id && j.requester_id === meId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const isMember = roomMemberIds(room.id).includes(meId);
  const my_request: MyRequestStatus = isMember ? 'accepted' : !req || req.status === 'canceled' ? 'none' : req.status;
  return {
    id: p.id,
    room_id: room.id,
    category: p.category,
    title: p.title,
    content_preview: p.content.slice(0, 60),
    range: { weekday: p.weekday, start: p.start_time, end: p.end_time },
    start_at: p.start_at,
    end_at: p.end_at,
    thumbnail_url: null,
    author: toMini(p.author_id),
    author_is_active: isUserActive(p.author_id),
    member_count: roomMemberIds(room.id).length,
    max_members: MAX_ROOM_MEMBERS,
    is_mine: p.author_id === meId,
    my_request,
    created_at: p.created_at,
  };
}
