/**
 * S09 혼자놀기 — 담당: A (디자인팀 UI 반영)
 * PRD: 카테고리 중 하나만 선택(기본 식당). 11/2 결정: 식당·카페·엔터테인먼트 3개, 지도는 react-native-maps.
 * - 위: 지도. 학교 주변을 기본 위치로, 위치 권한을 허용하면 내 위치도 표시. 선택한 카테고리의 장소만 핀(보라 핀 + 이름표)
 * - 아래: 추천 장소 목록 (디자인팀 UI). 핀이나 목록을 누르면 S10 팝업
 * - [AC] 카테고리를 바꾸면 핀이 즉시 바뀐다 / 위치 권한을 거부해도 학교 중심 지도로 정상 동작
 * - 도보 시간은 표시하지 않는다 (11/3 결정 13번)
 */
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, ApiError, type Place } from '@/api';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { PlaceMap } from '@/components/map/PlaceMap';
import { PlacePopup } from '@/components/popups/PlacePopup';
import { colors, fontSize, PLACE_CATEGORIES, placeCategoryInfo, radius, spacing } from '@/constants/theme';
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
        혼자놀기
      </Text>
      <View style={styles.tabs} accessibilityRole="tablist">
        {PLACE_CATEGORIES.map((key) => {
          const on = key === category;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setCategory(key);
                setSelected(null);
              }}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                {placeCategoryInfo[key].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Button label="다시 시도" variant="secondary" size="sm" onPress={() => setReloadKey((k) => k + 1)} />
        </View>
      ) : !places ? (
        <ActivityIndicator style={styles.center} color={colors.primary} accessibilityLabel="불러오는 중" />
      ) : (
        <FlatList
          data={current}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              <View style={styles.map}>
                <PlaceMap places={current} color={colors.primary} showsUserLocation={locationGranted} onSelect={setSelected} />
              </View>
              <Text style={styles.sectionTitle}>추천 장소</Text>
            </>
          }
          ListEmptyComponent={<Text style={styles.empty}>아직 등록된 {info.label} 장소가 없어요</Text>}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${item.address}`}
              onPress={() => setSelected(item)}
              style={({ pressed }) => [styles.placeCard, pressed && styles.pressed]}
            >
              <View style={styles.pinCircle}>
                <Icon name="map-pin" size={18} color={colors.primary} />
              </View>
              <View style={styles.placeText}>
                <Text style={styles.placeName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.placeAddress} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
              <View style={styles.tag}>
                <Text style={styles.tagText}>{info.label}</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      <PlacePopup place={selected} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.primary, fontSize: fontSize.title + 2, fontWeight: '900', paddingHorizontal: spacing.lg - 4, paddingTop: spacing.lg },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg - 4, paddingVertical: spacing.md - 4 },
  tab: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.lineSoft, justifyContent: 'center' },
  tabOn: { backgroundColor: colors.primary },
  tabText: { color: colors.sub, fontSize: fontSize.body - 1, fontWeight: '700' },
  tabTextOn: { color: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  error: { color: colors.danger, fontSize: fontSize.body },
  list: { paddingBottom: spacing.lg, gap: spacing.sm },
  map: { height: 300, marginBottom: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: fontSize.body + 1, fontWeight: '800', paddingHorizontal: spacing.lg - 4, marginBottom: spacing.xs },
  empty: { color: colors.sub, fontSize: fontSize.body - 1, textAlign: 'center', marginTop: spacing.md },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md - 4,
    marginHorizontal: spacing.lg - 4,
    padding: spacing.md - 2,
    borderRadius: radius.control + 2,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  pressed: { opacity: 0.85 },
  pinCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  placeText: { flex: 1, gap: 2 },
  placeName: { color: colors.ink, fontSize: fontSize.body, fontWeight: '800' },
  placeAddress: { color: colors.sub, fontSize: fontSize.caption + 1 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.primaryTint },
  tagText: { color: colors.primary, fontSize: fontSize.caption, fontWeight: '800' },
});
