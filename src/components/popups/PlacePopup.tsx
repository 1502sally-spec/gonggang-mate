/**
 * S10 핀포인트 팝업 — 담당: A. 혼자 지도(S09)에서 핀을 누르면 아래에서 올라온다.
 * PRD: 상호명, 카테고리 칩, 주소, 네이버 지도 링크.
 * - '네이버 지도에서 보기' → 네이버 지도 앱(설치돼 있으면) 또는 웹으로 해당 가게 페이지 열기
 * - 닫기(X) 또는 바깥 영역을 누르면 닫힘
 */
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Place } from '@/api';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/popups/BottomSheet';
import { colors, fontSize, MIN_TOUCH, placeCategoryInfo, spacing } from '@/constants/theme';

type Props = {
  place: Place | null;
  onClose: () => void;
};

export function PlacePopup({ place, onClose }: Props) {
  const info = place ? placeCategoryInfo[place.category] : null;

  const openNaverMap = async () => {
    if (!place?.naver_map_url) return;
    try {
      await Linking.openURL(place.naver_map_url);
    } catch {
      Alert.alert('네이버 지도를 열지 못했어요');
    }
  };

  return (
    <BottomSheet visible={place !== null} onClose={onClose}>
      {place && info ? (
        <View style={styles.body}>
          <View style={styles.header}>
            <Text style={styles.name} accessibilityRole="header">
              {place.name}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={styles.close} hitSlop={8}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <View style={[styles.chip, { backgroundColor: info.background }]}>
            <Text style={[styles.chipText, { color: info.accent }]}>{info.label}</Text>
          </View>
          <Text style={styles.address}>{place.address}</Text>
          <Button label="네이버 지도에서 보기" onPress={openNaverMap} disabled={!place.naver_map_url} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, color: colors.ink, fontSize: 20, fontWeight: '900' },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.sub, fontSize: 20 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  chipText: { fontSize: fontSize.caption, fontWeight: '700' },
  address: { color: colors.sub, fontSize: fontSize.body, marginBottom: spacing.sm },
});
