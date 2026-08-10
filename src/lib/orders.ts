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
