/**
 * 결제수단.
 *
 * **수단마다 채널이 다르다.** 카카오페이는 그 자체가 결제대행사라 카드용
 * 채널로는 부를 수 없고, 포트원 콘솔에서 카카오페이 채널을 따로 만들어야 한다.
 * 휴대폰 결제는 보통 카드와 같은 PG 사가 중계하지만 계약을 따로 해야 한다.
 *
 * 그래서 켜는 기준을 "채널키가 있는가" 하나로 뒀다. 계약하지 않은 수단을
 * 화면에 띄우면 손님이 고른 뒤에야 결제창이 오류를 낸다 — 그건 손님이
 * 가게를 의심하게 되는 실패다. 키를 넣은 것만 보인다.
 *
 * 같은 PG 사로 카드와 휴대폰을 함께 계약했다면 두 환경변수에 같은 값을 넣는다.
 * 중복처럼 보이지만, 그래야 "계약한 것만 보인다"는 규칙이 유지된다.
 */
export type PaymentMethodKey = "card" | "kakaopay" | "mobile";

export interface PaymentMethod {
  key: PaymentMethodKey;
  label: string;
  /** 어르신도 무엇인지 알 수 있게. 아이콘만으로는 부족하다. */
  hint: string;
  /** 포트원 requestPayment 의 payMethod */
  payMethod: "CARD" | "EASY_PAY" | "MOBILE";
  channelKey: string;
}

export type PaymentChannels = Record<PaymentMethodKey, string>;

const CATALOG: Omit<PaymentMethod, "channelKey">[] = [
  {
    key: "card",
    label: "신용·체크카드",
    hint: "카드번호를 직접 입력해요",
    payMethod: "CARD",
  },
  {
    key: "kakaopay",
    label: "카카오페이",
    hint: "카카오톡으로 결제해요",
    payMethod: "EASY_PAY",
  },
  {
    key: "mobile",
    label: "휴대폰 결제",
    hint: "통신요금에 함께 청구돼요",
    payMethod: "MOBILE",
  },
];

/** 채널키가 있는 수단만 돌려준다. 순서는 CATALOG 순서 — 손님이 많이 쓰는 순이다. */
export function availableMethods(channels: PaymentChannels): PaymentMethod[] {
  return CATALOG.flatMap((method) => {
    const channelKey = channels[method.key].trim();
    return channelKey ? [{ ...method, channelKey }] : [];
  });
}

/**
 * 손님이 고른 수단을 고른다. 고른 것이 사라졌으면(사장님이 계약을 바꿨거나
 * 화면을 오래 열어 뒀거나) 첫 번째로 되돌린다 — 없는 채널로 결제창을
 * 부르면 오류만 뜬다.
 */
export function pickMethod(
  methods: PaymentMethod[],
  key: PaymentMethodKey | null,
): PaymentMethod | null {
  return methods.find((method) => method.key === key) ?? methods[0] ?? null;
}
