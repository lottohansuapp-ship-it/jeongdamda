import type { Metadata } from "next";
import { Suspense } from "react";
import { CartBoard } from "@/components/cart/CartBoard";
import { BottomNav } from "@/components/ui/BottomNav";
import { getCart, getStore } from "@/lib/queries";

export const metadata: Metadata = {
  title: "장바구니",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <>
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5">
      <header className="pb-5 pt-10">
        <h1 className="text-[26px] leading-tight">장바구니</h1>
      </header>

      <Suspense fallback={<Skeleton />}>
        <CartBody />
      </Suspense>
    </main>
    <BottomNav active="cart" />
    </>
  );
}

async function CartBody() {
  // 매장 설정은 캐시된 조회다 (STORE_TAG). 최소주문까지 얼마 남았는지 보여주려고 함께 읽는다.
  const [cart, store] = await Promise.all([getCart(), getStore()]);
  return <CartBoard cart={cart} settings={store.settings} />;
}

function Skeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[124px] rounded-card bg-white shadow-soft" />
      ))}
    </div>
  );
}
