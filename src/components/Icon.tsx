/**
 * 공통 아이콘 (디자인팀 UI의 선 아이콘). Expo에 기본으로 들어 있는 @expo/vector-icons를 쓴다 (Expo Go에서 동작).
 * 이름은 Feather 아이콘 이름이고, Feather에 없는 몇 개(식사 등)만 MaterialCommunityIcons에서 가져온다.
 */
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { colors } from '@/constants/theme';

/** Feather에 없어서 다른 묶음에서 가져오는 아이콘 */
const MCI = {
  utensils: 'silverware-fork-knife',
  gamepad: 'gamepad-variant-outline',
} as const;

export type IconName = keyof typeof MCI | React.ComponentProps<typeof Feather>['name'];

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 22, color = colors.primary }: Props) {
  if (name in MCI) {
    return <MaterialCommunityIcons name={MCI[name as keyof typeof MCI]} size={size} color={color} accessible={false} />;
  }
  return <Feather name={name as React.ComponentProps<typeof Feather>['name']} size={size} color={color} accessible={false} />;
}
