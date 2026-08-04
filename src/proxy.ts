import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LOGIN_PATH = "/login";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 환경변수가 없으면 리다이렉트 루프를 만들지 않고 통과시킨다. 페이지가 설정 안내를 띄운다.
  if (!url || !key || key === "PASTE_ANON_KEY_HERE") return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() 가 아니라 getClaims() 다. 이 가드는 서버 액션 POST 와 그 뒤의
  // router.refresh() GET 에도 매번 걸린다. 여기서 Auth 서버까지 왕복하면
  // 버튼 한 번에 왕복이 두세 번 더 붙는다. getClaims 는 ES256 서명을 로컬에서 검증하고,
  // 만료된 세션의 갱신은 안쪽 getSession() 이 그대로 처리한다.
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    const { pathname, search } = request.nextUrl;
    const login = new URL(LOGIN_PATH, request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return response;
}

// 로그인이 필요한 경로만. /login 은 여기 없어야 리다이렉트 루프가 안 생긴다.
export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/cart/:path*",
    "/checkout/:path*",
    "/orders/:path*",
  ],
};
