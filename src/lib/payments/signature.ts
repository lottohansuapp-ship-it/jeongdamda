import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 웹훅 서명 확인 (Standard Webhooks 규격).
 *
 * portone.ts 에서 떼어 둔 이유는 하나다 — 그 파일은 server-only 라 테스트에서
 * 불러올 수 없다. 돈이 걸린 검증을 테스트 없이 둘 수 없어서 나눴다.
 *
 * 서명이 유일한 방어선은 아니다. 통과해도 포트원 API 로 결제를 다시 조회해
 * 금액을 대조한다. 그래도 위조된 요청이 DB 까지 가지 않게 앞에서 걸러낸다.
 */
export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** 이 시간(초)보다 오래된 요청은 거절한다. 가로챈 요청의 재전송을 막는다. */
export const MAX_AGE_SECONDS = 300;

export function verifyWebhookSignature(
  body: string,
  headers: WebhookHeaders,
  secret: string,
  now: number = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  if (Math.abs(now / 1000 - sentAt) > MAX_AGE_SECONDS) return false;

  const expected = signBody(body, id, timestamp, secret);

  // 키 교체 중에는 "v1,<서명> v1,<다른서명>" 처럼 여러 개가 온다
  return signature.split(" ").some((part) => equals(extract(part), expected));
}

/** 검증과 테스트가 같은 규칙을 쓰도록 서명 생성도 함께 둔다. */
export function signBody(
  body: string,
  id: string,
  timestamp: string,
  secret: string,
): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
}

function extract(part: string): string {
  return part.includes(",") ? (part.split(",")[1] ?? "") : part;
}

/**
 * 문자열 === 로 비교하면 앞에서 몇 글자가 맞았는지 응답 시간으로 새어나간다.
 * 길이가 다르면 timingSafeEqual 이 던지므로 먼저 거른다.
 */
function equals(a: string, b: string): boolean {
  if (!a) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
