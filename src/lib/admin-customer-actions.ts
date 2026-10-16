"use server";

import { friendlyDbError } from "./db-error";
import { normalizePhone } from "./format";
import { currentUserId, serverClient } from "./supabase/server";
import type { ActionResult } from "@/types/database";

/**
 * 손님 비밀번호를 임시 비밀번호(숫자 8자리)로 바꾼다 — 휴대폰 번호로 가입한 손님이
 * 비밀번호를 잊고 전화했을 때. 관리자인지는 DB 함수(0031)의 is_admin() 이 가른다.
 */
export async function resetCustomerPassword(
  rawPhone: string,
): Promise<ActionResult<{ name: string | null; password: string }>> {
  if (!(await currentUserId())) return { ok: false, error: "로그인이 필요합니다." };

  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "휴대폰 번호를 다시 확인해 주세요." };

  const db = await serverClient();
  const { data, error } = await db.rpc("admin_reset_password", { p_phone: phone });
  if (error) return { ok: false, error: friendlyDbError(error) };

  const result = data as { found: boolean; name?: string | null; password?: string } | null;
  if (!result?.found || !result.password) {
    return { ok: false, error: `${phone} 으로 가입한 손님이 없어요.` };
  }
  return { ok: true, data: { name: result.name ?? null, password: result.password } };
}
