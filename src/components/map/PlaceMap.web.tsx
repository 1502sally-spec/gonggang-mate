/**
 * 혼자 지도(S09) — 웹 브라우저용 대체 화면.
 * react-native-maps는 웹을 지원하지 않아서, 브라우저에서는 장소 목록으로 보여 준다 (개발 확인용).
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PlaceMapProps } from '@/components/map/PlaceMap';
import { colors, fontSize, MIN_TOUCH, spacing } from '@/constants/theme';

export type { PlaceMapProps };

export function PlaceMap({ places, color, onSelect }: PlaceMapProps) {
  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={styles.note}>지도는 휴대폰 앱에서 보여요. 브라우저에서는 목록으로 보여 줘요.</Text>
      {places.map((place) => (
        <Pressable
          key={place.id}
          accessibilityRole="button"
          accessibilityLabel={`${place.name}, ${place.address}`}
          onPress={() => onSelect(place)}
          style={styles.row}
        >
          <View style={[styles.pin, { backgroundColor: color }]} />
          <View style={styles.texts}>
            <Text style={styles.name}>{place.name}</Text>
            <Text style={styles.address}>{place.address}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm },
  note: { color: colors.sub, fontSize: fontSize.caption },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    padding: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  pin: { width: 14, height: 14, borderRadius: 7 },
  texts: { flex: 1 },
  name: { color: colors.ink, fontSize: fontSize.body, fontWeight: '700' },
  address: { color: colors.sub, fontSize: fontSize.caption },
});
