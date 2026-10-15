"use server";

import { currentUserId, serverClient } from "./supabase/server";
import { MAX_PER_ITEM, planReorder, planTidy } from "./cart";
import type { ActionResult } from "@/types/database";

async function authed() {
  const userId = await currentUserId();
  if (!userId) return null;
  return { db: await serverClient(), userId };
}

/**
 * 장바구니는 캐시하지 않는다 (cookies() 를 읽으므로 매 요청 다시 그려진다).
 * 그래서 서버에서 무효화할 것이 없다.
 *
 * 예전에는 여기서 revalidatePath("/", "layout") 을 불렀다. 하단 탭 뱃지 때문이었는데
 * 그 뱃지도 어차피 매 요청 다시 그려지므로 필요가 없었고, 대신 앱 전체의 정적 셸을
 * 통째로 버려서 담기를 누를 때마다 모든 화면이 처음부터 다시 만들어졌다.
 * 화면 갱신은 각 컴포넌트의 router.refresh() 가 맡는다.
 */

/**
 * 담기. 이미 있으면 수량을 더한다.
 * 재고는 여기서 잡지 않는다 (D11) — 담긴 수량이 재고를 넘어도 저장은 되고,
 * 화면이 알려주고, 실제 차단은 주문 시점에 DB 가 한다.
 */
export async function addToCart(
  productId: string,
  quantity: number,
): Promise<ActionResult<{ quantity: number }>> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const amount = Math.round(quantity);
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, error: "수량을 확인해 주세요." };
  }

  const { data: existing, error: readError } = await session.db
    .from("cart_items")
    .select("quantity")
    .eq("user_id", session.userId)
    .eq("product_id", productId)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };

  const next = Math.min(MAX_PER_ITEM, (existing?.quantity ?? 0) + amount);

  const { error } = await session.db.from("cart_items").upsert(
    {
      user_id: session.userId,
      product_id: productId,
      quantity: next,
    },
    { onConflict: "user_id,product_id" },
  );

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { quantity: next } };
}

export async function removeFromCart(productId: string): Promise<ActionResult> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await session.db
    .from("cart_items")
    .delete()
    .eq("user_id", session.userId)
    .eq("product_id", productId);

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: undefined };
}

export async function setCartQuantity(
  productId: string,
  quantity: number,
): Promise<ActionResult> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const amount = Math.round(quantity);
  if (!Number.isFinite(amount)) {
    return { ok: false, error: "수량을 확인해 주세요." };
  }
  if (amount < 1) return removeFromCart(productId);

  const { error } = await session.db
    .from("cart_items")
    .update({ quantity: Math.min(MAX_PER_ITEM, amount) })
    .eq("user_id", session.userId)
    .eq("product_id", productId);

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: undefined };
}

/**
 * 지난 주문 그대로 다시 담기.
 *
 * 반찬가게 매출은 단골 재구매에서 나온다. 매번 같은 대여섯 가지를 고르려고
 * 목록을 훑는 건 손님에게 가장 지루한 일이다.
 *
 * 장바구니를 비우지 않고 **더한다.** 뭔가 담아둔 채로 눌렀을 때 그게 사라지면
 * 손님은 무엇을 잃었는지 모른다.
 *
 * 오늘 없는 반찬은 조용히 빼지 않고 몇 개가 빠졌는지 알린다 —
 * 말없이 빼면 손님은 지난번과 다른 걸 받게 된다.
 */
export async function reorder(
  orderId: string,
): Promise<ActionResult<{ added: number; skipped: number; reduced: number }>> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  // 남의 주문은 RLS 가 0행으로 막는다. 여기서 권한을 다시 따질 필요가 없다.
  const { data, error } = await session.db
    .from("order_items")
    .select("product_id, quantity, order:orders!inner(id)")
    .eq("order_id", orderId);

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "주문을 찾을 수 없어요." };
  }

  const wanted = (
    data as unknown as { product_id: string | null; quantity: number }[]
  ).filter((row): row is { product_id: string; quantity: number } =>
    Boolean(row.product_id),
  );

  // 오늘 판매 중인 반찬과 남은 재고. 판매를 껐거나 지운 상품은 RLS 가 감춘다.
  // 재고까지 읽는 이유: 예전엔 판매 여부만 봐서 품절(재고 0)까지 담았고, 장바구니가
  // 막혀 단골이 품절마다 삭제를 눌러야 했다 (planReorder 참조).
  const { data: alive, error: readError } = await session.db
    .from("products")
    .select("id, today_stock")
    .in(
      "id",
      wanted.map((row) => row.product_id),
    )
    .eq("today_available", true);
  if (readError) return { ok: false, error: readError.message };

  // 이미 담긴 것과 합친다. 그래서 그냥 덮지 않고 기존 수량을 읽어 더한다.
  const { data: current, error: cartError } = await session.db
    .from("cart_items")
    .select("product_id, quantity")
    .eq("user_id", session.userId);
  if (cartError) return { ok: false, error: cartError.message };

  const plan = planReorder(
    wanted,
    new Map((alive ?? []).map((row) => [row.id as string, row.today_stock as number])),
    new Map((current ?? []).map((row) => [row.product_id as string, row.quantity as number])),
  );
  // 지운 상품(product_id 가 비어 있음)도 "오늘 없음" 으로 함께 센다.
  const skipped = plan.soldOut + (data.length - wanted.length);

  if (plan.rows.length === 0) {
    return {
      ok: false,
      error:
        plan.reduced > 0
          ? "지난번 반찬은 이미 남은 만큼 장바구니에 담겨 있어요."
          : "지난번에 담으신 반찬이 오늘은 모두 품절이에요.",
    };
  }

  const { error: writeError } = await session.db.from("cart_items").upsert(
    plan.rows.map((row) => ({
      user_id: session.userId,
      product_id: row.product_id,
      quantity: row.quantity,
    })),
    { onConflict: "user_id,product_id" },
  );

  if (writeError) return { ok: false, error: writeError.message };

  return { ok: true, data: { added: plan.rows.length, skipped, reduced: plan.reduced } };
}

/**
 * 주문 못 하는 반찬 한 번에 정리 (planTidy). 품절·판매 중지·지운 반찬은 빼고,
 * 재고보다 많이 담은 반찬은 남은 수량으로 맞춘다.
 *
 * 판단은 서버가 지금 재고로 다시 한다 — 화면에 보이던 재고는 낡았을 수 있다.
 */
export async function tidyCart(): Promise<ActionResult<{ removed: number; capped: number }>> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const { data, error } = await session.db
    .from("cart_items")
    .select("product_id, quantity, product:products(today_available, today_stock)")
    .eq("user_id", session.userId);
  if (error) return { ok: false, error: error.message };

  const plan = planTidy(
    (data ?? []) as unknown as {
      product_id: string;
      quantity: number;
      product: { today_available: boolean; today_stock: number } | null;
    }[],
  );

  if (plan.remove.length > 0) {
    const { error: removeError } = await session.db
      .from("cart_items")
      .delete()
      .eq("user_id", session.userId)
      .in("product_id", plan.remove);
    if (removeError) return { ok: false, error: removeError.message };
  }

  for (const row of plan.cap) {
    const { error: capError } = await session.db
      .from("cart_items")
      .update({ quantity: row.quantity })
      .eq("user_id", session.userId)
      .eq("product_id", row.product_id);
    if (capError) return { ok: false, error: capError.message };
  }

  return { ok: true, data: { removed: plan.remove.length, capped: plan.cap.length } };
}

export async function clearCart(): Promise<ActionResult> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await session.db
    .from("cart_items")
    .delete()
    .eq("user_id", session.userId);

  if (error) return { ok: false, error: error.message };

  return { ok: true, data: undefined };
}
