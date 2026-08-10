import Link from "next/link";
import { ReorderButton } from "./ReorderButton";
import { StatusPill } from "./StatusPill";
import { formatOrderTime, fulfillmentLabel, isSettled } from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import type { OrderWithItems } from "@/types/database";

/** 주문 목록. 누르면 상세로 간다 — 취소와 상태 추적은 거기서 한다. */
export function OrderList({
  orders,
  nextCursor,
  paged,
}: {
  orders: OrderWithItems[];
  /** 더 예전 주문이 있으면 그 커서. 없으면 null. */
  nextCursor?: string | null;
  /** 이전 주문 페이지를 보고 있는지. 빈 화면의 말이 달라진다. */
  paged?: boolean;
}) {
  if (orders.length === 0) {
    // 처음부터 주문이 없는 것과, 넘기다 끝에 닿은 것은 다른 상황이다.
    // 같은 말을 쓰면 단골이 "내 주문이 다 사라졌나" 하고 놀란다.
    return (
      <div className="pt-24 text-center">
        <p className="text-[15px]">
          {paged ? "더 예전 주문은 없어요" : "아직 주문한 내역이 없어요"}
        </p>
        <p className="pt-2 text-[13.5px] leading-relaxed text-ink-soft">
          {paged ? "최근 주문부터 다시 볼 수 있어요." : "오늘 만든 반찬을 둘러보세요."}
        </p>
        <Link
          href={paged ? "/orders" : "/"}
          className="mt-8 inline-flex h-12 items-center rounded-pill bg-olive px-6 text-[14px] text-white transition-colors duration-200 hover:bg-olive-deep"
        >
          {paged ? "최근 주문 보기" : "반찬 보러가기"}
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5 pb-10">
      {orders.map((order) => (
        <li
          key={order.id}
          className="relative rounded-card bg-white p-4 shadow-soft"
        >
          {/*
            카드 안에 재주문 버튼이 있어야 해서 카드 전체를 <Link> 로 감쌀 수 없다.
            대신 카드를 덮는 링크를 <li> 의 직계 자식으로 두고, 버튼만 그 위(z-10)에
            올린다. 카드 아무 데나 누르면 상세로, 버튼을 누르면 담기만 된다.

            링크를 요약 문구 안에 넣지 않은 이유: 그 문단에 truncate 가 걸려 있어
            overflow:hidden 이 덮개를 자를지 따져 봐야 한다. 직계 자식으로 두면
            자를 수 있는 조상이 아예 없어서 따질 것이 없어진다.
          */}
          <Link
            href={`/orders/${order.id}`}
            className="absolute inset-0 rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
          >
            <span className="sr-only">{summarize(order.items)} 주문 상세</span>
          </Link>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12.5px] text-ink-faint">
                {formatOrderTime(order.created_at)} ·{" "}
                {fulfillmentLabel(order.fulfillment)}
              </p>
              <p aria-hidden className="truncate pt-1 text-[15px]">
                {summarize(order.items)}
              </p>
            </div>
            <StatusPill status={order.status} />
          </div>

          <p className="pt-2.5 text-[15px] tabular-nums tracking-tight">
            {formatPrice(order.total)}
          </p>

          {/* 끝난 주문에만 붙인다. 아직 오는 중인 주문에 "다시 담기"가 있으면
              지금 주문이 어떻게 된 건지 헷갈린다. */}
          {isSettled(order.status) && order.items.length > 0 && (
            <div className="relative z-10 pt-3">
              <ReorderButton
                orderId={order.id}
                label="이 주문 다시 담기"
                className="tap-target w-full rounded-card border border-olive text-[14px] text-olive-deep transition-colors duration-200 hover:bg-olive-soft disabled:opacity-40"
              />
            </div>
          )}
        </li>
      ))}

      {/*
        반찬가게는 같은 걸 또 시키는 단골이 핵심인데, 예전에는 최근 50건만
        보이고 그게 끝이었다. 주 1회만 시켜도 1년이면 넘는다 — 재주문하려고
        찾으면 없다. 링크로 넘긴다. 서버가 다시 조회하므로 화면에 주문을
        쌓아 두지 않아도 되고, 뒤로가기도 자연스럽게 동작한다.
      */}
      <li className="flex justify-center gap-4 pt-2">
        {paged && (
          <Link
            href="/orders"
            className="inline-flex min-h-[48px] items-center px-4 text-[14px] text-ink-soft underline underline-offset-4"
          >
            최근 주문으로
          </Link>
        )}
        {nextCursor && (
          <Link
            href={`/orders?before=${encodeURIComponent(nextCursor)}`}
            className="inline-flex min-h-[48px] items-center px-4 text-[14px] text-ink-soft underline underline-offset-4"
          >
            이전 주문 더 보기
          </Link>
        )}
      </li>
    </ul>
  );
}

/** "김치찌개 외 2개" — 목록에서 한 줄로 알아볼 수 있게. */
function summarize(items: OrderWithItems["items"]): string {
  const [first, ...rest] = items;
  if (!first) return "주문 상품";
  return rest.length > 0 ? `${first.name} 외 ${rest.length}개` : first.name;
}
