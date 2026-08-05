import type { Metadata } from "next";
import { Suspense } from "react";
import { CartBoard } from "@/components/cart/CartBoard";
import { getCart, getStore } from "@/lib/queries";

export const metadata: Metadata = {
  title: "장바구니",
  robots: { index: false, follow: false },
};

/**
 * 하단 탭을 두지 않는다.
 *
 * 예전에는 <BottomNav> 를 그렸는데, 장바구니의 금액·주문 바가 fixed z-40 이라
 * 탭(sticky z-30, 64px)을 통째로 덮었다. 그리기는 하는데 보이지도 눌리지도
 * 않는 상태였다. 안 보이는 것을 그리는 것보다 안 그리는 편이 정직하다.
 *
 * 주문서(/checkout)도 같은 이유로 탭이 없다. 돌아가는 길은 본문의
 * "메뉴 더 담기" 가 맡는다.
 */
export default function CartPage() {
  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5">
      <header className="pb-5 pt-10">
        <h1 className="text-[26px] leading-tight">장바구니</h1>
      </header>

      <Suspense fallback={<Skeleton />}>
        <CartBody />
      </Suspense>
    </main>
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
