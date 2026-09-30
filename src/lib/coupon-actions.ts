"use server";

import { currentUserId, serverClient } from "./supabase/server";
import type { ActionResult } from "@/types/database";

/** 로그인만 본다. 관리자인지는 RLS 와 grant_coupon 안의 is_admin() 이 판단한다. */
async function authed() {
  return (await currentUserId()) ? await serverClient() : null;
}

function readInt(formData: FormData, key: string): number {
  const value = Number(formData.get(key) ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export async function createCoupon(formData: FormData): Promise<ActionResult> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "쿠폰 이름을 입력하세요." };

  const discount = readInt(formData, "discount");
  if (discount <= 0) return { ok: false, error: "할인 금액을 입력하세요." };

  const validDays = readInt(formData, "valid_days");
  if (validDays <= 0) return { ok: false, error: "유효기간을 입력하세요." };

  /*
    새로 만드는 쿠폰은 늘 '직접 발급'(manual)이다.

    가입 쿠폰(signup)은 한 번에 하나만 켜질 수 있어서, 새로 만들면 기존
    것과 부딪힌다. 가입 쿠폰의 금액을 바꾸고 싶으면 있는 것을 고치면 된다.
  */
  const { error } = await db.from("coupons").insert({
    name,
    kind: "manual",
    discount,
    min_order: readInt(formData, "min_order"),
    valid_days: validDays,
    // 만들자마자 켜지 않는다. 금액을 확인하고 사장님이 켜신다.
    is_active: false,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function updateCoupon(
  id: string,
  patch: { discount?: number; min_order?: number; valid_days?: number },
): Promise<ActionResult> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await db.from("coupons").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export async function setCouponActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await db
    .from("coupons")
    .update({ is_active: active })
    .eq("id", id);

  if (error) {
    // 가입 쿠폰은 한 번에 하나만 켜진다 (0026 의 부분 유니크 인덱스).
    if (error.code === "23505") {
      return {
        ok: false,
        error:
          "가입 쿠폰은 한 번에 하나만 켤 수 있어요. 쓰던 것을 먼저 끄세요.",
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: undefined };
}

/**
 * 고른 회원들에게 쿠폰을 보낸다.
 *
 * 권한 판단은 DB 함수 안의 is_admin() 이 한다 — 여기 검사는 UX 용이지
 * 방어선이 아니다. 이미 받은 사람은 건너뛰고 실제로 간 수를 돌려준다.
 */
export async function grantCoupon(
  couponId: string,
  userIds: string[],
): Promise<ActionResult<{ granted: number }>> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };
  if (userIds.length === 0) {
    return { ok: false, error: "보낼 회원을 고르세요." };
  }

  const { data, error } = await db.rpc("grant_coupon", {
    p_coupon_id: couponId,
    p_user_ids: userIds,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { granted?: number } | null;
  return { ok: true, data: { granted: result?.granted ?? 0 } };
}
