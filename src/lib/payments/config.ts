/**
 * 결제 스위치.
 *
 * 포트원 가입과 PG 심사는 서류가 걸린 일이라 시간이 걸린다. 그동안 코드가
 * 멈춰 있으면 안 되므로, 키가 없으면 결제 단계만 건너뛰고 나머지는 그대로 돈다.
 * 키를 넣는 순간 켜진다 — 그때 고칠 코드가 없어야 한다 (D16 과 같은 방식).
 *
 * 이 파일은 브라우저 번들에 들어간다. 그래서 공개해도 되는 값만 둔다.
 * 상점 ID·채널 키는 결제창을 띄우려면 브라우저에 있어야 하고, 공개돼도 안전하다 —
 * 금액 위조는 서버가 포트원 API 로 다시 조회해서 막는다.
 * API 시크릿은 여기 두지 않고 NEXT_PUBLIC_ 도 붙이지 않는다.
 */
export const PORTONE_STORE_ID = process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? "";
export const PORTONE_CHANNEL_KEY =
  process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY ?? "";

/** 결제창을 띄울 수 있는지. 브라우저에서도 확인할 수 있다. */
export function isPaymentConfigured(): boolean {
  return Boolean(PORTONE_STORE_ID && PORTONE_CHANNEL_KEY);
}

/**
 * 결제를 켜도 되는가. 값은 안 보고 채워졌는지만 본다.
 *
 * 순수 함수로 둔 이유: 반쪽만 채워진 설정을 걸러내는 게 이 함수의 전부인데,
 * process.env 를 직접 읽으면 그 경우를 테스트할 수가 없다. 실제로 한 번
 * 놓쳤다 — 웹훅 시크릿을 검사에서 빠뜨린 채 "넷을 다 본다"고 적어 뒀었다.
 *
 * 다섯 개가 각각 없으면 이렇게 된다.
 *   · storeId / channelKey — 결제창이 안 뜬다
 *   · apiSecret — 결제 금액을 다시 조회하지 못해 확정이 안 된다
 *   · dbSecret — mark_order_paid 를 부를 권한이 없다
 *   · webhookSecret — 서명 검증이 전부 실패한다. PC 는 화면 쪽 확인이
 *     살려 주지만 휴대폰은 리다이렉트라 웹훅이 유일한 경로다.
 *     손님 돈은 나가고 주문은 안 잡힌다.
 */
export interface PaymentKeys {
  storeId: string;
  channelKey: string;
  apiSecret: string;
  webhookSecret: string;
  dbSecret: string;
}

export function isPaymentReady(keys: PaymentKeys): boolean {
  return Object.values(keys).every((value) => value.trim() !== "");
}
