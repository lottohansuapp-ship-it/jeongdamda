import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";

/**
 * 카카오 OAuth 와 이메일 인증 링크가 모두 여기로 돌아온다.
 * 카카오는 휴대폰 번호를 주지 않으므로 프로필이 비어 있으면 /signup/phone 으로 보낸다 (D18).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  const raw = searchParams.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const db = await serverClient();
  const { error } = await db.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_session`);
  }

  // 비밀번호 재설정 링크. 세션은 생겼지만 아직 새 비밀번호를 안 정했다.
  // 여기서 홈으로 보내면 정할 화면이 없어 재설정이 끝나지 않는다.
  if (searchParams.get("type") === "recovery") {
    return NextResponse.redirect(`${origin}/account/password`);
  }

  const { data: profile } = await db
    .from("profiles")
    .select("name, phone")
    .eq("id", user.id)
    .maybeSingle();

  const complete = Boolean(profile?.name?.trim() && profile?.phone?.trim());

  return NextResponse.redirect(
    complete
      ? `${origin}${next}`
      : `${origin}/signup/phone?next=${encodeURIComponent(next)}`,
  );
}
