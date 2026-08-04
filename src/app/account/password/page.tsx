import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { getProfile } from "@/lib/queries";
import { PasswordForm } from "./PasswordForm";

export const metadata: Metadata = {
  title: "비밀번호 변경",
  robots: { index: false, follow: false },
};

export default function PasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-16">
      <Suspense fallback={<div className="h-40" aria-hidden />}>
        <PasswordBody />
      </Suspense>
    </main>
  );
}

async function PasswordBody() {
  // 재설정 링크로 들어오면 세션이 이미 생긴 상태다. 없으면 링크가 만료된 것.
  const profile = await getProfile();
  if (!profile) redirect("/login?next=%2Faccount%2Fpassword");

  return (
    <>
      <Wordmark size="sm" />
      <h1 className="pt-2 text-[26px] leading-tight">비밀번호 정하기</h1>
      <p className="pt-3 text-[13.5px] leading-relaxed text-ink-soft">
        새 비밀번호를 입력하면 바로 적용됩니다.
      </p>

      <PasswordForm />
    </>
  );
}
