/**
 * 하단 네비게이션 (PRD 4.3): 혼자 / 홈 / 채팅 / 약속카드 — 담당: A
 * - 현재 탭은 primary 색으로 강조
 * - 약속카드 탭에 확인하지 않은 약속 수 숫자 배지 (PRD S15 알림)
 *   탭에 들어올 때, 앱으로 돌아올 때, 30초마다 다시 센다. 약속카드 탭을 열면 배지가 사라진다.
 * TODO(디자인): 아이콘은 피그마 받은 뒤 교체 (지금은 이모지)
 */
import { usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';

import { api } from '@/api';
import { colors } from '@/constants/theme';

const BADGE_REFRESH_MS = 30_000;

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}

// 탭 묶음에 처음 들어오면 '홈'이 열리게 한다
export const unstable_settings = { initialRouteName: 'home' };

export default function TabsLayout() {
  const pathname = usePathname();
  const onAppointments = pathname === '/appointments';
  const [unseen, setUnseen] = useState(0);

  /** 확인 안 한 약속 수를 다시 센다. 약속카드 탭을 보고 있으면 확인 처리하고 0 */
  const refreshBadge = useCallback(async (): Promise<number> => {
    try {
      if (onAppointments) {
        await api.appointments.markAppointmentsSeen();
        return 0;
      }
      return await api.appointments.getUnseenAppointmentCount();
    } catch {
      return 0; // 배지는 보조 정보라 실패해도 화면을 막지 않는다
    }
  }, [onAppointments]);

  useEffect(() => {
    let active = true;
    const update = () =>
      refreshBadge().then((n) => {
        if (active) setUnseen(n);
      });
    update();
    const timer = setInterval(update, BADGE_REFRESH_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => {
      active = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [refreshBadge, pathname]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.sub,
      }}
    >
      <Tabs.Screen name="solo" options={{ title: '혼자', tabBarIcon: () => <TabIcon emoji="🧍" /> }} />
      <Tabs.Screen name="home" options={{ title: '홈', tabBarIcon: () => <TabIcon emoji="🏠" /> }} />
      <Tabs.Screen name="chats" options={{ title: '채팅', tabBarIcon: () => <TabIcon emoji="💬" /> }} />
      <Tabs.Screen
        name="appointments"
        options={{
          title: '약속카드',
          tabBarIcon: () => <TabIcon emoji="📅" />,
          tabBarBadge: unseen > 0 ? unseen : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.alert },
          tabBarAccessibilityLabel: unseen > 0 ? `약속카드, 확인 안 한 약속 ${unseen}개` : '약속카드',
        }}
      />
    </Tabs>
  );
}
