import type { Metadata } from "next";
import { Suspense } from "react";
import { CartBoard } from "@/components/cart/CartBoard";
import { getCart, getStore } from "@/lib/queries";
import { deliveryOpenState, toSeoulClock } from "@/lib/store";
import { connection } from "next/server";

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
  // 지금이 배달 시간인지 보려면 시계를 읽어야 한다. 프리렌더 중에는 못 읽는다.
  await connection();

  // 매장 설정은 캐시된 조회다 (STORE_TAG). 최소주문까지 얼마 남았는지 보여주려고 함께 읽는다.
  const [cart, store] = await Promise.all([getCart(), getStore()]);

  /*
    배달 가능 여부를 여기서 판단해서 내려보낸다.

    예전에는 주문서에 가서야 "배달 시간이 아니에요" 를 만났다. 담고, 주문서를
    열고, 배달을 고르고 나서야 막히는 것이다. 장바구니에서 미리 말해 주면
    손님은 픽업으로 바로 간다.

    시계는 서버 것을 쓴다. 기기 시계는 틀릴 수 있고, 실제로 주문을 받을지
    정하는 것도 서버다 (0023 의 delivery_open_now).
  */
  const deliveryOpen = store.settings
    ? deliveryOpenState(store.settings, toSeoulClock(new Date()))
    : null;

  return (
    <CartBoard
      cart={cart}
      settings={store.settings}
      deliveryOpen={deliveryOpen?.open ?? false}
    />
  );
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
