"use server";

import { revalidatePath } from "next/cache";
import { currentUserId, serverClient } from "./supabase/server";
import { normalizePhone } from "./format";
import type { ActionResult } from "@/types/database";

async function authed() {
  const userId = await currentUserId();
  if (!userId) return null;
  return { db: await serverClient(), userId };
}

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const name = String(formData.get("name") ?? "").trim();
  const rawPhone = String(formData.get("phone") ?? "").trim();

  if (!name) return { ok: false, error: "이름을 입력해 주세요." };

  /**
   * 전화번호를 비운 채로 저장할 수 없다.
   *
   * 예전에는 빈 값이면 조용히 null 로 저장했다. 그런데 주문에는 연락처가
   * 반드시 필요해서, 다음에 주문하려는 순간 "가입 마무리" 화면으로 튕겼다.
   * 이름만 고치려다 실수로 번호를 지운 손님은 왜 갑자기 그 화면이 뜨는지
   * 알 수가 없다. 지우는 그 자리에서 막는다.
   */
  if (!rawPhone) {
    return { ok: false, error: "휴대폰 번호를 입력해 주세요." };
  }

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return { ok: false, error: "휴대폰 번호를 다시 확인해 주세요." };
  }

  const { error } = await session.db
    .from("profiles")
    .update({ name, phone })
    .eq("id", session.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/account");
  return { ok: true, data: undefined };
}

export async function saveAddress(formData: FormData): Promise<ActionResult> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const id = String(formData.get("id") ?? "").trim();
  const address1 = String(formData.get("address1") ?? "").trim();
  const address2 = String(formData.get("address2") ?? "").trim();
  const postcode = String(formData.get("postcode") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const isDefault = formData.get("is_default") === "on";

  if (!address1) {
    return { ok: false, error: "주소 검색으로 주소를 선택해 주세요." };
  }

  // 기본 배송지는 사용자당 하나 — DB 유니크 인덱스가 있으니 먼저 내려놓는다
  if (isDefault) {
    const { error } = await session.db
      .from("addresses")
      .update({ is_default: false })
      .eq("user_id", session.userId)
      .eq("is_default", true);
    if (error) return { ok: false, error: error.message };
  }

  const row = {
    user_id: session.userId,
    label: label || null,
    postcode: postcode || null,
    address1,
    address2: address2 || null,
    is_default: isDefault,
  };

  const { error } = id
    ? await session.db
        .from("addresses")
        .update(row)
        .eq("id", id)
        .eq("user_id", session.userId)
    : await session.db.from("addresses").insert(row);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/account");
  return { ok: true, data: undefined };
}

export async function setDefaultAddress(id: string): Promise<ActionResult> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const cleared = await session.db
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", session.userId)
    .eq("is_default", true);
  if (cleared.error) return { ok: false, error: cleared.error.message };

  const { error } = await session.db
    .from("addresses")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", session.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/account");
  return { ok: true, data: undefined };
}

export async function deleteAddress(id: string): Promise<ActionResult> {
  const session = await authed();
  if (!session) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await session.db
    .from("addresses")
    .delete()
    .eq("id", id)
    .eq("user_id", session.userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/account");
  return { ok: true, data: undefined };
}
