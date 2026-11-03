import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { colors } from '@/constants/theme';

type Props = {
  nickname: string;
  photoUrl?: string | null;
  size?: number;
};

/** 원형 프로필 사진. 사진이 없으면 사람 아이콘을 보여 준다 (디자인팀 UI). */
export function Avatar({ nickname, photoUrl, size = 40 }: Props) {
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={circle} accessibilityLabel={`${nickname} 프로필 사진`} />;
  }

  return (
    <View style={[styles.fallback, circle]} accessibilityLabel={`${nickname} 프로필`}>
      <Icon name="user" size={size * 0.5} color={colors.primaryBright} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.primaryTint,
    borderWidth: 1.5,
    borderColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
