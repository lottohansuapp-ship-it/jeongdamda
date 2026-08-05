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
import { useLiveRefresh } from "@/lib/use-live-refresh";
import type { OrderWithItems } from "@/types/database";

type Tab = "live" | "done" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "진행 중" },
  { key: "done", label: "완료·취소" },
  { key: "all", label: "전체" },
];

/**
 * 취소 사유. 손님 주문내역에 그대로 보이므로 손님이 읽을 말로 쓴다.
 * 예전에는 "매장에서 취소" 하나로 고정이라, 손님은 왜 취소됐는지 알 수 없었다.
 */
const CANCEL_REASONS = [
  "재료가 떨어졌어요",
  "오늘 영업이 어려워요",
  "주문하신 수량을 준비하기 어려워요",
  "손님 요청으로 취소",
] as const;

const RANGE_LABEL: Record<string, string> = {
  today: "오늘",
  week: "7일",
  month: "30일",
};

export function OrderBoard({
  orders,
  truncated,
  range,
}: {
  orders: OrderWithItems[];
  /** 상한에 걸려 잘렸는지. 조용히 자르면 사장님이 주문을 놓친다. */
  truncated: boolean;
  range: string;
}) {
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

  /**
   * 새 주문이 들어오면 목록에 나타난다. 사장님이 화면을 켜두고 기다리는 자리다.
   * 버튼을 누르는 중에는 멈춘다 — 그 사이 서버 값이 오면 낙관적 표시가 되돌아간다.
   */
  // 필터를 걸지 않는다 — 사장님은 모든 주문을 봐야 하고, 누가 무엇을 받을지는
  // RLS(orders_admin_all)가 가른다.
  useLiveRefresh({ enabled: busyId === null });

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
          진행 중 {liveCount}건 · {RANGE_LABEL[range] ?? "오늘"} {orders.length}건
        </p>

        {/* 기간은 서버에서 자른다. 링크라 새로 조회해 온다 —
            화면에서 거르면 결국 전부 가져와야 한다. */}
        <nav className="flex gap-1.5 pt-3">
          {Object.entries(RANGE_LABEL).map(([key, label]) => (
            <Link
              key={key}
              href={`/admin/orders?range=${key}`}
              aria-current={key === range ? "page" : undefined}
              className={`rounded-[10px] px-3 py-2 text-[13px] leading-none transition-colors duration-200 ${
                key === range ? "bg-ink text-white" : "bg-white text-ink-soft"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {truncated && (
          <p className="pt-2.5 text-[12.5px] leading-relaxed text-[#a96f14]">
            주문이 많아 일부만 보여드리고 있어요. 기간을 좁히면 전부 보입니다.
          </p>
        )}
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
              onCancel={(reason) =>
                run(order, "canceled", () => cancelOrder(order.id, reason))
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
  onCancel: (reason: string) => void;
}) {
  const [picking, setPicking] = useState(false);
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
            <span className={isDelivery ? "text-clay-deep" : "text-olive-deep"}>
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
              onClick={() => setPicking(true)}
              className="tap-target shrink-0 rounded-card border border-line px-4 text-[14px] text-ink-faint transition-colors duration-200 hover:border-danger hover:text-danger disabled:opacity-40"
            >
              취소
            </button>
          )}
        </div>
      )}

      {picking && (
        <div className="mt-2.5 rounded-[12px] border border-danger/30 bg-danger/5 p-3">
          <p className="pb-2 text-[12.5px] text-ink-soft">
            취소 사유를 골라 주세요. 손님 주문내역에 그대로 보입니다.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CANCEL_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={busy}
                onClick={() => {
                  setPicking(false);
                  onCancel(reason);
                }}
                className="rounded-pill border border-line bg-white px-3 py-2 text-[12.5px] text-ink-soft transition-colors duration-200 hover:border-danger hover:text-danger disabled:opacity-40"
              >
                {reason}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="rounded-pill px-3 py-2 text-[12.5px] text-ink-faint"
            >
              그만두기
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
