/**
 * 혼자 지도 장소 (S09 혼자, S10 핀포인트 팝업)
 * 분류는 meal(식당)·cafe(카페)·entertainment(엔터테인먼트). 쓰지 않는 장소(is_active = false)는 RLS가 거른다
 */
import * as mock from '@/api/mock/places';
import { sb, toApiError, USE_MOCK_API } from '@/api/supabaseHelpers';
import type { Place } from '@/api/types';
import type { PlaceCategory } from '@/types/db';

export async function getPlaces(category: PlaceCategory): Promise<Place[]> {
  if (USE_MOCK_API) return mock.getPlaces(category);
  const { data, error } = await sb().from('places').select('*').eq('category', category).order('name');
  if (error) throw toApiError(error, '장소를 불러오지 못했어요');
  return data as Place[];
}
