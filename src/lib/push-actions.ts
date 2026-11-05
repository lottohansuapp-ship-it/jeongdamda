"use server";

import { friendlyDbError } from "./db-error";
import { getAdminAccess } from "./queries";
import { currentUserId, serverClient } from "./supabase/server";
import type { ActionResult } from "@/types/database";

/**
 * 관리자 기기의 「휴대폰 알림 켜기·끄기·시험」 (0032).
 * 관리자인지는 DB 함수 안의 is_admin() 이 가른다 — 여기 검사는 안내용이다.
 */
interface BrowserSubscription {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
}

export async function savePushSubscription(
  subscription: BrowserSubscription,
  userAgent: string,
): Promise<ActionResult> {
  if (!(await currentUserId())) return { ok: false, error: "로그인이 필요합니다." };
  const p256dh = subscription.keys?.p256dh ?? "";
  const auth = subscription.keys?.auth ?? "";
  if (!subscription.endpoint || !p256dh || !auth) {
    return { ok: false, error: "이 기기에서 알림 주소를 받지 못했어요. 다시 눌러 주세요." };
  }

  const db = await serverClient();
  const { error } = await db.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: userAgent.slice(0, 300),
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true, data: undefined };
}

export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  if (!(await currentUserId())) return { ok: false, error: "로그인이 필요합니다." };
  const db = await serverClient();
  const { error } = await db.rpc("delete_push_subscription", { p_endpoint: endpoint });
  if (error) return { ok: false, error: friendlyDbError(error) };
  return { ok: true, data: undefined };
}

/** 켠 뒤 한 번 눌러 보는 시험 알림. 알림을 켠 관리자 기기 모두에 간다. */
export async function sendTestPush(): Promise<ActionResult<{ sent: number }>> {
  const access = await getAdminAccess();
  if (!access.admin) return { ok: false, error: "관리자만 할 수 있어요." };

  const { isPushReady, sendStorePush } = await import("./notify/push");
  if (!isPushReady()) {
    return { ok: false, error: "알림 키가 아직 서버에 설정되지 않았어요 (VAPID)." };
  }
  const result = await sendStorePush({
    title: "정담따 알림 시험",
    body: "알림이 잘 와요. 새 주문이 들어오면 이렇게 알려 드려요.",
    url: "/admin/orders",
    tag: "test",
  });
  if (result.sent === 0) {
    return { ok: false, error: result.error ?? "알림을 켠 기기가 없어요." };
  }
  return { ok: true, data: { sent: result.sent } };
}
