"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusPill } from "@/components/orders/StatusPill";
import { advanceOrder, cancelOrder } from "@/lib/order-actions";
import {
  canAdminCancel,
  formatOrderTime,
  fulfillmentLabel,
  isLive,
  nextStatuses,
  statusMeta,
} from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import type { OrderWithItems } from "@/types/database";

type Tab = "live" | "done" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "진행 중" },
  { key: "done", label: "완료·취소" },
  { key: "all", label: "전체" },
];

export function OrderBoard({ orders }: { orders: OrderWithItems[] }) {
  const [tab, setTab] = useState<Tab>("live");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * 서버 값을 그대로 그리지 않고 복사해서 쓴다.
   *
   * 예전에는 버튼을 누를 때마다 router.refresh() 로 주문 100건과 그 품목을 전부
   * 다시 받아 다시 그렸다. 사장님은 상태 하나를 바꿨을 뿐인데 왕복이 여러 번 붙는다.
   * 지금은 화면을 먼저 바꾸고 서버에 보낸다. 실패하면 되돌리고 이유를 띄운다.
   */
  const [rows, setRows] = useState(orders);
  const [seen, setSeen] = useState(orders);
  if (seen !== orders) {
    setSeen(orders);
    setRows(orders);
  }

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  const liveCount = rows.filter((order) => isLive(order.status)).length;
  const visible = rows.filter((order) => {
    if (tab === "all") return true;
    return tab === "live" ? isLive(order.status) : !isLive(order.status);
  });

  function patch(id: string, status: string) {
    setRows((list) =>
      list.map((order) => (order.id === id ? { ...order, status } : order)),
    );
  }

  async function run(
    order: OrderWithItems,
    status: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    const previous = order.status;
    setError(null);
    setBusyId(order.id);
    patch(order.id, status);

    const result = await action();
    setBusyId(null);
    if (!result.ok) {
      patch(order.id, previous);
      setError(result.error ?? "처리하지 못했어요.");
    }
  }

  return (
    <div className="pb-16">
      <header className="pb-4 pt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[24px] leading-tight">주문 관리</h1>
          <Link
            href="/admin"
            className="text-[13px] text-ink-faint underline underline-offset-4"
          >
            재고 관리
          </Link>
        </div>
        <p className="pt-1.5 text-[13px] text-ink-soft">
          진행 중 {liveCount}건 · 전체 {orders.length}건
        </p>
      </header>

      <div className="sticky top-0 z-20 -mx-5 mb-3 bg-canvas/95 px-5 py-2.5 backdrop-blur-md">
        <div className="flex gap-1.5">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              className={`h-10 rounded-pill px-4 text-[13.5px] transition-colors duration-200 ${
                tab === key
                  ? "bg-olive text-white"
                  : "border border-line bg-white text-ink-soft"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-2.5 rounded-card bg-white p-3.5 text-[13px] text-danger shadow-soft"
        >
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="pt-20 text-center text-[14px] text-ink-soft">
          {tab === "live" ? "진행 중인 주문이 없어요" : "표시할 주문이 없어요"}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              busy={busyId === order.id}
              onAdvance={(to) =>
                run(order, to, () => advanceOrder(order.id, to))
              }
              onCancel={() =>
                run(order, "canceled", () =>
                  cancelOrder(order.id, "매장에서 취소"),
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({
  order,
  busy,
  onAdvance,
  onCancel,
}: {
  order: OrderWithItems;
  busy: boolean;
  onAdvance: (to: string) => void;
  onCancel: () => void;
}) {
  const isDelivery = order.fulfillment === "delivery";
  // 지금 누를 수 있는 버튼은 규칙이 정한다. 안 쓰는 버튼은 아예 그리지 않는다.
  const next = nextStatuses(order.status, order.fulfillment);

  return (
    <li className="rounded-card bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink-faint">
            {order.order_no} · {formatOrderTime(order.created_at)}
          </p>
          <p className="pt-1 text-[15px]">
            <span className={isDelivery ? "text-clay" : "text-olive-deep"}>
              {fulfillmentLabel(order.fulfillment)}
            </span>
            <span className="pl-2">{order.receiver_name}</span>
          </p>
          <a
            href={`tel:${order.receiver_phone}`}
            className="inline-flex pt-0.5 text-[13px] text-ink-faint underline underline-offset-4"
          >
            {order.receiver_phone}
          </a>
        </div>
        <StatusPill status={order.status} />
      </div>

      <p className="pt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
        {isDelivery
          ? (order.address_snapshot ?? "주소 없음")
          : `픽업 ${formatOrderTime(order.pickup_at)}`}
      </p>

      <ul className="mt-3 space-y-1 rounded-[12px] bg-canvas p-3">
        {order.items.map((item) => (
          <li
            key={item.id}
            className="flex items-baseline justify-between gap-3 text-[13.5px]"
          >
            <span className="min-w-0 truncate">{item.name}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">
              ×{item.quantity}
            </span>
          </li>
        ))}
      </ul>

      {order.memo && (
        <p className="mt-2.5 rounded-[12px] bg-cream p-3 text-[13px] leading-relaxed">
          요청 · {order.memo}
        </p>
      )}

      <p className="pt-3 text-[16px] tabular-nums tracking-tight">
        {formatPrice(order.total)}
        {isDelivery && order.delivery_fee > 0 && (
          <span className="pl-1.5 text-[12.5px] text-ink-faint">
            (배달비 {formatPrice(order.delivery_fee)})
          </span>
        )}
      </p>

      {(next.length > 0 || canAdminCancel(order.status)) && (
        <div className="flex gap-2 pt-3.5">
          {next.map((to) => (
            <button
              key={to}
              type="button"
              disabled={busy}
              onClick={() => onAdvance(to)}
              className="tap-target flex-1 rounded-card bg-olive px-4 text-[14px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-40"
            >
              {statusMeta(to).label}
            </button>
          ))}
          {canAdminCancel(order.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm("주문을 취소할까요? 재고는 되돌아갑니다.")) onCancel();
              }}
              className="tap-target shrink-0 rounded-card border border-line px-4 text-[14px] text-ink-faint transition-colors duration-200 hover:border-danger hover:text-danger disabled:opacity-40"
            >
              취소
            </button>
          )}
        </div>
      )}
    </li>
  );
}
