/**
 * S12 채팅방 — 담당: (미정)
 * PRD: 실시간 메시지, 프로필 사진 탭 → S13, 방장에게만 '약속 확정' → S14, '게임' 버튼 → S16.
 * 10/31 회의 추가: 방장에게 입장 요청 수락/거절, 약속 확정 시 대기 중인 요청은 자동 거절 (최대 20명).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { Button } from '@/components/Button';
import { ConfirmAppointmentPopup } from '@/components/popups/ConfirmAppointmentPopup';
import { MateInfoPopup } from '@/components/popups/MateInfoPopup';
import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export default function ChatRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [mateId, setMateId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const closeConfirm = useCallback(() => setConfirmOpen(false), []);

  return (
    <ScreenPlaceholder id="S12" title="채팅방" description={`방 번호: ${roomId}`}>
      <Button label="프로필 사진 → S13 메이트 정보" variant="secondary" onPress={() => setMateId('demo-user')} />
      <Button label="약속 확정(방장) → S14" variant="secondary" onPress={() => setConfirmOpen(true)} />
      <Button
        label="게임 → S16"
        variant="secondary"
        onPress={() => router.push({ pathname: '/game/[roomId]', params: { roomId } })}
      />

      <MateInfoPopup userId={mateId} onClose={() => setMateId(null)} />
      <ConfirmAppointmentPopup
        visible={confirmOpen}
        roomId={roomId}
        onClose={closeConfirm}
        onConfirmed={() => {
          setConfirmOpen(false);
          router.push('/appointments');
        }}
      />
    </ScreenPlaceholder>
  );
}
