import { getCart } from "@/lib/queries";

/**
 * 하단 탭의 장바구니 개수. 서버 컴포넌트이고 쿠키를 읽으므로
 * 반드시 <Suspense> 안에서 쓴다 — 안 그러면 모든 페이지가 요청 렌더로 떨어진다.
 */
export async function CartBadge() {
  const cart = await getCart();
  if (cart.itemCount <= 0) return null;

  return (
    <span
      aria-label={`장바구니에 ${cart.itemCount}개`}
      className="absolute -right-2 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-clay px-1 text-[10px] leading-none text-white"
    >
      {cart.itemCount > 99 ? "99+" : cart.itemCount}
    </span>
  );
}
