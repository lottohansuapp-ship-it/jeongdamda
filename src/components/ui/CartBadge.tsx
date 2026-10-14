import { getCart } from "@/lib/queries";

/**
 * 하단 탭의 장바구니 개수. 서버 컴포넌트이고 쿠키를 읽으므로
 * 반드시 <Suspense> 안에서 쓴다 — 안 그러면 모든 페이지가 요청 렌더로 떨어진다.
 */
export async function CartBadge() {
  // 숫자 배지 하나 못 읽었다고 모든 화면을 오류 화면으로 바꿀 수는 없다.
  // 장바구니 화면에 들어가면 그쪽이 오류를 제대로 알린다.
  const cart = await getCart().catch(() => null);
  if (!cart || cart.itemCount <= 0) return null;

  return (
    <span
      aria-label={`장바구니에 ${cart.itemCount}개`}
      className="absolute -right-2 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-clay-deep px-1 text-[10px] leading-none text-white"
    >
      {cart.itemCount > 99 ? "99+" : cart.itemCount}
    </span>
  );
}
