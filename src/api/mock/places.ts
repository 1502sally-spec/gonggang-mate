/** 가짜 장소 (api/places.ts의 USE_MOCK_API 모드). Supabase 연결 후 지운다. */
import type { Place } from '@/api/types';
import { copy, db, delay } from '@/api/mock/store';
import type { PlaceCategory } from '@/types/db';

export async function getPlaces(category: PlaceCategory): Promise<Place[]> {
  await delay(200);
  return copy(db.places.filter((p) => p.category === category && p.is_active));
}
