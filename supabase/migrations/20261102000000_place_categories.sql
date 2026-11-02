-- 혼자 지도 장소 분류에 엔터테인먼트 추가 (11/2 결정, src/types/db.ts PlaceCategory)
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run (처음 한 번만)

alter table public.places drop constraint places_category_check;
alter table public.places add constraint places_category_check
  check (category in ('meal', 'cafe', 'entertainment'));
