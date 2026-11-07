// 회원 탈퇴 (docs/TASKS_C_1106.md C5, docs/DECISIONS.md 피드백 7)
// 호출: POST, 헤더 Authorization: Bearer <로그인 토큰>. 성공하면 { ok: true }
// 실패하면 { error: '화면에 보여 줄 문장', code: ApiError code } 와 4xx/5xx 상태 코드
// 배포: npx supabase functions deploy delete-account
//
// 관리자 키(service_role / secret key)는 Supabase가 이 함수에 넣어 주는 환경변수에서만 읽는다.
// 앱 코드·저장소·.env에는 절대 넣지 않는다.
//
// 처리 순서
// 1. 토큰으로 사용자 확인
// 2~3. prepare_account_deletion: 메시지에 탈퇴 표시, 모든 방에서 나가기(방장이면 넘기기), 넘기지 못한 내 글은 deleted
// 4. Storage avatars/{uid}/ 파일 모두 삭제
// 5. auth 사용자 삭제 → public.users 행도 함께 삭제 (on delete cascade)

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 새 API 키(SUPABASE_SECRET_KEYS의 default)를 먼저 쓰고, 없으면 예전 service_role 키
function getAdminKey(): string {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    try {
      const key = JSON.parse(secretKeys).default;
      if (typeof key === 'string' && key) return key;
    } catch {
      // 아래 예전 키로 넘어간다
    }
  }
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacyKey) return legacyKey;
  throw new Error('관리자 키 환경변수가 없어요');
}

const FAILED = '탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: '잘못된 요청이에요', code: 'invalid_input' });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json(401, { error: '로그인이 필요해요', code: 'not_logged_in' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, getAdminKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. 토큰으로 사용자 확인
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) return json(401, { error: '로그인이 필요해요', code: 'not_logged_in' });
  const uid = userData.user.id;

  // 2~3. 방 나가기·방장 넘기기·글 정리 (DB 함수 하나에서 한 번에)
  const { error: prepareError } = await admin.rpc('prepare_account_deletion', { p_user_id: uid });
  if (prepareError) {
    console.error('prepare_account_deletion', prepareError);
    return json(500, { error: FAILED, code: 'not_allowed' });
  }

  // 4. 프로필 사진 파일 삭제 (list는 한 번에 최대 100개라 빌 때까지 반복)
  for (let i = 0; i < 50; i++) {
    const { data: files, error: listError } = await admin.storage.from('avatars').list(uid, { limit: 100 });
    if (listError) {
      console.error('avatars list', listError);
      return json(500, { error: FAILED, code: 'not_allowed' });
    }
    if (!files || files.length === 0) break;
    const { error: removeError } = await admin.storage.from('avatars').remove(files.map((f) => `${uid}/${f.name}`));
    if (removeError) {
      console.error('avatars remove', removeError);
      return json(500, { error: FAILED, code: 'not_allowed' });
    }
  }

  // 5. 계정 삭제
  const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
  if (deleteError) {
    console.error('deleteUser', deleteError);
    return json(500, { error: FAILED, code: 'not_allowed' });
  }

  return json(200, { ok: true });
});
