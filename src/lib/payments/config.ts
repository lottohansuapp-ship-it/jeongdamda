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
