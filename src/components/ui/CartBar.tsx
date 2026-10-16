import { getCart } from "@/lib/queries";
import { CartBarLink } from "./CartBarLink";

/**
 * 담긴 게 있을 때만 하단 탭 위에 뜨는 장바구니 바. 서버 컴포넌트이고 쿠키를 읽으므로
 * 반드시 <Suspense> 안에서 쓴다 (CartBadge 와 같은 이유 — 홈의 프리렌더를 지킨다).
 *
 * 못 읽으면 그리지 않는다. 바 하나 때문에 홈 전체가 오류 화면이 되면 안 된다.
 * 금액은 살 수 있는 줄만 더한 화면 표시용이다 — 결제 금액은 place_order 가 정한다.
 */
export async function CartBar() {
  const cart = await getCart().catch(() => null);
  if (!cart || cart.itemCount <= 0) return null;

  return <CartBarLink count={cart.itemCount} subtotal={cart.subtotal} />;
}
