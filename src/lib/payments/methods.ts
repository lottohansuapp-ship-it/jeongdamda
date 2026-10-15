/**
 * 결제수단.
 *
 * 두 갈래로 켜진다.
 *   · **채널이 따로 있는 수단** — 환경변수에 채널키가 있으면 보인다.
 *     카드(KCP), 카카오페이 직접 계약, 휴대폰 결제가 여기다.
 *   · **KCP 카드 채널로 함께 부르는 수단** — 간편결제(카카오페이·네이버페이)와
 *     실시간 계좌이체. KCP 는 한 사이트코드로 이것들을 다 처리하므로 채널을 새로
 *     만들지 않는다. 아래 KCP_EXTRAS 스위치로 켠다.
 *
 * 계약하지 않은 수단을 띄우면 손님이 고른 뒤에야 결제창이 오류를 낸다 — 손님이
 * 가게를 의심하게 되는 실패다. 그래서 기본은 "계약한 것만 보인다" 이다.
 */
export type PaymentMethodKey =
  | "card"
  | "kakaopay"
  | "naverpay"
  | "transfer"
  | "vbank"
  | "mobile";

export type EasyPayProvider = "KAKAOPAY" | "NAVERPAY";

export interface PaymentMethod {
  key: PaymentMethodKey;
  label: string;
  /** 어르신도 무엇인지 알 수 있게. 아이콘만으로는 부족하다. */
  hint: string;
  /** 포트원 requestPayment 의 payMethod */
  payMethod: "CARD" | "EASY_PAY" | "TRANSFER" | "VIRTUAL_ACCOUNT" | "MOBILE";
  /** 간편결제일 때 어느 앱을 바로 열지. 없으면 PG 가 고르는 화면을 먼저 띄운다. */
  easyPayProvider?: EasyPayProvider;
  channelKey: string;
}

/** 환경변수로 받는 채널키 (config.ts 의 PORTONE_CHANNELS) */
export interface PaymentChannels {
  card: string;
  kakaopay: string;
  mobile: string;
}

/** KCP 카드 채널로 함께 부르는 수단의 스위치 */
export interface KcpExtras {
  kakaopay: boolean;
  naverpay: boolean;
  transfer: boolean;
  /** 가상계좌 입금. 입금 기한 30분, 환불은 사장님이 직접 이체 (vbank.ts) */
  virtualAccount: boolean;
}

export const NO_KCP_EXTRAS: KcpExtras = {
  kakaopay: false,
  naverpay: false,
  transfer: false,
  virtualAccount: false,
};

/*
  2026-10-14 사용자 결정: KCP 에 간편결제 심사를 받으려고 **승인 전에 켜 둔다.**
  심사자가 결제 화면에서 버튼을 확인할 수 있게 하려는 것이다.

  2026-10-15: 실시간 계좌이체는 빼고 가상계좌 입금으로 바꿨다(사용자 결정).
  가상계좌도 KCP 와 따로 계약·심사가 필요하다.

  승인 전에는 이 수단을 고르면 KCP 결제창이 실패한다(돈은 빠지지 않는다).
  영업을 켜기 전에 승인됐는지 확인하고, 안 된 수단은 false 로 돌려 배포한다.
*/
export const KCP_EXTRAS: KcpExtras = {
  kakaopay: true,
  naverpay: true,
  transfer: false,
  virtualAccount: true,
};

/** 보이는 순서 = 손님이 많이 쓰는 순 */
export function availableMethods(
  channels: PaymentChannels,
  extras: KcpExtras = NO_KCP_EXTRAS,
): PaymentMethod[] {
  const card = channels.card.trim();
  const kakaoDirect = channels.kakaopay.trim();
  const mobile = channels.mobile.trim();
  const methods: PaymentMethod[] = [];

  if (card) {
    methods.push({
      key: "card",
      label: "신용·체크카드",
      hint: "카드번호를 직접 입력해요",
      payMethod: "CARD",
      channelKey: card,
    });
  }

  // 카카오페이와 직접 계약한 채널이 있으면 그쪽이 먼저다. 없으면 KCP 간편결제로.
  const kakaoChannel = kakaoDirect || (extras.kakaopay ? card : "");
  if (kakaoChannel) {
    methods.push({
      key: "kakaopay",
      label: "카카오페이",
      hint: "카카오톡으로 결제해요",
      payMethod: "EASY_PAY",
      easyPayProvider: "KAKAOPAY",
      channelKey: kakaoChannel,
    });
  }

  if (card && extras.naverpay) {
    methods.push({
      key: "naverpay",
      label: "네이버페이",
      hint: "네이버 앱으로 결제해요",
      payMethod: "EASY_PAY",
      easyPayProvider: "NAVERPAY",
      channelKey: card,
    });
  }

  if (card && extras.transfer) {
    methods.push({
      key: "transfer",
      label: "실시간 계좌이체",
      hint: "내 은행 계좌에서 바로 결제돼요",
      payMethod: "TRANSFER",
      channelKey: card,
    });
  }

  if (card && extras.virtualAccount) {
    methods.push({
      key: "vbank",
      label: "가상계좌 입금",
      // 명령하는 말투가 아니라 알려 주는 말투로(사용자 요청). 어르신이 다음 날 같은
      // 계좌로 보내지 않도록 "1회용" 과 "30분" 을 둘 다 적는다.
      hint: "1회용 계좌가 발급되고, 30분 동안만 입금할 수 있어요",
      payMethod: "VIRTUAL_ACCOUNT",
      channelKey: card,
    });
  }

  if (mobile) {
    methods.push({
      key: "mobile",
      label: "휴대폰 결제",
      hint: "통신요금에 함께 청구돼요",
      payMethod: "MOBILE",
      channelKey: mobile,
    });
  }

  return methods;
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
