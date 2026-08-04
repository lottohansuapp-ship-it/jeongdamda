import Link from "next/link";
import { StatusPill } from "./StatusPill";
import { formatOrderTime, fulfillmentLabel } from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import type { OrderWithItems } from "@/types/database";

/** 주문 목록. 누르면 상세로 간다 — 취소와 상태 추적은 거기서 한다. */
export function OrderList({ orders }: { orders: OrderWithItems[] }) {
  if (orders.length === 0) {
    return (
      <div className="pt-24 text-center">
        <p className="text-[15px]">아직 주문한 내역이 없어요</p>
        <p className="pt-2 text-[13.5px] leading-relaxed text-ink-soft">
          오늘 만든 반찬을 둘러보세요.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-12 items-center rounded-pill bg-olive px-6 text-[14px] text-white transition-colors duration-200 hover:bg-olive-deep"
        >
          반찬 보러가기
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5 pb-10">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/orders/${order.id}`}
            className="block rounded-card bg-white p-4 shadow-soft transition-transform duration-200 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] text-ink-faint">
                  {formatOrderTime(order.created_at)} ·{" "}
                  {fulfillmentLabel(order.fulfillment)}
                </p>
                <p className="truncate pt-1 text-[15px]">
                  {summarize(order.items)}
                </p>
              </div>
              <StatusPill status={order.status} />
            </div>

            <p className="pt-2.5 text-[15px] tabular-nums tracking-tight">
              {formatPrice(order.total)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** "김치찌개 외 2개" — 목록에서 한 줄로 알아볼 수 있게. */
function summarize(items: OrderWithItems["items"]): string {
  const [first, ...rest] = items;
  if (!first) return "주문 상품";
  return rest.length > 0 ? `${first.name} 외 ${rest.length}개` : first.name;
}
