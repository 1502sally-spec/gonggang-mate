/**
 * 혼자 지도(S09)의 지도 부분 — 휴대폰용 (iPhone: Apple 지도, Android: Google 지도)
 * 11/2 결정: 네이버 지도 대신 react-native-maps. 장소 상세는 S10의 '네이버 지도에서 보기'로 연다.
 * 웹 브라우저에서는 PlaceMap.web.tsx(목록)가 대신 쓰인다.
 */
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import type { Place } from '@/api';
import { SCHOOL_CENTER, SCHOOL_MAP_DELTA } from '@/constants/config';
import { colors, fontSize } from '@/constants/theme';

export type PlaceMapProps = {
  places: Place[];
  /** 핀 색 (카테고리 강조색) */
  color: string;
  /** 위치 권한이 있으면 true → 내 위치 표시 */
  showsUserLocation: boolean;
  onSelect: (place: Place) => void;
};

export function PlaceMap({ places, color, showsUserLocation, onSelect }: PlaceMapProps) {
  return (
    <MapView
      style={styles.map}
      initialRegion={{ ...SCHOOL_CENTER, latitudeDelta: SCHOOL_MAP_DELTA, longitudeDelta: SCHOOL_MAP_DELTA }}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={showsUserLocation}
      accessibilityLabel="학교 주변 지도"
    >
      {places.map((place) => (
        <Marker
          key={place.id}
          coordinate={{ latitude: place.lat, longitude: place.lng }}
          onPress={() => onSelect(place)}
          accessibilityLabel={`${place.name}, ${place.address}`}
        >
          {/* 카테고리 색 핀 + 가게 이름 라벨 */}
          <View style={styles.marker}>
            <Text style={styles.label} numberOfLines={1}>
              {place.name}
            </Text>
            <View style={[styles.pin, { backgroundColor: color }]} />
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  marker: { alignItems: 'center' },
  // 디자인팀 UI: 보라 이름표 + 흰 테두리 보라 핀
  label: {
    maxWidth: 140,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 3,
    borderRadius: 8,
    backgroundColor: colors.primaryBright,
    color: colors.white,
    fontSize: fontSize.caption,
    fontWeight: '800',
    overflow: 'hidden',
  },
  pin: { width: 20, height: 20, borderRadius: 10, borderWidth: 5, borderColor: colors.white },
});
