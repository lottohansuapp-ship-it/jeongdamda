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

  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) {
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
