/**
 * 혼자 지도 장소 (S09 혼자, S10 핀포인트 팝업)
 *
 * TODO(C): places 테이블. 분류는 meal(식당)·cafe(카페)·entertainment(엔터테인먼트) — DB check 제약도 바꿔야 함 (11/2 결정)
 */
import type { Place } from '@/api/types';
import type { PlaceCategory } from '@/types/db';
import { copy, db, delay } from '@/api/mock/store';

export async function getPlaces(category: PlaceCategory): Promise<Place[]> {
  await delay(200);
  return copy(db.places.filter((p) => p.category === category && p.is_active));
}
