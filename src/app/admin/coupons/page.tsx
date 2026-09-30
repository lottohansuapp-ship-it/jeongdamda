import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CouponBoard } from "@/components/admin/CouponBoard";
import { getAdminCoupons, getCustomers } from "@/lib/queries";

export const metadata: Metadata = {
  title: "쿠폰",
  robots: { index: false, follow: false },
};

export default function AdminCouponsPage() {
  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5">
      <Suspense fallback={<Skeleton />}>
        <Body />
      </Suspense>
    </main>
  );
}

async function Body() {
  // 로그인 쿠키를 읽는 조회다. 프리렌더 중에는 돌 수 없다.
  await connection();

  const [coupons, customers] = await Promise.all([
    getAdminCoupons(),
    getCustomers(),
  ]);

  return <CouponBoard coupons={coupons} customers={customers} />;
}

function Skeleton() {
  return (
    <div className="space-y-2.5 pt-24" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="h-[180px] rounded-card bg-white shadow-soft" />
      ))}
    </div>
  );
}
