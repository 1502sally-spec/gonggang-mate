/**
 * 게시물 = 매칭 목록 (S05 카테고리 새 글 수, S07 매칭 목록, S08 게시물 작성)
 *
 * - 매칭 목록은 서버(get_matching_posts RPC)가 lib/visibility.ts isPostVisibleTo와 같은 규칙으로 거른다 (차단 포함)
 * - 게시물 작성은 게시물 + 채팅방 + 방장 참여를 한 번에(create_post RPC)
 *
 * TODO(C): 사진 첨부(photo_uris)는 Storage 업로드 후 post_photos에 저장 (P2)
 */
import * as mock from '@/api/mock/posts';
import { sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import { ApiError, type CreatePostInput, type MyRequestStatus, type PostListItem } from '@/api/types';
import { MAX_ROOM_MEMBERS, POST_CONTENT_MAX, POST_TITLE_MAX } from '@/constants/config';
import { nextOccurrence, timeToMinutes } from '@/lib/time';
import type { Category, Weekday } from '@/types/db';

/** get_matching_posts RPC가 돌려주는 한 줄 */
type MatchingRow = {
  id: string;
  room_id: string;
  category: Category;
  title: string;
  content_preview: string;
  weekday: Weekday;
  start_time: string;
  end_time: string;
  start_at: string;
  end_at: string;
  thumbnail_url: string | null;
  author_id: string;
  author_nickname: string;
  author_photo_url: string | null;
  author_is_active: boolean;
  member_count: number;
  is_mine: boolean;
  my_request: MyRequestStatus;
  created_at: string;
};

/** S07: 카테고리별 매칭 목록 (최신순). 노출 규칙은 lib/visibility.ts와 같다 */
export async function getMatchingList(category: Category): Promise<PostListItem[]> {
  if (USE_MOCK_API) return mock.getMatchingList(category);
  const { data, error } = await sb().rpc('get_matching_posts', { p_category: category });
  if (error) throw toApiError(error, '게시물을 불러오지 못했어요');
  return (data as MatchingRow[]).map(toListItem);
}

/** S05: 카테고리 박스에 표시할 '내게 보이는 글 수' */
export async function getMatchingCounts(): Promise<Record<Category, number>> {
  if (USE_MOCK_API) return mock.getMatchingCounts();
  const categories: Category[] = ['meal', 'cafe', 'study', 'walk'];
  const lists = await Promise.all(categories.map((c) => getMatchingList(c)));
  return Object.fromEntries(categories.map((c, i) => [c, lists[i].filter((p) => !p.is_mine).length])) as Record<Category, number>;
}

/** S08 '게시': 게시물과 채팅방을 같이 만들고, 작성자가 방장이 된다 */
export async function createPost(input: CreatePostInput): Promise<{ post: PostListItem; room_id: string }> {
  if (USE_MOCK_API) return mock.createPost(input);
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || title.length > POST_TITLE_MAX) throw new ApiError(`제목은 1~${POST_TITLE_MAX}자로 입력해 주세요`, 'invalid_input');
  if (!content || content.length > POST_CONTENT_MAX) throw new ApiError(`내용은 1~${POST_CONTENT_MAX}자로 입력해 주세요`, 'invalid_input');
  if (timeToMinutes(input.range.end) <= timeToMinutes(input.range.start)) throw new ApiError('약속시간을 설정해 주세요', 'invalid_input');

  const { start_at, end_at } = nextOccurrence(input.range);
  const { data: postId, error } = await sb().rpc('create_post', {
    p_category: input.category,
    p_title: title,
    p_content: content,
    p_weekday: input.range.weekday,
    p_start_time: input.range.start,
    p_end_time: input.range.end,
    p_start_at: start_at,
    p_end_at: end_at,
  });
  if (error) throw toApiError(error, '게시물을 올리지 못했어요');

  // 내 글은 매칭 목록에 항상 보이므로 목록에서 찾아 같은 모양으로 돌려준다
  const post = (await getMatchingList(input.category)).find((p) => p.id === postId);
  if (!post) throw new ApiError('게시물을 올렸지만 불러오지 못했어요. 목록을 새로고침해 주세요', 'not_found');
  return { post, room_id: post.room_id };
}

/** 내 게시물 삭제 (채팅방 나가기 대신 방장이 쓰는 기능). 약속 확정 전에만 */
export async function deletePost(postId: string): Promise<void> {
  if (USE_MOCK_API) return mock.deletePost(postId);
  const { error } = await sb().rpc('delete_post', { p_post_id: postId });
  if (error) throw toApiError(error, '삭제할 수 없는 게시물이에요');
}

function toListItem(r: MatchingRow): PostListItem {
  return {
    id: r.id,
    room_id: r.room_id,
    category: r.category,
    title: r.title,
    content_preview: r.content_preview,
    range: { weekday: r.weekday, start: r.start_time, end: r.end_time },
    start_at: r.start_at,
    end_at: r.end_at,
    thumbnail_url: r.thumbnail_url,
    author: { id: r.author_id, nickname: r.author_nickname, photo_url: r.author_photo_url },
    author_is_active: r.author_is_active,
    member_count: r.member_count,
    max_members: MAX_ROOM_MEMBERS,
    is_mine: r.is_mine,
    my_request: r.my_request,
    created_at: r.created_at,
  };
}
