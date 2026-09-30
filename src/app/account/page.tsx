import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AccountBoard } from "@/components/account/AccountBoard";
import { BottomNav } from "@/components/ui/BottomNav";
import { getAddresses, getMyCoupons, getProfile } from "@/lib/queries";

export const metadata: Metadata = {
  title: "내 정보",
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-[560px] flex-1 px-5 pb-10">
        <Suspense fallback={<Skeleton />}>
          <AccountBody />
        </Suspense>
      </main>
      <BottomNav active="account" />
    </>
  );
}

async function AccountBody() {
  const [profile, addresses, coupons] = await Promise.all([
    getProfile(),
    getAddresses(),
    getMyCoupons(),
  ]);
  if (!profile) redirect("/login?next=%2Faccount");

  return (
    <AccountBoard profile={profile} addresses={addresses} coupons={coupons} />
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 pt-24" aria-hidden>
      <div className="h-[120px] rounded-card bg-white shadow-soft" />
      <div className="h-[160px] rounded-card bg-white shadow-soft" />
    </div>
  );
}
