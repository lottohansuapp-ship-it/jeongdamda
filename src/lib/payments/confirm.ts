import "server-only";
import { publicClient } from "../supabase/public";
import { getPayment, PAYMENT_DB_SECRET } from "./portone";

/**
 * 결제 확정. 웹훅과 손님 화면이 **같은 함수**를 부른다.
 *
 * 왜 하나로 두는가: 두 경로가 각자 판단하면 언젠가 갈라진다.
 * 화면 쪽만 느슨해지는 순간 그게 곧 무료 주문이 된다 (D24 와 같은 교훈).
 *
 * 순서가 전부다.
 *   1. 포트원에 결제 건을 **다시 조회**한다. 요청 본문에 적힌 금액은 쓰지 않는다.
 *   2. 조회된 금액을 orders.total 과 대조한다 (mark_order_paid 안에서).
 *   3. 일치할 때만 paid 로 전이하고 장바구니를 비운다.
 *
 * 여러 번 불려도 안전하다. 이미 처리됐으면 applied=false 로 조용히 끝난다.
 */
export type ConfirmResult =
  | { ok: true; applied: boolean; status: string; orderId: string | null }
  | { ok: false; error: string };

export async function confirmPayment(paymentId: string): Promise<ConfirmResult> {
  if (!PAYMENT_DB_SECRET) {
    return { ok: false, error: "결제가 아직 연결되지 않았습니다." };
  }

  const payment = await getPayment(paymentId);
  if (!payment.ok) return { ok: false, error: payment.error };

  // 아직 결제되지 않았다. 오류가 아니다 — 가상계좌처럼 나중에 완료되는 수단도 있고
  // 그때 포트원이 웹훅을 다시 보낸다. 주문은 pending_payment 로 남는다.
  if (payment.data.status !== "PAID") {
    return {
      ok: true,
      applied: false,
      status: payment.data.status,
      orderId: null,
    };
  }

  const { data, error } = await publicClient().rpc("mark_order_paid", {
    p_payment_id: paymentId,
    // 손님이 보낸 금액이 아니라 포트원이 확인해 준 금액이다
    p_amount: payment.data.amount,
    p_method: payment.data.method,
    p_secret: PAYMENT_DB_SECRET,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as {
    applied?: boolean;
    status?: string;
    order_id?: string;
  } | null;

  return {
    ok: true,
    applied: Boolean(result?.applied),
    status: result?.status ?? "paid",
    orderId: result?.order_id ?? null,
  };
}
