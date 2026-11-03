/**
 * 하단 네비게이션 — 디자인팀 UI(11/3 결정 5번): 혼자놀기 / 홈 / 채팅 (3개)
 * 약속카드(S15)는 탭에서 빠지고 홈(S05)의 약속카드 영역 → '전체 보기'로 들어간다. 확인 안 한 약속 배지도 홈에 있다.
 */
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { colors } from '@/constants/theme';

function tabIcon(name: IconName) {
  function TabBarIcon({ color }: { color: ColorValue | null | undefined }) {
    return <Icon name={name} size={24} color={typeof color === 'string' ? color : colors.sub} />;
  }
  return TabBarIcon;
}

// 탭 묶음에 처음 들어오면 '홈'이 열리게 한다
export const unstable_settings = { initialRouteName: 'home' };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.sub,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.line, height: 64, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="solo" options={{ title: '혼자놀기', tabBarIcon: tabIcon('smile') }} />
      <Tabs.Screen name="home" options={{ title: '홈', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="chats" options={{ title: '채팅', tabBarIcon: tabIcon('message-square') }} />
    </Tabs>
  );
}
