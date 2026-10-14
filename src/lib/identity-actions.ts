"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { checkVerification, type IdentityVerificationRaw } from "./identity";
import { getIdentityVerification, PAYMENT_DB_SECRET } from "./payments/portone";
import { reportError } from "./report";
import { STORE_INFO } from "./store-info";
import { currentUserId, serverClient } from "./supabase/server";
import type { ActionResult } from "@/types/database";

/** DB 함수(0027)가 돌려주는 거절 사유를 손님이 읽을 말로. */
const DB_REASONS: Record<string, string> = {
  duplicate: `이미 다른 계정으로 본인인증을 하셨어요. 예전에 만드신 계정으로 로그인해 주세요. 기억나지 않으시면 ${STORE_INFO.phone} 으로 전화 주세요.`,
  other_person: `이 계정은 다른 분 명의로 인증돼 있어요. 본인 계정으로 로그인해 주세요.`,
  incomplete: `본인인증 결과를 받지 못했어요. 다시 시도해 주세요.`,
  anonymous: `로그인이 필요합니다.`,
};

/**
 * 본인인증을 마치고 돌아온 손님의 결과를 반영한다.
 *
 * 브라우저가 건네는 건 인증 건 아이디 하나뿐이다. 결과는 포트원에 다시 물어서
 * 받는다 — 결제와 같은 규칙이다. 휴대폰은 인증 화면이 페이지를 통째로 넘기므로
 * 돌아온 주소의 쿼리로 들어오는데, 그 값도 아이디로만 쓰고 결과는 믿지 않는다.
 *
 * agreed: 약관·개인정보 동의. 카카오로 들어온 손님은 이 화면에서 처음 동의한다.
 * 화면의 체크박스는 UX 이고 요청은 위조된다. 여기가 방어선이다 (signUp 과 같다).
 */
export async function confirmIdentity(
  identityVerificationId: string,
  agreed: boolean,
): Promise<ActionResult> {
  if (!agreed) {
    return { ok: false, error: "이용약관과 개인정보 수집·이용에 동의해 주세요." };
  }

  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const id = identityVerificationId.trim();
  if (!id) return { ok: false, error: "본인인증을 다시 시도해 주세요." };

  const fetched = await getIdentityVerification(id);
  if (!fetched.ok) {
    await reportError("identity-verify", fetched.error, id);
    return { ok: false, error: "본인인증 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  const check = checkVerification(fetched.data as IdentityVerificationRaw, userId);
  if (!check.ok) {
    /*
      no_key / no_phone 은 손님 잘못이 아니다 — PG 가 CI 나 번호를 주지 않는
      계약이라는 뜻이다. 사장님이 알아야 하므로 남긴다. 값은 남기지 않는다.
    */
    if (check.reason === "no_key" || check.reason === "no_phone") {
      const missing = check.reason === "no_key" ? "CI·DI" : "휴대폰 번호";
      await reportError("identity-verify", `인증 결과에 ${missing}가 없음 — KCP 계약 범위 확인 필요`, id);
      return { ok: false, error: `본인인증 결과를 받지 못했어요. ${STORE_INFO.phone} 으로 연락 주세요.` };
    }
    if (check.reason === "wrong_user") {
      return { ok: false, error: "본인인증 정보가 이 계정과 맞지 않아요. 다시 시도해 주세요." };
    }
    return { ok: false, error: "본인인증이 끝나지 않았어요. 다시 시도해 주세요." };
  }

  // CI 원본은 어디에도 저장하지 않는다. 같은 사람인지 가리는 데는 지문으로 충분하다.
  const ciHash = createHash("sha256").update(check.key).digest("hex");

  const db = await serverClient();
  const { data, error } = await db.rpc("apply_identity_verification", {
    p_ci_hash: ciHash,
    p_phone: check.phone,
    p_name: check.name,
    p_secret: PAYMENT_DB_SECRET,
  });

  if (error) {
    await reportError("identity-verify", error.message, id);
    return { ok: false, error: "본인인증을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  const result = data as { ok: boolean; reason?: string };
  if (!result.ok) {
    return {
      ok: false,
      error: DB_REASONS[result.reason ?? ""] ?? "본인인증을 저장하지 못했어요.",
    };
  }

  // 인증이 끝난 그 순간이 쿠폰을 줄 수 있는 첫 순간이다. 실패해도 되돌리지 않는다.
  await db.rpc("claim_signup_coupon");

  revalidatePath("/account");
  return { ok: true, data: undefined };
}
