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
  searchParams: Promise<{ next?: string; mode?: string }>;
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
  const { next, mode } = await searchParams;
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
      />
    </>
  );
}

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
