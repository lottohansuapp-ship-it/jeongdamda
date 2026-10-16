import { ReorderButton } from "@/components/orders/ReorderButton";
import { getLastOrder } from "@/lib/queries";
import { formatOrderTime } from "@/lib/orders";

/**
 * 홈 맨 위 「지난번 주문 다시 담기」. 반찬가게 손님은 대부분 같은 걸 또 시킨다.
 * 예전엔 주문 내역 탭 → 주문 → 다시 담기 세 번을 눌러야 했다.
 *
 * 쿠키를 읽으므로 반드시 <Suspense> 안에서 쓴다 (홈의 프리렌더를 지킨다).
 * 로그인 안 했거나 결제한 주문이 없으면 아무것도 그리지 않는다.
 */
export async function LastOrderCard() {
  const last = await getLastOrder();
  if (!last) return null;

  const [first, ...rest] = last.names;
  const summary = rest.length > 0 ? `${first} 외 ${rest.length}가지` : first;

  return (
    // 안내 문구(ReorderButton 의 status)는 두 칸을 다 쓰게 한다.
    <section
      aria-label="지난번 주문"
      className="mb-5 grid grid-cols-[1fr_auto] items-center gap-x-3 rounded-card bg-cream p-4 [&>[role=status]]:col-span-2"
    >
      <div className="min-w-0">
        <p className="text-[12.5px] text-clay-deep">
          지난번 주문 · {formatOrderTime(last.createdAt)}
        </p>
        <p className="truncate pt-0.5 text-[14.5px]">{summary}</p>
      </div>
      <ReorderButton
        orderId={last.id}
        label="그대로 다시 담기"
        className="h-12 shrink-0 rounded-pill bg-olive px-4 text-[14px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-50"
      />
    </section>
  );
}
