"use server";

import { updateTag } from "next/cache";
import { currentUserId, serverClient } from "./supabase/server";
import { PRODUCTS_TAG } from "./queries";
import { canTransition } from "./orders";
import { pickupSlots, pickupTimestamp, toSeoulClock } from "./store";
import type { ActionResult, StoreSettings } from "@/types/database";

export interface PlacedOrder {
  orderId: string;
  orderNo: string;
  total: number;
  /** 포트원에 넘길 결제 식별자. place_order 가 주문과 같은 트랜잭션에서 만든다 (0012). */
  paymentId: string;
}

async function authed() {
  const userId = await currentUserId();
  if (!userId) return null;
  return { db: await serverClient(), userId };
}

/**
 * DB 함수가 던진 한국어 문장을 그대로 쓴다.
 * place_order 의 메시지는 이미 손님이 읽을 말이다 ("○○이(가) 방금 품절되었습니다").
 * 여기서 문장을 다시 만들면 두 벌이 되고 반드시 어긋난다.
 */
function rpcError(message: string | undefined): string {
  const text = (message ?? "").trim();
  if (!text) return "주문하지 못했어요. 잠시 후 다시 시도해 주세요.";
  return text.replace(/^(ERROR|error):\s*/, "");
}

/**
 * 주문 생성. 금액도 재고도 전부 place_order() 안에서 정해진다 (D10, D21).
 * 화면에서 계산한 값은 넘기지 않는다 — 넘기는 순간 위조가 가능해진다.
 */
export async function placeOrder(
  formData: FormData,
): Promise<ActionResult<PlacedOrder>> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const fulfillment = String(formData.get("fulfillment") ?? "");
  if (fulfillment !== "pickup" && fulfillment !== "delivery") {
    return { ok: false, error: "수령 방법을 선택해 주세요." };
  }

  const addressId = String(formData.get("address_id") ?? "").trim();
  const slot = String(formData.get("pickup_slot") ?? "").trim();
  const memo = String(formData.get("memo") ?? "")
    .trim()
    .slice(0, 200);

  let pickupAt: string | null = null;

  if (fulfillment === "pickup") {
    // 손님이 보낸 시각을 믿지 않는다. 지금 다시 슬롯을 만들어 그 안에 있는지 본다.
    // place_order 는 null 인지만 보므로 지나간 시간도 통과시킨다.
    const { data: settings } = await session.db
      .from("store_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle<StoreSettings>();

    if (!settings) return { ok: false, error: "매장 설정을 읽지 못했어요." };

    const now = new Date();
    if (!pickupSlots(settings, toSeoulClock(now)).includes(slot)) {
      return { ok: false, error: "지금 고를 수 있는 픽업 시간이 아니에요." };
    }
    pickupAt = pickupTimestamp(now, slot);
  } else if (!addressId) {
    return { ok: false, error: "배송지를 선택해 주세요." };
  }

  const { data, error } = await session.db.rpc("place_order", {
    p_fulfillment: fulfillment,
    p_address_id: fulfillment === "delivery" ? addressId : null,
    p_pickup_at: pickupAt,
    p_memo: memo || null,
  });

  if (error) return { ok: false, error: rpcError(error.message) };

  const result = data as {
    order_id: string;
    order_no: string;
    total: number;
    payment_id: string;
  };

  // 재고가 줄었다. 태그를 갱신하지 않으면 목록은 팔린 만큼을 영영 모른다.
  updateTag(PRODUCTS_TAG);

  return {
    ok: true,
    data: {
      orderId: result.order_id,
      orderNo: result.order_no,
      total: result.total,
      paymentId: result.payment_id,
    },
  };
}

/**
 * 취소 + 환불.
 *
 * 순서가 전부다. 셋 중 어디서 끊겨도 손님이 손해를 보지 않아야 한다.
 *
 *   1. begin_cancel — DB 가 먼저 "내가 취소한다"를 선점한다.
 *      환불부터 보내면 두 사람이 동시에 취소를 눌렀을 때 둘 다 환불을 보낸다.
 *   2. 포트원 취소 — 실패하면 여기서 멈춘다. DB 를 먼저 취소해 버리면
 *      "주문은 취소됐는데 돈은 안 돌아온" 상태가 되고 아무도 모른다.
 *      멈추면 cancel_requested_at 이 남아 나중에 이어서 처리할 수 있다.
 *   3. cancel_order — 재고를 되돌리고 취소로 확정한다.
 *
 * 2에서 실패한 주문은 다시 취소를 눌러 이어서 진행할 수 있다.
 * 이미 환불됐으면 begin_cancel 이 needs_refund=false 를 준다.
 *
 * 권한과 시점 판단은 두 함수 안에서 한다. 화면이 버튼을 감추는 건 UX 다.
 */
export async function cancelOrder(
  orderId: string,
  reason?: string,
): Promise<ActionResult> {
  const first = await attemptCancel(orderId, reason);
  if (first.ok) return { ok: true, data: undefined };

  /**
   * 55000 은 "결제된 주문인데 환불 기록이 없다" 는 뜻이다 (0018).
   *
   * 손님이 결제창을 띄운 채 취소를 누르면, begin_cancel 이 상태를 읽은 뒤
   * cancel_order 를 부르기까지 사이에 결제 웹훅이 도착할 수 있다. 그러면
   * 환불이 필요 없다고 판단해 놓고 실제로는 결제가 끝나 있다.
   * 예전에는 그대로 취소돼서 손님 돈이 묶였다. 이제 DB 가 거절한다.
   *
   * 거절당했다는 건 그 사이 결제가 확정됐다는 뜻이므로 한 번 더 돌리면
   * begin_cancel 이 이번에는 환불이 필요하다고 알려 준다. 한 번만 시도한다 —
   * 두 번 연속 나면 우리가 모르는 일이 벌어지는 것이라 사람이 봐야 한다.
   */
  if (!first.retryable) return { ok: false, error: first.error };

  const second = await attemptCancel(orderId, reason);
  return second.ok
    ? { ok: true, data: undefined }
    : { ok: false, error: second.error };
}

type CancelAttempt =
  | { ok: true }
  | { ok: false; error: string; retryable: boolean };

async function attemptCancel(
  orderId: string,
  reason?: string,
): Promise<CancelAttempt> {
  const session = await authed();
  if (!session)
    return { ok: false, error: "로그인이 필요합니다.", retryable: false };

  const claim = await session.db.rpc("begin_cancel", { p_order_id: orderId });
  if (claim.error)
    return {
      ok: false,
      error: rpcError(claim.error.message),
      retryable: false,
    };

  const { payment_id, total, needs_refund } = claim.data as {
    payment_id: string | null;
    total: number;
    needs_refund: boolean;
  };

  let refunded: number | null = null;

  if (needs_refund && payment_id) {
    // 결제를 켜지 않았으면 이 모듈도 불러올 일이 없다
    const { cancelPayment } = await import("./payments/portone");
    const result = await cancelPayment(
      payment_id,
      reason?.trim() || "주문 취소",
    );

    if (!result.ok) {
      // 돈이 걸린 실패다. 반드시 남긴다 — 취소는 걸려 있고 환불은 안 나간 상태로
      // 주문이 멈춰 있으므로 누군가 이어서 처리해야 한다.
      const { reportError } = await import("./report");
      await reportError("refund", result.error, payment_id ?? orderId);

      return {
        ok: false,
        error: `환불을 처리하지 못했어요. 매장에 연락해 주세요. (${result.error})`,
        retryable: false,
      };
    }
    refunded = total;
  }

  const { error } = await session.db.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason?.trim() || null,
    p_refunded: refunded,
  });

  if (error) {
    return {
      ok: false,
      error: rpcError(error.message),
      // 55000 = 결제됐는데 환불 기록이 없다. 다시 돌리면 이번엔 환불부터 한다.
      retryable: error.code === "55000",
    };
  }

  updateTag(PRODUCTS_TAG); // 재고가 돌아왔다
  await notify(orderId, "canceled");
  return { ok: true };
}

/**
 * 사장님의 상태 전이. 규칙은 orders.ts 하나만 본다.
 * 화면이 버튼을 하나만 보여주더라도 서버가 마지막으로 확인한다 — 요청은 위조된다.
 * 쓰기 권한은 orders_admin_all 정책이 막는다. is_admin() 이 아니면 0행이 되고,
 * 0행은 성공이 아니다 (0004 에서 배운 것).
 */
export async function advanceOrder(
  orderId: string,
  to: string,
): Promise<ActionResult> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const { data: current, error: readError } = await session.db
    .from("orders")
    .select("status, fulfillment")
    .eq("id", orderId)
    .maybeSingle<{ status: string; fulfillment: string }>();

  if (readError) return { ok: false, error: readError.message };
  if (!current) return { ok: false, error: "주문을 찾을 수 없습니다." };

  if (!canTransition(current.status, to, current.fulfillment)) {
    return { ok: false, error: "지금은 그 상태로 바꿀 수 없어요." };
  }

  const { data: updated, error } = await session.db
    .from("orders")
    .update({ status: to })
    .eq("id", orderId)
    .eq("status", current.status) // 그 사이 누가 바꿨으면 덮어쓰지 않는다
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: "주문 상태를 바꾸지 못했어요. 새로고침해 주세요.",
    };
  }

  // 여기까지 왔다는 건 이 호출이 상태를 실제로 바꿨다는 뜻이다
  // (위의 .eq("status", 이전값) 이 두 번째 호출을 0행으로 만든다).
  // 그래서 알림도 한 번만 나간다.
  await notify(orderId, to);

  return { ok: true, data: undefined };
}

/**
 * 알림은 주문 처리를 막지 않는다.
 * 알림톡이 안 갔다고 사장님 화면에서 상태 변경이 실패하면 그게 더 나쁘다.
 * 실패는 notification_logs 에 남는다.
 */
async function notify(orderId: string, kind: string): Promise<void> {
  try {
    const { notifyCustomer } = await import("./notify");
    await notifyCustomer(orderId, kind as never);
  } catch {
    // notify 안에서 이미 삼키지만, import 자체가 실패할 수도 있다
  }
}
