/**
 * 첫 사용 가이드를 봤는지 (11/6 결정 10번: 기기 기준으로 한 번만)
 * 이 기기의 localStorage(expo-sqlite)에 저장한다. 서버에는 저장하지 않는다.
 */
import 'expo-sqlite/localStorage/install';

const KEY = 'gonggang.guideSeen.v1';

export function hasSeenGuide(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true; // 저장소를 못 읽으면 매번 가이드가 뜨지 않게 본 것으로 친다
  }
}

export function markGuideSeen(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // 저장 실패는 넘어간다 (다음 실행 때 한 번 더 보일 뿐)
  }
}
