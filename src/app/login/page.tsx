import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
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
      <p className="text-[14px] text-ink-soft">오늘의 반찬</p>
      <h1 className="pt-1.5 text-[26px] leading-tight">
        {forAdmin ? "사장님 로그인" : "반갑습니다"}
      </h1>
      <p className="pt-3 text-[13.5px] leading-relaxed text-ink-soft">
        {forAdmin
          ? "재고와 주문을 바로 관리할 수 있습니다."
          : "오늘 만든 반찬을 담고 주문하려면 로그인이 필요해요."}
      </p>

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
