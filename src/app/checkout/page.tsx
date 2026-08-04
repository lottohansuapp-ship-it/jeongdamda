import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckoutBoard } from "@/components/checkout/CheckoutBoard";
import { getAddresses, getCart, getProfile, getStore } from "@/lib/queries";
import { pickupSlots, storeOpenState, toSeoulClock } from "@/lib/store";
import { isProfileComplete } from "@/types/database";

export const metadata: Metadata = {
  title: "주문서",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5">
      <header className="pb-5 pt-10">
        <h1 className="text-[26px] leading-tight">주문서</h1>
      </header>

      <Suspense fallback={<Skeleton />}>
        <CheckoutBody />
      </Suspense>
    </main>
  );
}

async function CheckoutBody() {
  const [profile, cart, addresses, store] = await Promise.all([
    getProfile(),
    getCart(),
    getAddresses(),
    getStore(),
  ]);

  if (!profile) redirect("/login?next=%2Fcheckout");
  // 주문에는 이름과 연락처가 반드시 필요하다. place_order 도 없으면 거절한다.
  if (!isProfileComplete(profile)) redirect("/signup/phone?next=%2Fcheckout");
  if (cart.lines.length === 0 && cart.orphanIds.length === 0) redirect("/cart");
  if (!store.settings) redirect("/cart");

  // 시계는 캐시 밖에서 읽는다. 'use cache' 안에서 읽으면 슬롯이 그 시각에 얼어붙는다.
  const clock = toSeoulClock(new Date());

  return (
    <CheckoutBoard
      cart={cart}
      profile={profile}
      addresses={addresses}
      settings={store.settings}
      areas={store.areas}
      slots={pickupSlots(store.settings, clock)}
      openState={storeOpenState(store.settings, clock)}
    />
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-[96px] rounded-card bg-white shadow-soft" />
      <div className="h-[180px] rounded-card bg-white shadow-soft" />
      <div className="h-[140px] rounded-card bg-white shadow-soft" />
    </div>
  );
}
