import "server-only";
import { publicClient } from "../supabase/public";
import { isOurPaymentId, isPaymentNotFound, needsRefund } from "./config";
import {
  cancelPayment,
  closeVirtualAccount,
  getPayment,
  PAYMENT_DB_SECRET,
  type PortOnePayment,
} from "./portone";
import { VBANK_MINUTES } from "./vbank";

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

/**
 * 가상계좌 발급 기록 (mark_vbank_issued, 0029). 여러 번 불려도 된다.
 *
 * 기한은 포트원이 알려 준 값(KCP 가 실제로 정한 것)을 넘긴다. 결제창에 30분을
 * 넘겼지만 PG 가 그대로 따른다는 보장은 없다 — DB 가 45분에서 자르고(capped),
 * 잘렸으면 사장님 화면에 알린다. 그 계좌는 재고가 풀린 뒤에도 열려 있어서다.
 */
async function recordVbankIssued(
  paymentId: string,
  vbank: NonNullable<PortOnePayment["virtualAccount"]>,
  /** 아직 입금 전일 때만 닫는다. 입금된 계좌는 닫을 수도 없고 닫을 이유도 없다. */
  closeIfCanceled: boolean,
): Promise<ConfirmResult & { refunded?: boolean }> {
  const { data, error } = await publicClient().rpc("mark_vbank_issued", {
    p_payment_id: paymentId,
    p_bank: vbank.bank,
    p_account: vbank.accountNumber,
    p_holder: vbank.holder,
    p_due: vbank.expiredAt,
    p_secret: PAYMENT_DB_SECRET,
  });
  if (error) return { ok: false, error: error.message };

  const result = data as {
    applied?: boolean;
    status?: string;
    order_id?: string;
    capped?: boolean;
    refunded?: boolean;
  } | null;

  if (result?.capped) {
    const { reportError } = await import("../report");
    await reportError(
      "payment-vbank",
      `가상계좌 입금 기한이 ${VBANK_MINUTES}분보다 길게 발급됐어요(${vbank.expiredAt}). 재고는 45분 뒤 풀리니, 그 뒤 입금은 직접 돌려줘야 해요.`,
      paymentId,
    );
  }

  // 이미 취소된 주문에 계좌가 늦게 발급됐다. 열어 두면 입금이 들어올 수 있으니 닫는다.
  if (closeIfCanceled && result && !result.applied && result.status === "canceled") {
    const closed = await closeVirtualAccount(paymentId);
    if (!closed.ok) {
      const { reportError } = await import("../report");
      await reportError(
        "payment-vbank",
        `취소된 주문에 발급된 가상계좌를 닫지 못했어요: ${closed.error}`,
        paymentId,
      );
    }
  }

  return {
    ok: true,
    applied: false,
    status: result?.status === "pending_payment" ? "VIRTUAL_ACCOUNT_ISSUED" : (result?.status ?? "VIRTUAL_ACCOUNT_ISSUED"),
    orderId: result?.order_id ?? null,
    refunded: Boolean(result?.refunded),
  };
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

  const vbank = payment.data.virtualAccount;

  // 가상계좌가 발급됐다 — 계좌를 주문에 적고 재고 잡는 시간을 입금 기한까지 늘린다.
  // 입금되면 포트원이 PAID 웹훅을 다시 보낸다.
  if (payment.data.status === "VIRTUAL_ACCOUNT_ISSUED" && vbank) {
    return recordVbankIssued(paymentId, vbank, true);
  }

  // 아직 결제되지 않았다. 오류가 아니다 — 주문은 pending_payment 로 남는다.
  if (payment.data.status !== "PAID") {
    return {
      ok: true,
      applied: false,
      status: payment.data.status,
      orderId: null,
    };
  }

  // 입금 완료. 발급 웹훅을 놓쳤어도 이 주문이 가상계좌라는 걸 먼저 적어 둔다 —
  // 취소할 때 포트원 환불이 아니라 사장님 직접 이체로 가야 해서다(begin_cancel 0029).
  if (vbank) {
    const marked = await recordVbankIssued(paymentId, vbank, false);
    if (!marked.ok) return marked;
    // 사장님이 이미 손님 계좌로 돌려주고 취소까지 끝낸 주문 — 입금 웹훅이 다시 와도
    // 할 일이 없다. 여기서 끊지 않으면 "돌려주세요" 알림이 또 떠서 알림을 못 믿게 된다.
    if (marked.refunded) {
      return { ok: true, applied: false, status: "canceled", orderId: marked.orderId };
    }
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
    const { reportError } = await import("../report");

    // 가상계좌 입금은 결제 취소만으로 돈이 돌아가지 않는다(환불 계좌가 필요하다).
    // 사장님이 손님 계좌로 직접 돌려줘야 하므로 화면 맨 위에 남긴다.
    // 실패로 돌려주지 않는다 — 웹훅이 계속 다시 와도 할 수 있는 일이 없다.
    if (vbank) {
      await reportError(
        "payment-refund",
        `취소된 주문에 가상계좌 입금(${payment.data.amount}원)이 들어왔어요. 손님 계좌로 직접 돌려주세요.`,
        paymentId,
      );
      return { ok: true, applied: false, status: "canceled", orderId };
    }

    const refund = await cancelPayment(paymentId, "취소된 주문에 들어온 결제 자동 환불");
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
