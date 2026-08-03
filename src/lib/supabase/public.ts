import "server-only";
import { createClient } from "@supabase/supabase-js";

const PLACEHOLDER = "PASTE_ANON_KEY_HERE";

/**
 * 환경변수 누락 검사. 반드시 'use cache' 스코프 **바깥**에서 먼저 호출한다.
 * 캐시 안에서 던진 예외는 바깥 try/catch로 잡히지 않고 프리렌더를 통째로 깬다.
 */
export function envError(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || key === PLACEHOLDER) {
    return "Supabase 환경변수가 설정되지 않았습니다. .env.local 의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 확인하세요.";
  }
  return null;
}

/**
 * 쿠키를 읽지 않는 읽기 전용 클라이언트.
 * 'use cache' 안에서 쓰려면 요청 스코프 API(cookies)를 건드리면 안 된다.
 */
export function publicClient() {
  const missing = envError();
  if (missing) throw new Error(missing);

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
