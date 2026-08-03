import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 로그인 세션이 붙은 클라이언트. Server Action / Route Handler 전용.
 * cookies()를 읽으므로 'use cache' 안에서는 절대 쓸 수 없다 — publicClient()를 써라.
 */
export async function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || key === "PASTE_ANON_KEY_HERE") {
    throw new Error("Supabase 환경변수가 없습니다. .env.local 을 확인하세요.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component에서 호출되면 쓰기가 막힌다. 세션 갱신은 미들웨어가 처리한다.
        }
      },
    },
  });
}
