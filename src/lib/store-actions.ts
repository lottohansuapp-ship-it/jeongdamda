"use server";

import { updateTag } from "next/cache";
import { serverClient } from "./supabase/server";
import { STORE_TAG } from "./queries";
import { parseClockTime } from "./store";
import type { ActionResult } from "@/types/database";

async function authed() {
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user ? db : null;
}

function readInt(formData: FormData, key: string): number {
  const value = Number(formData.get(key) ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** "09:00" 을 받아 "09:00" 으로 돌려준다. 형식이 아니면 null. */
function readTime(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(raw)) return null;

  const minutes = parseClockTime(raw);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1439) return null;
  return raw.padStart(5, "0");
}

export async function updateStoreSettings(
  formData: FormData,
): Promise<ActionResult> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  const openTime = readTime(formData, "open_time");
  const closeTime = readTime(formData, "close_time");
  if (!openTime || !closeTime) {
    return { ok: false, error: "영업 시각을 09:00 형태로 입력해 주세요." };
  }

  const pickup = formData.get("pickup_enabled") === "on";
  const delivery = formData.get("delivery_enabled") === "on";
  if (!pickup && !delivery) {
    return {
      ok: false,
      error: "픽업과 배달 중 최소 하나는 켜져 있어야 손님이 주문할 수 있어요.",
    };
  }

  const closedWeekdays = formData
    .getAll("closed_weekdays")
    .map((value) => Number(value))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  const notice = String(formData.get("notice") ?? "").trim();

  const { error } = await db
    .from("store_settings")
    .update({
      is_open: formData.get("is_open") === "on",
      open_time: openTime,
      close_time: closeTime,
      closed_weekdays: closedWeekdays,
      pickup_enabled: pickup,
      delivery_enabled: delivery,
      min_order_amount: readInt(formData, "min_order_amount"),
      delivery_fee: readInt(formData, "delivery_fee"),
      restrict_delivery_area: formData.get("restrict_delivery_area") === "on",
      pickup_lead_minutes: readInt(formData, "pickup_lead_minutes"),
      notice: notice || null,
    })
    .eq("id", 1);

  if (error) return { ok: false, error: error.message };

  updateTag(STORE_TAG);
  return { ok: true, data: undefined };
}

export async function saveDeliveryArea(
  formData: FormData,
): Promise<ActionResult> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "지역 이름을 입력해 주세요." };

  const rawMin = String(formData.get("min_amount") ?? "").trim();

  const row = {
    name,
    fee: readInt(formData, "fee"),
    // 비워두면 매장 기본 최소주문금액을 따른다
    min_amount: rawMin === "" ? null : readInt(formData, "min_amount"),
    is_active: formData.get("is_active") === "on",
    sort_order: readInt(formData, "sort_order"),
  };

  const { error } = id
    ? await db.from("delivery_areas").update(row).eq("id", id)
    : await db.from("delivery_areas").insert(row);

  if (error) return { ok: false, error: error.message };

  updateTag(STORE_TAG);
  return { ok: true, data: undefined };
}

export async function deleteDeliveryArea(id: string): Promise<ActionResult> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await db.from("delivery_areas").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  updateTag(STORE_TAG);
  return { ok: true, data: undefined };
}
