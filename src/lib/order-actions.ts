"use server";

import { updateTag } from "next/cache";
import { serverClient } from "./supabase/server";
import { PRODUCTS_TAG } from "./queries";
import { canTransition } from "./orders";
import { pickupSlots, pickupTimestamp, toSeoulClock } from "./store";
import type { ActionResult, StoreSettings } from "@/types/database";

export interface PlacedOrder {
  orderId: string;
  orderNo: string;
  total: number;
}

async function authed() {
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user ? { db, user } : null;
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

  const result = data as { order_id: string; order_no: string; total: number };

  // 재고가 줄었다. 태그를 갱신하지 않으면 목록은 팔린 만큼을 영영 모른다.
  updateTag(PRODUCTS_TAG);

  return {
    ok: true,
    data: {
      orderId: result.order_id,
      orderNo: result.order_no,
      total: result.total,
    },
  };
}

/**
 * 취소. 권한과 시점 판단은 cancel_order() 안에서 한다 (0011).
 * 화면이 버튼을 감추는 것은 UX 이지 방어선이 아니다.
 */
export async function cancelOrder(
  orderId: string,
  reason?: string,
): Promise<ActionResult> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await session.db.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason?.trim() || null,
  });

  if (error) return { ok: false, error: rpcError(error.message) };

  updateTag(PRODUCTS_TAG); // 재고가 돌아왔다
  return { ok: true, data: undefined };
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

  return { ok: true, data: undefined };
}
