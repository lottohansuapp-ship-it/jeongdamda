import { formatPrice } from "./format.ts";

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
/**
 * 사장님이 다음에 누를 수 있는 버튼.
 *
 * 예전에는 접수 → 준비중 → 배달중(픽업준비완료) → 완료 로 네 번 눌러야 했다.
 * 하루 20건이면 80번이다. 그 단계들은 원래 손님에게 진행 상황을 알리려고
 * 만든 것인데, 손님 알림을 "주문 완료" 와 "취소" 둘로 줄이면서 아무한테도
 * 안 알려지는 상태가 됐다. 사장님만 네 번 누르고 볼 사람은 없는 셈이다.
 *
 * 그래서 "끝났다" 하나만 남긴다. 결제되면 목록에 뜨고 알림톡도 이미 갔으니
 * "봤다"(접수)를 따로 누를 이유도 약하다.
 *
 * 옛 주문이 preparing/ready/delivering 에 멈춰 있을 수 있어 그 상태에서도
 * 완료로 갈 길은 남겨 둔다 — 화면에서 사라지지 않게.
 */
export function nextStatuses(status: string): OrderStatus[] {
  switch (status) {
    case "paid":
    case "accepted":
    case "preparing":
    case "ready":
    case "delivering":
      return ["completed"];
    default:
      return [];
  }
}

/**
 * 결제 후 이만큼 지나면 반찬을 담기 시작한다. 그 뒤 취소는 전화로 받는다.
 * 진짜로 막는 곳은 DB 의 begin_cancel(0030) 이고, 여기는 버튼을 감추는 용도다.
 */
export const CANCEL_WINDOW_MINUTES = 10;
const CANCEL_WINDOW_MS = CANCEL_WINDOW_MINUTES * 60_000;

/**
 * 손님이 직접 취소할 수 있는가.
 * 예전엔 「완료」 직전까지 앱에서 전액 취소가 됐다 — 다 싸 둔 반찬도.
 */
export function canCustomerCancel(
  status: string,
  paidAt: string | null,
  now: number = Date.now(),
): boolean {
  if (status === "pending_payment") return true;
  if (status !== "paid") return false;
  if (!paidAt) return true;
  return now - Date.parse(paidAt) <= CANCEL_WINDOW_MS;
}

/** 앱에서 취소할 수 있는 마지막 시각. "10분 남음" 처럼 세지 않는다 — 시각은 늙지 않는다. */
export function cancelDeadline(paidAt: string | null): string | null {
  if (!paidAt) return null;
  return new Date(Date.parse(paidAt) + CANCEL_WINDOW_MS).toISOString();
}

interface RefundFacts {
  status: string;
  total: number;
  paid_at: string | null;
  refunded_at: string | null;
  refund_amount: number | null;
  vbank_account: string | null;
}

/**
 * 취소된 주문에서 손님이 제일 먼저 묻는 것 — "내 돈은?" 에 답한다.
 * 예전엔 「취소됨 · 사유」 뿐이라 매장으로 전화가 왔다.
 */
export function refundNotice(order: RefundFacts): string | null {
  if (order.status !== "canceled") return null;
  // 환불 기록을 먼저 본다 — 결제가 늦게 들어와 자동 환불된 주문은 paid_at 이 비어 있을 수 있다.
  if (!order.paid_at && !order.refunded_at) return "결제 전에 취소돼서 빠져나간 돈은 없어요.";

  const amount = formatPrice(order.refund_amount ?? order.total);
  if (order.vbank_account) {
    return order.refunded_at
      ? `입금하신 ${amount} 환불을 마쳤어요.`
      : "입금하신 금액의 환불은 매장으로 전화 주시면 확인해서 처리해 드려요.";
  }
  return order.refunded_at
    ? `${amount}을 환불했어요. 카드는 3~7영업일 안에 결제 취소로 돌아가요(간편결제는 보통 더 빨라요).`
    : "환불을 처리하고 있어요. 하루가 지나도 그대로면 매장에 전화 주세요.";
}

/** 손님에게 보이는 상태. 계좌를 받은 결제 대기는 「입금 대기」 다 — 할 일이 다르다. */
export function displayStatus(status: string, hasVbankAccount: boolean): StatusMeta {
  if (status === "pending_payment" && hasVbankAccount) {
    return { label: "입금 대기", hint: "아래 계좌로 입금하면 주문이 확정돼요", tone: "wait" };
  }
  return statusMeta(status);
}

/** 사장님은 완료·취소가 아니면 언제든 취소할 수 있다 (재고는 되돌린다). */
export function canAdminCancel(status: string): boolean {
  return status !== "completed" && status !== "canceled";
}

/**
 * 손님에게 보여줄 진행 단계. 수령 방법에 따라 네 번째 칸의 말이 갈린다.
 * pending_payment 와 canceled 는 단계가 아니라 별도 상태라 여기 없다.
 */
export function progressSteps(): OrderStatus[] {
  // 단계가 둘뿐이라 진행 막대도 두 칸이다. 다섯 칸을 그려 놓고 가운데
  // 셋이 영원히 안 채워지면 손님은 주문이 멈춘 줄 안다.
  return ["paid", "completed"];
}

/** 진행 단계 중 지금 어디인지. 단계에 없는 상태면 -1. */
export function progressIndex(status: string): number {
  // 단계를 줄이기 전에 만들어진 주문이 preparing/ready/delivering 에 남아 있을 수
  // 있다. indexOf 로 찾으면 -1 이 나와 진행 막대가 통째로 사라진다.
  // 그 상태들은 "진행 중"(0번 칸)으로 본다.
  if (status === "completed") return 1;
  if (["paid", "accepted", "preparing", "ready", "delivering"].includes(status)) {
    return 0;
  }
  return -1; // pending_payment, canceled 는 단계가 아니다
}

/** 진행 중인 주문인지 — 관리자 목록에서 위로 올릴지 판단한다. */
export function isLive(status: string): boolean {
  return statusMeta(status).tone === "live";
}

/**
 * 더 바뀔 일이 없는 주문인지. 화면을 다시 받아올지 여기서 정한다.
 * isLive 와 다르다 — 결제 대기도 아직 끝난 게 아니다 (10분 뒤 자동 취소된다).
 */
export function isSettled(status: string): boolean {
  return status === "completed" || status === "canceled";
}

/** 상태 전이가 규칙에 맞는지. 서버가 마지막으로 확인한다. */
export function canTransition(from: string, to: string): boolean {
  return nextStatuses(from).includes(to as OrderStatus);
}

export function fulfillmentLabel(fulfillment: string): string {
  return fulfillment === "delivery" ? "배달" : "픽업";
}

/**
 * 주문 시각 표시. 서버는 UTC 로 돌지만 손님도 사장님도 한국 시간으로 읽는다.
 * toLocaleString 을 그냥 쓰면 배포 환경의 시간대를 따라가 9시간 어긋난다.
 */
const seoulStamp = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatOrderTime(iso: string | null): string {
  if (!iso) return "";
  return seoulStamp.format(new Date(iso));
}

/**
 * "18:42" — 시각만. 결제 마감처럼 시분이 중요한 곳에 쓴다.
 *
 * 남은 시간을 "3분"처럼 세지 않는 이유: 렌더 시점에 한 번 계산되고 그대로 멈춘다.
 * 화면에 5분이 떠 있는데 실제로는 이미 지난 상황이 생긴다. 마감 시각은 늙지 않는다.
 */
const seoulTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatClock(iso: string | null): string {
  if (!iso) return "";
  return seoulTime.format(new Date(iso));
}
