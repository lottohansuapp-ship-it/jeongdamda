import "server-only";
import { publicClient } from "../supabase/public";
import { isOurPaymentId, isPaymentNotFound, needsRefund } from "./config";
import { cancelPayment, getPayment, PAYMENT_DB_SECRET } from "./portone";

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
/**
 * 포트원 환불이 **성공한 뒤에만** 부른다. 주문에 refunded_at·refund_amount 를 남긴다 (0028).
 *
 * 비밀값으로만 부를 수 있다. 예전에는 cancel_order 가 환불 금액을 인자로 받아서
 * 손님이 직접 "환불됨" 을 넣어 보낼 수 있었다. 여러 번 불러도 한 번만 남는다.
 */
export async function recordRefund(
  paymentId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!PAYMENT_DB_SECRET) return { ok: false, error: "결제가 아직 연결되지 않았습니다." };

  const { error } = await publicClient().rpc("record_refund", {
    p_payment_id: paymentId,
    p_amount: amount,
    p_secret: PAYMENT_DB_SECRET,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export type ConfirmResult =
  | { ok: true; applied: boolean; status: string; orderId: string | null }
  | { ok: false; error: string };

export async function confirmPayment(paymentId: string): Promise<ConfirmResult> {
  if (!PAYMENT_DB_SECRET) {
    return { ok: false, error: "결제가 아직 연결되지 않았습니다." };
  }

  const payment = await getPayment(paymentId);
  if (!payment.ok) {
    // 우리 번호가 아닌데 포트원에도 없는 결제다 — 콘솔 「호출 테스트」 의 예시 번호.
    // 실패로 돌려주면 웹훅이 500 → 포트원이 계속 재시도하고 관리자 빨간 알림이 쌓인다.
    // 우리 번호인데 없다면 키가 엇갈린 것이라 아래로 내려가 500·알림으로 드러낸다.
    if (
      isPaymentNotFound(payment.code, payment.httpStatus) &&
      !isOurPaymentId(paymentId)
    ) {
      return { ok: true, applied: false, status: "NOT_FOUND", orderId: null };
    }
    return { ok: false, error: payment.error };
  }

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

  const applied = Boolean(result?.applied);
  const orderId = result?.order_id ?? null;

  /*
    돈은 들어왔는데 주문은 이미 취소됐다 — 되돌린다 (needsRefund 설명 참조).
    웹훅과 손님 화면이 동시에 와서 두 번 취소를 요청해도 괜찮다. 두 번째는
    "이미 취소됨" 으로 오고 cancelPayment 가 그것을 성공으로 본다.
    되돌리기에 실패하면 오류로 돌려준다 — 웹훅이 5xx 를 받고 다시 보내서
    다음에 또 시도한다. 사장님도 알아야 하므로 남긴다.
  */
  if (needsRefund(payment.data.status, result?.status)) {
    const refund = await cancelPayment(paymentId, "취소된 주문에 들어온 결제 자동 환불");
    const { reportError } = await import("../report");
    if (!refund.ok) {
      await reportError("payment-refund", `취소된 주문에 결제가 들어왔는데 자동 환불 실패: ${refund.error}`, paymentId);
      return { ok: false, error: "취소된 주문의 결제를 되돌리지 못했습니다." };
    }
    if (!refund.data.alreadyCancelled) {
      await reportError("payment-refund", "취소된 주문에 결제가 들어와 자동으로 환불했어요", paymentId);
    }
    // 돈이 오갔다는 흔적을 주문에 남긴다. error_logs 는 90일 뒤 지워진다.
    const recorded = await recordRefund(paymentId, payment.data.amount);
    if (!recorded.ok) {
      await reportError("payment-refund", `자동 환불은 됐는데 기록을 남기지 못했어요: ${recorded.error}`, paymentId);
    }
    return { ok: true, applied: false, status: "canceled", orderId };
  }

  /*
    알림도 여기서 보낸다. 예전에는 웹훅 라우트에만 있었다.
    그런데 휴대폰 결제는 결제 앱으로 넘어갔다가 주문 화면으로 돌아오는
    방식이라 웹훅이 늦거나 실패하면 매장이 주문을 아예 모른다.
    이 파일 맨 위에 적어 둔 그대로다 — 두 경로가 각자 판단하면 언젠가 갈라진다.

    applied 는 이번 호출에서 처음 확정됐다는 뜻이라 여러 번 불려도 한 번만 간다.
    알림이 실패해도 결제 확정을 되돌리지 않는다. 돈은 이미 받았고 주문도
    확정됐다 — 알림 때문에 그걸 무를 수는 없다.
  */
  if (applied && orderId) {
    const { notifyNewOrder, notifyCustomer } = await import("../notify");
    await notifyNewOrder(orderId);
    await notifyCustomer(orderId, "order_placed");
  }

  return {
    ok: true,
    applied,
    status: result?.status ?? "paid",
    orderId,
  };
}
