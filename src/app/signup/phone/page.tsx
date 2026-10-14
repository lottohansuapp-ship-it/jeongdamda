import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { identityEnabled } from "@/lib/identity";
import { PORTONE_IDENTITY_CHANNEL_KEY } from "@/lib/payments/config";
import { getProfile, getStore, isIdentityVerified } from "@/lib/queries";
import { IdentityForm } from "./IdentityForm";
import { PhoneForm } from "./PhoneForm";

export const metadata: Metadata = {
  title: "연락처 입력",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{
    next?: string;
    /** 휴대폰에서 본인인증 창이 돌려보낼 때 포트원이 붙여 준다 */
    identityVerificationId?: string;
    code?: string;
    agreed?: string;
  }>;
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
  const params = await searchParams;
  const { next } = params;
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const profile = await getProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(target)}`);

  const { settings } = await getStore();
  if (identityEnabled(settings?.require_identity, PORTONE_IDENTITY_CHANNEL_KEY)) {
    // 이미 인증했고 번호도 남아 있으면 이 화면에 머물 이유가 없다
    if ((await isIdentityVerified()) && profile.phone) redirect(target);

    return (
      <>
        <p className="text-[14px] text-ink-soft">거의 다 됐어요</p>
        <h1 className="pt-1.5 text-[26px] leading-tight">본인인증을 해 주세요</h1>
        <p className="pt-3 text-[13.5px] leading-relaxed text-ink-soft">
          한 분이 한 계정만 쓰실 수 있게 확인해요.
          <br />
          인증하시면 신규가입 쿠폰을 바로 드려요.
        </p>

        <IdentityForm
          next={target}
          userId={profile.id}
          returned={{
            id: params.identityVerificationId ?? null,
            failed: Boolean(params.code),
            agreed: params.agreed === "1",
          }}
        />
      </>
    );
  }

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
