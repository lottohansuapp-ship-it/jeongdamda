"use server";

import { updateTag } from "next/cache";
import { currentUserId } from "./supabase/server";
import { PRODUCTS_TAG } from "./queries";
import { confirmPayment } from "./payments/confirm";
import type { ActionResult } from "@/types/database";

/**
 * 결제창이 "성공"을 돌려준 직후 손님 화면이 부른다.
 *
 * 이게 없어도 웹훅이 결국 처리하지만 웹훅은 몇 초 늦게 온다. 그동안 손님은
 * "결제 대기"를 보고 결제가 안 된 줄 안다. 그래서 화면 쪽도 한 번 확인한다.
 *
 * **금액을 인자로 받지 않는다.** 손님이 보내는 값은 전부 위조 가능하다.
 * paymentId 만 받고 금액과 상태는 포트원에 다시 물어본다 — 웹훅과 같은 함수다.
 */
export async function confirmMyPayment(
  paymentId: string,
): Promise<ActionResult<{ applied: boolean; status: string }>> {
  // 로그인 확인은 남의 결제를 들여다보는 걸 막기 위한 것이다.
  // 실제 확정 권한은 confirmPayment 안의 비밀값이 가른다.
  if (!(await currentUserId())) {
    return { ok: false, error: "로그인이 필요합니다." };
  }

  const id = paymentId.trim();
  if (!id) return { ok: false, error: "결제 정보가 올바르지 않습니다." };

  const result = await confirmPayment(id);
  if (!result.ok) return { ok: false, error: result.error };

  // 확정되면 재고 예약이 확정 차감으로 바뀐다 — 목록도 그 사실을 알아야 한다.
  if (result.applied) updateTag(PRODUCTS_TAG);

  return { ok: true, data: { applied: result.applied, status: result.status } };
}
