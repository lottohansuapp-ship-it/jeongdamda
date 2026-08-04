"use server";

import { currentUserId, serverClient } from "./supabase/server";
import { MAX_PER_ITEM } from "./cart";
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
