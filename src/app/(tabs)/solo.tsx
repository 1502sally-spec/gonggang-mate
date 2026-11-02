/**
 * S09 혼자 — 담당: A
 * PRD: 제목 "혼자", 카테고리 중 하나만 선택(기본 식당).
 * 11/2 결정: 카테고리는 식당·카페·엔터테인먼트 3개 (PRD의 식사/카페 2개에서 변경).
 * 아래에 지도. 학교 주변을 기본 위치로, 위치 권한을 허용하면 내 위치도 표시.
 * 선택한 카테고리의 장소만 핀으로 표시(카테고리 색 핀 + 가게 이름 라벨). 핀을 누르면 S10 팝업.
 * - [AC] 카테고리를 바꾸면 핀이 즉시 바뀐다
 * - [AC] 위치 권한을 거부해도 학교 중심 지도로 정상 동작
 * 11/2 결정: 지도는 react-native-maps (네이버 지도 대신). 장소 데이터는 places 테이블.
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type Place } from '@/api';
import { Button } from '@/components/Button';
import { PlaceMap } from '@/components/map/PlaceMap';
import { PlacePopup } from '@/components/popups/PlacePopup';
import { colors, fontSize, MIN_TOUCH, PLACE_CATEGORIES, placeCategoryInfo, spacing } from '@/constants/theme';
import type { PlaceCategory } from '@/types/db';


export default function SoloScreen() {
  const [category, setCategory] = useState<PlaceCategory>('meal');
  // 모든 카테고리를 한 번에 불러 두고, 바꿀 때는 바로 핀만 바꾼다
  const [places, setPlaces] = useState<Record<PlaceCategory, Place[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all(PLACE_CATEGORIES.map((c) => api.places.getPlaces(c)))
      .then(([meal, cafe, entertainment]) => {
        if (!active) return;
        setPlaces({ meal, cafe, entertainment });
        setError(null);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : '장소를 불러오지 못했어요');
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // 위치 권한: 거부해도 학교 중심 지도로 그대로 동작한다
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then(({ granted }) => setLocationGranted(granted))
      .catch(() => setLocationGranted(false));
  }, []);

  const info = placeCategoryInfo[category];
  const current = places?.[category] ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title} accessibilityRole="header">
        혼자
      </Text>
      <View style={styles.tabs} accessibilityRole="tablist">
        {PLACE_CATEGORIES.map((key) => {
          const on = key === category;
          const c = placeCategoryInfo[key];
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setCategory(key);
                setSelected(null);
              }}
              style={[styles.tab, on && { backgroundColor: c.background, borderColor: c.accent }]}
            >
              <Text style={[styles.tabText, on && { color: c.accent, fontWeight: '900' }]} numberOfLines={1}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.mapArea}>
        {error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
            <Button label="다시 시도" variant="secondary" onPress={() => setReloadKey((k) => k + 1)} />
          </View>
        ) : !places ? (
          <ActivityIndicator style={styles.center} color={colors.primary} accessibilityLabel="불러오는 중" />
        ) : (
          <>
            <PlaceMap places={current} color={info.accent} showsUserLocation={locationGranted} onSelect={setSelected} />
            {current.length === 0 ? (
              <View style={styles.emptyBadge} pointerEvents="none">
                <Text style={styles.emptyText}>아직 등록된 {info.label} 장소가 없어요</Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      <PlacePopup place={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.ink, fontSize: fontSize.title, fontWeight: '900', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { color: colors.ink, fontSize: fontSize.body },
  mapArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  error: { color: colors.danger, fontSize: fontSize.body },
  emptyBadge: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.white,
  },
  emptyText: { color: colors.sub, fontSize: fontSize.caption },
});
