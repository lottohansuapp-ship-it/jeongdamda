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

/*
 * 수단마다 채널이 다르다 (methods.ts 참조). 이름을 통째로 적는 이유는
 * Next 가 빌드할 때 process.env.NEXT_PUBLIC_… 을 글자 그대로 찾아 값으로
 * 바꿔치기하기 때문이다. 변수로 조립하면 빈 값이 된다.
 */
export const PORTONE_CHANNELS = {
  card: PORTONE_CHANNEL_KEY,
  kakaopay: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_KAKAOPAY ?? "",
  mobile: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_MOBILE ?? "",
};

/**
 * 포트원이 우리 API 시크릿을 받아주는지 — 응답 코드로 판단한다.
 *
 * 30일짜리로 발급된 시크릿이 조용히 만료돼서, 결제 확인과 환불이 모두
 * 401 로 막힌 채 며칠을 지낸 적이 있다. 화면에는 아무 표시도 없었다.
 *
 * 없는 결제번호를 일부러 조회한다. 키가 맞으면 "그런 결제 없음(404)",
 * 틀리거나 만료됐으면 401/403 이 온다. 그 외(장애·타임아웃)는 키 탓이라고
 * 단정하지 않는다 — 괜히 빨간 알림을 띄우면 아무도 알림을 믿지 않게 된다.
 */
export type ApiKeyHealth = "ok" | "rejected" | "unknown";

export function keyHealthFromStatus(status: number): ApiKeyHealth {
  if (status === 401 || status === 403) return "rejected";
  if (status === 404 || (status >= 200 && status < 300)) return "ok";
  return "unknown";
}

/**
 * 포트원은 결제됐다는데 주문은 이미 취소된 경우 — 돈을 돌려줘야 한다.
 *
 * 주문 후 10분이 지나면 재고를 돌려주고 주문을 취소한다(sweep_expired_orders).
 * 그런데 손님이 결제창을 오래 붙들고 있다가 그 뒤에 결제를 마치면, 돈은 빠졌는데
 * 주문은 취소된 채로 남았다. 손님이 직접 취소한 직후 결제가 끝나는 경우도 같다.
 * 재고는 이미 풀렸으니 주문을 되살리지 않고 결제를 되돌린다.
 */
export function needsRefund(paymentStatus: string, orderStatus: string | undefined): boolean {
  return paymentStatus === "PAID" && orderStatus === "canceled";
}

/**
 * 환불 요청이 "이미 취소된 결제" 라서 거절됐는가 — 그렇다면 성공으로 본다.
 *
 * 포트원이 오류 종류(type)를 주면 그것만 본다. 예전에는 문장에 already 가
 * 들어 있는지로 판단해서, 다른 실패(부분 취소 진행 중 등)의 문장에 그 단어가
 * 섞이면 환불이 안 나갔는데 "환불됨" 으로 처리될 수 있었다.
 * 종류를 못 받았을 때(네트워크 너머 프록시 오류 등)만 문장으로 추정한다.
 */
/**
 * 포트원에 그런 결제가 아예 없는가.
 *
 * 콘솔 「호출 테스트」 는 example-payment-id 같은 예시 번호로 웹훅을 보낸다.
 * 서명은 맞으니 통과하고, 조회하면 "없음" 이 온다. 예전엔 이걸 일시 장애로 보고 500 을
 * 줘서 포트원이 같은 웹훅을 계속 다시 보냈고, 누를 때마다 관리자 화면에 빨간 알림이 쌓였다.
 * 포트원 공식 예제도 이 경우 200 으로 닫는다 — 기다려도 생기지 않는 결제다.
 * 키 거절(401)·포트원 장애(5xx)는 여기에 들지 않는다. 그건 다시 받아야 한다.
 */
export function isPaymentNotFound(code: string | undefined, httpStatus: number | undefined): boolean {
  if (code) return code === "PAYMENT_NOT_FOUND";
  return httpStatus === 404;
}

/**
 * 우리 앱이 만든 결제번호인가. place_order(0028)가 `주문번호-난수8자` 로 만든다:
 * 20261014-0031-0e6ea1b2.
 *
 * "포트원에 없는 결제" 를 조용히 넘길지 가르는 데 쓴다. 우리 번호인데 포트원이
 * 모른다면 그건 테스트가 아니라 키가 엇갈린 것(실연동 결제를 테스트 키로 조회 등)이라
 * 결제가 확정되지 않는다 — 그때는 500 과 빨간 알림으로 반드시 드러나야 한다.
 */
export function isOurPaymentId(paymentId: string): boolean {
  return /^\d{8}-\d{4}-[0-9a-f]{8}$/.test(paymentId);
}

export function isAlreadyCancelled(code: string | undefined, message: string): boolean {
  if (code) return code === "PAYMENT_ALREADY_CANCELLED";
  return /이미\s*취소|already\s+cancel/i.test(message);
}

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
  return missingPaymentKeys(keys).length === 0;
}

/** 화면에 이름을 그대로 보여준다. Vercel 에서 찾을 이름과 같아야 쓸모가 있다. */
const KEY_NAMES: Record<keyof PaymentKeys, string> = {
  storeId: "NEXT_PUBLIC_PORTONE_STORE_ID",
  channelKey: "NEXT_PUBLIC_PORTONE_CHANNEL_KEY",
  apiSecret: "PORTONE_API_SECRET",
  webhookSecret: "PORTONE_WEBHOOK_SECRET",
  dbSecret: "PAYMENT_WEBHOOK_SECRET",
};

/**
 * 비어 있는 값의 **이름**만 돌려준다. 값은 절대 내보내지 않는다.
 *
 * 다섯 개 중 뭐가 빠졌는지 모른 채로는 고칠 수가 없다. 결제가 안 켜지는
 * 이유가 "주문하기 버튼이 그대로다" 하나뿐이면 다섯 군데를 다 뒤져야 한다.
 */
/**
 * dbSecret 최소 길이.
 *
 * 이 값은 "주문을 결제완료로 바꿔도 된다" 는 권한 그 자체다. 그리고
 * mark_order_paid 는 anon 에게 열려 있다 — 브라우저에 공개된 키로 누구나
 * 부를 수 있고, 막아 주는 건 이 값 하나뿐이다.
 *
 * 짧으면 찍어서 맞힐 수 있다. 자기 주문의 결제번호와 금액은 본인이 아니까,
 * 남는 건 이 값을 맞히는 것뿐이고 그러면 돈을 안 내고 주문이 결제완료가 된다.
 * 실제로 7글자가 들어가 있던 적이 있다.
 *
 * openssl rand -base64 32 이 44글자를 준다. 32 는 그보다 넉넉히 낮게 잡은 선이다.
 */
const MIN_DB_SECRET_LENGTH = 32;

export function missingPaymentKeys(keys: PaymentKeys): string[] {
  const missing = (Object.keys(KEY_NAMES) as (keyof PaymentKeys)[])
    .filter((key) => keys[key].trim() === "")
    .map((key) => KEY_NAMES[key]);

  /*
    짧은 값은 없는 것보다 나쁘다. 없으면 결제가 안 켜져서 금방 알아채지만,
    짧으면 멀쩡히 돌아가는 채로 뚫려 있다. 그래서 "없음" 과 같이 취급해
    결제를 아예 켜지 않는다.
  */
  const dbSecret = keys.dbSecret.trim();
  if (dbSecret !== "" && dbSecret.length < MIN_DB_SECRET_LENGTH) {
    missing.push(
      `${KEY_NAMES.dbSecret} (너무 짧아요 — ${MIN_DB_SECRET_LENGTH}자 이상, openssl rand -base64 32)`,
    );
  }

  return missing;
}
