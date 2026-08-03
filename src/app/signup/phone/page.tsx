import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getProfile } from "@/lib/queries";
import { PhoneForm } from "./PhoneForm";

export const metadata: Metadata = {
  title: "연락처 입력",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default function PhonePage({ searchParams }: PageProps) {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-16">
      <Suspense fallback={<div className="h-40" aria-hidden />}>
        <PhoneBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function PhoneBody({ searchParams }: PageProps) {
  const { next } = await searchParams;
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(target)}`);

  return (
    <>
      <p className="text-[14px] text-ink-soft">거의 다 됐어요</p>
      <h1 className="pt-1.5 text-[26px] leading-tight">연락처를 알려주세요</h1>
      <p className="pt-3 text-[13.5px] leading-relaxed text-ink-soft">
        주문에 문제가 생겼을 때 사장님이 연락드릴 번호예요.
        <br />
        광고 문자는 보내지 않습니다.
      </p>

      <PhoneForm
        next={target}
        defaultName={profile.name ?? ""}
        defaultPhone={profile.phone ?? ""}
      />
    </>
  );
}
