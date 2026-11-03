/**
 * 혼자 지도(S09) — 웹 브라우저용 대체 화면 (개발 확인용).
 * react-native-maps는 웹을 지원하지 않아서, 브라우저에서는 지도 자리만 보여 준다. 장소는 아래 '추천 장소' 목록에서 확인한다.
 */
import { StyleSheet, Text, View } from 'react-native';

import type { PlaceMapProps } from '@/components/map/PlaceMap';
import { colors, fontSize } from '@/constants/theme';

export type { PlaceMapProps };

export function PlaceMap({ places }: PlaceMapProps) {
  return (
    <View style={styles.box} accessibilityLabel="지도 (휴대폰 앱에서 보여요)">
      <Text style={styles.text}>지도는 휴대폰 앱에서 보여요{'\n'}핀 {places.length}개</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8ECF2' },
  text: { color: colors.sub, fontSize: fontSize.caption + 1, textAlign: 'center' },
});
