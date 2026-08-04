// node --test 가 확장자 없는 지정자를 해석하지 못한다.
// 테스트에서 닿는 순수 모듈은 .ts 를 붙인다 (CLAUDE.md 참조).
import { formatPrice } from "../format.ts";
import { formatOrderTime, fulfillmentLabel, statusMeta } from "../orders.ts";

/**
 * 알림 문안. 순수 함수로 둔다 — 발송이 실패하는 건 나중에 고칠 수 있지만
 * 문안이 틀린 건 손님에게 그대로 가고, 틀렸는지는 테스트로만 알 수 있다.
 *
 * 손님에게 가는 문안에는 주소도 연락처도 넣지 않는다.
 * 알림톡은 잠금화면에도 뜨고 옆 사람이 볼 수 있다. 주문번호면 충분하다.
 */
export type NotifyKind =
  | "new_order"
  | "accepted"
  | "preparing"
  | "ready"
  | "delivering"
  | "completed"
  | "canceled";

export interface NotifyOrder {
  order_no: string;
  fulfillment: string;
  total: number;
  address_snapshot: string | null;
  pickup_at: string | null;
  created_at: string;
  items: { name: string; quantity: number }[];
}

/** "김치찌개 2개, 시금치나물 1개 외 2가지" */
export function summarizeItems(items: NotifyOrder["items"], limit = 3): string {
  if (items.length === 0) return "주문 상품";

  const shown = items
    .slice(0, limit)
    .map((item) => `${item.name} ${item.quantity}개`)
    .join(", ");

  const rest = items.length - limit;
  return rest > 0 ? `${shown} 외 ${rest}가지` : shown;
}

/** 매장이 받는 문안. 여기엔 주소가 들어가야 한다 — 배달을 가야 하니까. */
export function storeMessage(order: NotifyOrder): string {
  const where =
    order.fulfillment === "delivery"
      ? (order.address_snapshot ?? "주소 없음")
      : `픽업 ${formatOrderTime(order.pickup_at)}`;

  return [
    "[정, 담따] 새 주문이 들어왔어요",
    "",
    `주문번호: ${order.order_no}`,
    `수령방법: ${fulfillmentLabel(order.fulfillment)}`,
    `주문금액: ${formatPrice(order.total)}`,
    `주문시각: ${formatOrderTime(order.created_at)}`,
    "",
    summarizeItems(order.items),
    where,
  ].join("\n");
}

/**
 * 상태별 한 줄. new_order 는 매장용이라 여기 없고,
 * preparing 도 없다 — 접수 직후라 알림이 연달아 두 번 가면 성가시다.
 */
const CUSTOMER_LINE: Partial<Record<NotifyKind, (o: NotifyOrder) => string>> = {
  accepted: (o) =>
    o.fulfillment === "delivery"
      ? "주문을 받았어요. 준비되는 대로 출발할게요."
      : `주문을 받았어요. ${formatOrderTime(o.pickup_at)}에 오시면 됩니다.`,
  ready: () => "반찬이 준비됐어요. 매장에서 받아가세요.",
  delivering: () => "배달을 시작했어요. 곧 도착합니다.",
  completed: () => "이용해 주셔서 고맙습니다.",
  canceled: () => "주문이 취소되었어요. 결제하신 금액은 환불됩니다.",
};

/** 손님이 받는 문안. 알리지 않는 상태면 null. */
export function customerMessage(
  order: NotifyOrder,
  kind: NotifyKind,
): string | null {
  const line = CUSTOMER_LINE[kind];
  if (!line) return null;

  return [
    `[정, 담따] ${statusMeta(kind).label}`,
    "",
    `주문번호: ${order.order_no}`,
    line(order),
  ].join("\n");
}

/** 이 상태 변화에 손님에게 알릴지 */
export function shouldNotifyCustomer(kind: NotifyKind): boolean {
  return kind in CUSTOMER_LINE;
}
