import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 로그인 세션이 붙은 클라이언트. Server Action / Route Handler 전용.
 * cookies()를 읽으므로 'use cache' 안에서는 절대 쓸 수 없다 — publicClient()를 써라.
 *
 * React cache() 로 감싼다. 한 요청 안에서 getProfile · getCart · getAddresses 가
 * 각자 클라이언트를 만들면 쿠키를 세 번 읽고 세션도 세 번 푼다.
 */
export const serverClient = cache(async function createClient() {
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
});

/**
 * 로그인한 손님의 id. 없으면 null.
 *
 * getUser() 를 쓰지 않는 이유가 성능의 전부다. getUser() 는 JWT 를 들고
 * Supabase Auth 서버까지 왕복해서 확인한다. 화면 하나 그리는 데 프로필·장바구니·
 * 배송지가 각자 부르면 왕복이 세 번이고, 버튼을 누르면 액션에서 한 번 더,
 * 그리고 다시 그리면서 또 세 번이다.
 *
 * getClaims() 는 이 프로젝트의 ES256 서명키로 JWT 를 **로컬에서** 검증한다.
 * 공개키(JWKS)는 auth-js 가 프로세스 전역에 캐시하므로 첫 요청 이후 네트워크가 없다.
 * 대칭키(HS256) 프로젝트라면 알아서 getUser() 로 되돌아가니 안전하다.
 *
 * 위조 걱정은 없다. 서명 검증이 실패하면 error 가 오고, 설령 여기가 뚫려도
 * 실제 데이터는 Postgres 의 RLS 가 같은 JWT 로 다시 판단한다.
 */
export const currentUserId = cache(async function readUserId(): Promise<
  string | null
> {
  const db = await serverClient();
  const { data, error } = await db.auth.getClaims();
  if (error || !data) return null;

  const sub = data.claims.sub;
  return typeof sub === "string" && sub ? sub : null;
});
