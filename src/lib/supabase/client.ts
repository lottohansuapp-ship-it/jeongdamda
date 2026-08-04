"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * 브라우저 클라이언트. **Realtime 구독 하나에만 쓴다.**
 *
 * 데이터를 읽고 쓰는 일은 계속 서버가 한다. 브라우저에서 직접 조회하기 시작하면
 * RLS 를 두 군데서 신경 써야 하고 캐시 전략도 갈라진다.
 * 여기서 하는 일은 "무언가 바뀌었다"는 신호를 받는 것뿐이고,
 * 바뀐 내용은 그 신호를 받은 뒤 서버에 다시 물어본다.
 *
 * createBrowserClient 를 쓰는 이유는 로그인 쿠키를 읽기 위해서다.
 * 익명으로 구독하면 RLS 에 걸려 아무 이벤트도 못 받는다.
 *
 * 한 번만 만든다. 화면마다 새로 만들면 웹소켓이 그만큼 열린다.
 */
let cached: ReturnType<typeof createBrowserClient> | null = null;

export function browserClient() {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  cached = createBrowserClient(url, key);
  return cached;
}
