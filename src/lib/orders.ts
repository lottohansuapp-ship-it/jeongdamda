/**
 * 주문 상태 규칙. 화면마다 if 문을 흩뿌리면 곧 서로 어긋난다.
 * 손님 화면·관리자 화면·서버 액션이 모두 여기를 본다.
 */
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "accepted"
  | "preparing"
  | "ready"
  | "delivering"
  | "completed"
  | "canceled";

interface StatusMeta {
  /** 손님에게 보이는 말 */
  label: string;
  /** 지금 무슨 일이 일어나는지 한 줄 */
  hint: string;
  tone: "wait" | "live" | "done" | "dead";
}

const META: Record<OrderStatus, StatusMeta> = {
  pending_payment: {
    label: "결제 대기",
    hint: "결제를 마치면 매장에 주문이 전달돼요",
    tone: "wait",
  },
  paid: { label: "결제 완료", hint: "매장에서 확인하고 있어요", tone: "live" },
  accepted: { label: "주문 접수", hint: "곧 준비를 시작해요", tone: "live" },
  preparing: { label: "준비 중", hint: "반찬을 담고 있어요", tone: "live" },
  ready: { label: "픽업 준비 완료", hint: "매장에서 찾아가세요", tone: "live" },
  delivering: { label: "배달 중", hint: "곧 도착해요", tone: "live" },
  completed: { label: "완료", hint: "이용해 주셔서 고맙습니다", tone: "done" },
  canceled: { label: "취소됨", hint: "주문이 취소되었어요", tone: "dead" },
};

export function statusMeta(status: string): StatusMeta {
  return META[status as OrderStatus] ?? META.canceled;
}

/** 사장님이 다음에 누를 수 있는 버튼. 수령 방법에 따라 갈린다. */
export function nextStatuses(
  status: string,
  fulfillment: string,
): OrderStatus[] {
  switch (status) {
    case "paid":
      return ["accepted"];
    case "accepted":
      return ["preparing"];
    case "preparing":
      return fulfillment === "delivery" ? ["delivering"] : ["ready"];
    case "ready":
    case "delivering":
      return ["completed"];
    default:
      return [];
  }
}

/**
 * 손님이 직접 취소할 수 있는 시점 (D23).
 * 사장님이 접수하면 포장이 시작될 수 있으므로 그 뒤로는 매장에 연락해야 한다.
 */
export function canCustomerCancel(status: string): boolean {
  return status === "pending_payment" || status === "paid";
}

/** 사장님은 완료·취소가 아니면 언제든 취소할 수 있다 (재고는 되돌린다). */
export function canAdminCancel(status: string): boolean {
  return status !== "completed" && status !== "canceled";
}

/** 진행 중인 주문인지 — 관리자 목록에서 위로 올릴지 판단한다. */
export function isLive(status: string): boolean {
  return statusMeta(status).tone === "live";
}

/** 상태 전이가 규칙에 맞는지. 서버가 마지막으로 확인한다. */
export function canTransition(
  from: string,
  to: string,
  fulfillment: string,
): boolean {
  return nextStatuses(from, fulfillment).includes(to as OrderStatus);
}

export function fulfillmentLabel(fulfillment: string): string {
  return fulfillment === "delivery" ? "배달" : "픽업";
}
