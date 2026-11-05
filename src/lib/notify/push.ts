import "server-only";
import webpush from "web-push";
import { publicClient } from "../supabase/public";
import { STORE_INFO } from "../store-info";

/**
 * 사장님 휴대폰 푸시 알림 (0032, 2026-11-05 사용자 결정).
 *
 * 관리자 앱을 닫아도 새 주문이 오면 휴대폰 위에 알림이 뜬다. 웹 푸시 표준(VAPID)이라
 * 문자·알림톡과 달리 건당 요금이 없다.
 *
 * 받을 기기 목록은 DB 의 push_targets 가 비밀값을 확인한 뒤에만 준다 — 결제 웹훅에는
 * 로그인 세션이 없어서다(order_for_notify 와 같은 방식).
 *
 * 이 파일의 함수는 던지지 않는다. 알림이 실패했다고 결제 확정이 실패하면 안 된다.
 */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const DB_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? "";

/** 휴대폰이 꺼져 있으면 알림 서버가 이만큼 들고 있다가 켜질 때 준다. 반찬 주문이라 하루면 충분하다. */
const TTL_SECONDS = 24 * 60 * 60;
const SEND_TIMEOUT_MS = 10_000;

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  error?: string;
}

export function isPushReady(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY && DB_SECRET);
}

interface Target {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function sendStorePush(payload: PushPayload): Promise<PushResult> {
  if (!isPushReady()) {
    return { sent: 0, failed: 0, error: "알림 키(VAPID)가 아직 설정되지 않았어요" };
  }

  try {
    webpush.setVapidDetails(`mailto:${STORE_INFO.email}`, PUBLIC_KEY, PRIVATE_KEY);

    const db = publicClient();
    const { data, error } = await db.rpc("push_targets", { p_secret: DB_SECRET });
    if (error) return { sent: 0, failed: 0, error: error.message };

    const targets = (data ?? []) as Target[];
    const body = JSON.stringify(payload);

    const results = await Promise.allSettled(
      targets.map((target) =>
        webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          body,
          { TTL: TTL_SECONDS, urgency: "high", timeout: SEND_TIMEOUT_MS },
        ),
      ),
    );

    let sent = 0;
    let failed = 0;
    let lastError: string | undefined;
    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        sent += 1;
        continue;
      }
      failed += 1;
      const reason = result.reason as { statusCode?: number; message?: string };
      // 404·410 = 그 기기가 알림을 해제했거나 앱을 지웠다. 목록에서 뺀다 — 두면 매번 실패한다.
      if (reason?.statusCode === 404 || reason?.statusCode === 410) {
        await db.rpc("drop_push_subscription", {
          p_endpoint: targets[index].endpoint,
          p_secret: DB_SECRET,
        });
      } else {
        lastError = reason?.message ?? "알 수 없는 오류";
      }
    }

    return { sent, failed, error: lastError };
  } catch (error) {
    return { sent: 0, failed: 0, error: error instanceof Error ? error.message : "알 수 없는 오류" };
  }
}
