/**
 * 주문서에서 고르던 것을 잠깐 기억해 둔다.
 *
 * "추가 주문"으로 목록에 다녀오면 수령 방법·시간·요청사항이 전부 초기화됐다.
 * 특히 손으로 쓴 요청사항이 사라지는 건 손님이 가장 싫어하는 종류의 일이다.
 *
 * 왜 쿠키인가: 서버가 읽어서 초기값으로 넘겨주면 화면이 처음부터 맞는 상태로 그려진다.
 * sessionStorage 는 서버가 못 읽는다. 기본값으로 한 번 그린 뒤 덮어써야 하고
 * 그 과정에서 깜빡임과 하이드레이션 불일치가 생긴다.
 * path=/checkout 으로 묶어 두면 주문서를 열 때만 실려 나가 다른 요청은 무거워지지 않는다.
 *
 * 담는 것은 '고른 것'뿐이다. 금액도 재고도 주소 본문도 넣지 않는다 —
 * 그건 전부 서버가 다시 계산하거나 조회한다 (D21).
 */
export const DRAFT_COOKIE = "checkout_draft";

/** 쿠키는 4KB 제한이 있고 매 요청 실려 나간다. 요청사항 200자면 넉넉히 들어간다. */
const MAX_MEMO = 200;
const MAX_COOKIE = 1200;

export interface CheckoutDraft {
  fulfillment: "pickup" | "delivery";
  addressId: string;
  slot: string;
  memo: string;
}

/** 쿠키에 넣는 짧은 키. 이름을 길게 쓰면 쿠키만 커진다. */
interface Packed {
  f?: unknown;
  a?: unknown;
  s?: unknown;
  m?: unknown;
}

export function encodeDraft(draft: CheckoutDraft): string {
  const packed: Packed = {
    f: draft.fulfillment,
    a: draft.addressId || undefined,
    s: draft.slot || undefined,
    m: draft.memo.slice(0, MAX_MEMO) || undefined,
  };
  return encodeURIComponent(JSON.stringify(packed)).slice(0, MAX_COOKIE);
}

/** 쿠키 값은 손님이 고칠 수 있다. 형태만 확인하고, 유효성은 reconcileDraft 가 본다. */
export function decodeDraft(raw: string | undefined): Partial<CheckoutDraft> {
  if (!raw) return {};

  try {
    const packed = JSON.parse(decodeURIComponent(raw)) as Packed;
    if (!packed || typeof packed !== "object") return {};

    return {
      fulfillment:
        packed.f === "pickup" || packed.f === "delivery" ? packed.f : undefined,
      addressId: text(packed.a),
      slot: text(packed.s),
      memo: text(packed.m)?.slice(0, MAX_MEMO),
    };
  } catch {
    return {};
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export interface DraftContext {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  /** 지금 이 손님이 가진 배송지 id 들 */
  addressIds: readonly string[];
  defaultAddressId: string;
  /** 지금 고를 수 있는 픽업 시간대 */
  slots: readonly string[];
}

/**
 * 저장해 둔 값을 지금 상황에 맞춘다.
 *
 * 저장한 뒤에 사장님이 배달을 끄거나, 손님이 그 배송지를 지우거나,
 * 시간이 흘러 그 픽업 시간이 지나갔을 수 있다. 그대로 되살리면
 * 주문 버튼을 눌렀을 때에야 거절당한다. 여기서 미리 지금 가능한 값으로 되돌린다.
 */
export function reconcileDraft(
  draft: Partial<CheckoutDraft>,
  context: DraftContext,
): CheckoutDraft {
  return {
    fulfillment: resolveFulfillment(draft.fulfillment, context),
    addressId:
      draft.addressId && context.addressIds.includes(draft.addressId)
        ? draft.addressId
        : context.defaultAddressId,
    slot:
      draft.slot && context.slots.includes(draft.slot)
        ? draft.slot
        : (context.slots[0] ?? ""),
    memo: draft.memo ?? "",
  };
}

/** 배달이 기본이다. 꺼져 있으면 픽업으로. */
function resolveFulfillment(
  saved: CheckoutDraft["fulfillment"] | undefined,
  context: DraftContext,
): CheckoutDraft["fulfillment"] {
  if (saved === "pickup" && context.pickupEnabled) return "pickup";
  if (saved === "delivery" && context.deliveryEnabled) return "delivery";
  return context.deliveryEnabled ? "delivery" : "pickup";
}
