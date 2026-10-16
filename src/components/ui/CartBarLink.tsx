"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { formatPrice } from "@/lib/format";

/**
 * 주문서의 「추가 주문」 으로 목록에 나온 손님인지 표시한다.
 * 그런 손님에게는 하단 바가 「주문서로 돌아가기」 가 된다 — 예전엔 하나 더 담고
 * 장바구니 → 주문서 작성하기를 다시 눌러야 했고, 어르신은 돌아가는 길을 잃었다.
 */
const RETURN_KEY = "jeongdamda-return-checkout";

export function markReturnToCheckout() {
  try {
    sessionStorage.setItem(RETURN_KEY, "1");
  } catch {
    // 막힌 브라우저면 장바구니로 보낸다 — 거기서도 주문서로 갈 수 있다.
  }
}

export function clearReturnToCheckout() {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // 위와 같다
  }
}

export function readReturn(): boolean {
  try {
    return sessionStorage.getItem(RETURN_KEY) === "1";
  } catch {
    return false;
  }
}

const noop = () => () => {};

/**
 * 하단 탭 바로 위의 「장바구니 보기 · 3개 · 12,500원」.
 * 담은 직후 다음에 할 일이 화면에 보이게 한다(배민 방식). 예전엔 담겼다는 표시가
 * 1.4초 아이콘뿐이고, 장바구니로 가는 길은 작은 하단 탭 배지였다.
 */
export function CartBarLink({ count, subtotal }: { count: number; subtotal: number }) {
  // 서버에서 그릴 땐 "장바구니 보기" 로, 브라우저에서 표시를 읽어 바꾼다.
  const toCheckout = useSyncExternalStore(noop, readReturn, () => false);

  return (
    <Link
      href={toCheckout ? "/checkout" : "/cart"}
      className="mx-3 mt-2 flex min-h-12 items-center justify-between gap-3 rounded-card bg-olive px-4 text-white shadow-lift transition-colors duration-200 hover:bg-olive-deep"
    >
      <span className="text-[14.5px]">
        {toCheckout ? "주문서로 돌아가기" : "장바구니 보기"}
      </span>
      <span className="text-[13.5px] tabular-nums">
        {count}개 · {formatPrice(subtotal)}
      </span>
    </Link>
  );
}
