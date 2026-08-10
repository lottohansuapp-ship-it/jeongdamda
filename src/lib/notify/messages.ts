// node --test 가 확장자 없는 지정자를 해석하지 못한다.
// 테스트에서 닿는 순수 모듈은 .ts 를 붙인다 (CLAUDE.md 참조).
import { formatPrice } from "../format.ts";
import { formatOrderTime, fulfillmentLabel } from "../orders.ts";

/**
 * 알림 문안. 순수 함수로 둔다 — 발송이 실패하는 건 나중에 고칠 수 있지만
 * 문안이 틀린 건 손님에게 그대로 가고, 틀렸는지는 테스트로만 알 수 있다.
 *
 * 손님에게 가는 문안에는 주소도 연락처도 넣지 않는다.
 * 알림톡은 잠금화면에도 뜨고 옆 사람이 볼 수 있다. 주문번호면 충분하다.
 */
export type NotifyKind =
  // 매장이 받는 것
  | "new_order"
  // 손님이 받는 것. 결제가 확정된 순간 한 통 나간다.
  | "order_placed"
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
 * 손님이 받는 알림은 둘뿐이다 (사장님 결정, 2026-08).
 *
 * 예전에는 접수·준비완료·배달중·완료까지 단계마다 보냈다. 배민이 하는 방식인데
 * 여기서는 값이 안 맞았다. 알림톡은 건당 요금이라 주문 하나에 네다섯 통이면
 * 하루 20건에 월 3~4만 원이 나가는데, 정작 손님이 알아야 할 내용은
 * "접수됐다" 와 "취소됐다" 둘이다. 중간 단계는 앱 화면에 실시간으로 보인다.
 *
 * 취소를 남긴 이유는 돈 때문이다. 매장이 재료가 떨어져 취소했는데 손님이
 * 모르면, 오지 않을 반찬을 기다리다 결국 전화를 건다. 환불되는 것도 모른다.
 * 그 전화 한 통이 알림톡보다 비싸다.
 */
/**
 * 알림 제목. statusMeta 를 쓰면 안 된다 — order_placed 는 주문 상태가 아니라
 * 알림 종류라서, 모르는 값으로 취급돼 "취소됨" 이 제목으로 나간다.
 * 손님이 주문하자마자 "취소됨" 카톡을 받게 되는 것이라 반드시 여기서 정한다.
 */
const CUSTOMER_TITLE: Partial<Record<NotifyKind, string>> = {
  order_placed: "주문 완료",
  canceled: "주문 취소",
};

const CUSTOMER_LINE: Partial<Record<NotifyKind, (o: NotifyOrder) => string>> = {
  order_placed: (o) =>
    o.fulfillment === "delivery"
      ? "주문이 접수됐어요. 준비되는 대로 배달해 드릴게요."
      : `주문이 접수됐어요. ${formatOrderTime(o.pickup_at)}에 오시면 됩니다.`,
  canceled: () => "주문이 취소되었어요. 결제하신 금액은 환불됩니다.",
};

/** 손님이 받는 문안. 알리지 않는 상태면 null. */
export function customerMessage(
  order: NotifyOrder,
  kind: NotifyKind,
): string | null {
  const line = CUSTOMER_LINE[kind];
  const title = CUSTOMER_TITLE[kind];
  if (!line || !title) return null;

  return [
    `[정, 담따] ${title}`,
    "",
    `주문번호: ${order.order_no}`,
    line(order),
  ].join("\n");
}

/** 이 상태 변화에 손님에게 알릴지 */
export function shouldNotifyCustomer(kind: NotifyKind): boolean {
  return kind in CUSTOMER_LINE;
}
