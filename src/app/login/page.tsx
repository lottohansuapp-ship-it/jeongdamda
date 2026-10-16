import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { serverClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "로그인",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ next?: string; mode?: string; error?: string }>;
}

export default function LoginPage({ searchParams }: PageProps) {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-16">
      <Suspense fallback={<Skeleton />}>
        <LoginBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function LoginBody({ searchParams }: PageProps) {
  const { next, mode, error } = await searchParams;
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (user) redirect(target);

  const forAdmin = target.startsWith("/admin");

  return (
    <>
      {/* 로그인은 상호를 가장 크게 보여줄 자리다. "여기가 그 가게구나" 하는 화면 */}
      <div className="pb-7 text-center">
        <Wordmark as="h1" size="lg" />
        <p className="pt-5 text-[14.5px] leading-relaxed text-ink-soft">
          {forAdmin ? (
            <>
              사장님, 재고와 주문을 관리하시려면
              <br />
              로그인해 주세요.
            </>
          ) : (
            <>
              오늘 만든 반찬을 담고 주문하시려면
              <br />
              로그인이 필요해요.
            </>
          )}
        </p>
      </div>

      <LoginForm
        next={target}
        initialMode={mode === "signup" ? "signup" : "login"}
        kakaoEnabled={process.env.NEXT_PUBLIC_KAKAO_LOGIN_ENABLED === "1"}
        notice={
          error
            ? Object.hasOwn(CALLBACK_NOTICE, error)
              ? CALLBACK_NOTICE[error]
              : CALLBACK_NOTICE.default
            : null
        }
      />
    </>
  );
}

/*
  메일 인증·카카오 로그인에서 돌아오다 실패하면 auth/callback 이 ?error= 를 붙여 보낸다.
  예전엔 그 값을 읽지 않아 빈 로그인 화면만 떴다. 메일 앱 안 브라우저에서 링크를 열면
  흔히 나는 일이고, 그때도 인증 자체는 끝나 있는 경우가 많다. 문구는 정해 둔 것만 쓴다.
*/
const CALLBACK_NOTICE: Record<string, string> = {
  exchange_failed:
    "인증 링크를 다른 앱에서 여셔서 자동 로그인이 안 됐어요. 가입하신 정보로 아래에서 로그인해 주세요.",
  default: "로그인을 마치지 못했어요. 아래에서 다시 로그인해 주세요.",
};

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-6 w-1/3 rounded-pill bg-white" />
      <div className="h-12 rounded-card bg-white" />
      <div className="h-12 rounded-card bg-white" />
      <div className="h-12 rounded-card bg-white" />
    </div>
  );
}
