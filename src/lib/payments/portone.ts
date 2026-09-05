import "server-only";
import { isPaymentConfigured } from "./config";
import {
  verifyWebhookSignature as verify,
  type WebhookHeaders,
} from "./signature";

export type { WebhookHeaders };

/**
 * 포트원 V2 서버 연동. 이 파일의 값은 절대 브라우저로 나가지 않는다.
 *
 * 이 앱에서 결제의 진실은 **여기서 조회한 값** 하나뿐이다.
 * 손님 화면이 "결제 성공"이라고 말하는 것도, 웹훅 본문에 적힌 금액도 믿지 않는다.
 * 둘 다 위조할 수 있다. 포트원에 다시 물어본 답만 쓴다.
 */
const API_BASE = "https://api.portone.io";

const API_SECRET = process.env.PORTONE_API_SECRET ?? "";
/** 포트원이 웹훅에 서명할 때 쓰는 값 (whsec_… 형태) */
const WEBHOOK_SECRET = process.env.PORTONE_WEBHOOK_SECRET ?? "";
/** mark_order_paid 를 부를 권한. service_role 대신 쓰는 좁은 비밀값 (0012) */
export const PAYMENT_DB_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? "";

export function isPortOneReady(): boolean {
  return Boolean(API_SECRET && PAYMENT_DB_SECRET);
}

/**
 * 결제를 켜도 되는가. 서버 컴포넌트에서 불러 화면으로 내려보낸다.
 *
 * 브라우저 키만 보고 결제창을 열면 안 된다. 서버 키가 빠져 있으면
 * 손님은 카드로 결제되는데 확정이 안 되고, 10분 뒤 재고만 조용히 돌아간다.
 * 돈은 나갔는데 주문은 없는 상태다 — 키를 채워 넣는 날 나는 실수라
 * 네 개가 다 있을 때만 켠다.
 */
export function isPaymentLive(): boolean {
  return isPaymentConfigured() && isPortOneReady();
}

export interface PortOnePayment {
  /** PAID / READY / FAILED / CANCELLED / VIRTUAL_ACCOUNT_ISSUED … */
  status: string;
  /** 실제로 결제된 총액 (원) */
  amount: number;
  /** card / easyPay / transfer … 표시에만 쓴다 */
  method: string | null;
}

export type PortOneResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function call(
  path: string,
  init?: RequestInit,
): Promise<PortOneResult<unknown>> {
  if (!API_SECRET) {
    return { ok: false, error: "결제가 아직 연결되지 않았습니다." };
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `PortOne ${API_SECRET}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // 포트원이 준 메시지를 쓰되 없으면 상태 코드만. 우리 시크릿은 섞이지 않는다.
      const message =
        (body as { message?: string } | null)?.message ??
        `포트원 응답 오류 (${response.status})`;
      return { ok: false, error: message };
    }

    return { ok: true, data: body };
  } catch {
    return { ok: false, error: "결제 서버에 연결하지 못했습니다." };
  }
}

/** 결제 건을 다시 조회한다. 금액 검증의 유일한 근거다. */
export async function getPayment(
  paymentId: string,
): Promise<PortOneResult<PortOnePayment>> {
  const result = await call(`/payments/${encodeURIComponent(paymentId)}`);
  if (!result.ok) return result;

  const raw = result.data as {
    status?: string;
    amount?: { total?: number };
    method?: { type?: string };
  };

  const total = raw.amount?.total;
  if (typeof raw.status !== "string" || typeof total !== "number") {
    return { ok: false, error: "결제 정보를 읽지 못했습니다." };
  }

  return {
    ok: true,
    data: { status: raw.status, amount: total, method: raw.method?.type ?? null },
  };
}

/**
 * 결제 취소(환불).
 *
 * 이미 취소된 건은 오류가 아니라 성공으로 다룬다 — 재시도해도 안전해야 하고,
 * 여기서 실패로 처리하면 이미 환불된 주문이 취소 불가 상태로 묶인다.
 */
export async function cancelPayment(
  paymentId: string,
  reason: string,
): Promise<PortOneResult<{ alreadyCancelled: boolean }>> {
  const result = await call(`/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

  if (result.ok) return { ok: true, data: { alreadyCancelled: false } };

  if (/already|이미.*취소|CANCELLED/i.test(result.error)) {
    return { ok: true, data: { alreadyCancelled: true } };
  }
  return { ok: false, error: result.error };
}

/** 검증 로직은 signature.ts 에 있다 (테스트 가능하도록). 여기서는 시크릿만 붙인다. */
export function verifyWebhookSignature(
  body: string,
  headers: WebhookHeaders,
): boolean {
  return verify(body, headers, WEBHOOK_SECRET);
}
