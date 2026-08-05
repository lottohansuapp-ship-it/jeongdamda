import "server-only";
import { publicClient } from "../supabase/public";
import { STORE_INFO } from "../store-info";
import {
  customerMessage,
  shouldNotifyCustomer,
  storeMessage,
  type NotifyKind,
  type NotifyOrder,
} from "./messages";

/**
 * 알림 발송 (D13 — 어댑터 뒤에 둔다).
 *
 * 알림톡은 카카오 비즈니스 채널 개설 + 대행사 계약 + 템플릿 사전승인이 필요하고
 * 몇 주가 걸린다. 그동안 코드가 멈추면 안 되므로, 대행사 설정이 없으면
 * **기록만 남기고 조용히 넘어간다.** 켜는 날 고칠 코드는 alimtalk.ts 하나다.
 *
 * 이 파일의 함수는 **절대 던지지 않는다.** 알림이 안 갔다고 주문이 실패하면 안 된다.
 * 대신 실패도 notification_logs 에 남겨 나중에 볼 수 있게 한다.
 */
export type { NotifyKind };

async function record(
  orderId: string,
  kind: NotifyKind,
  channel: string,
  recipient: string,
  status: "sent" | "failed",
  error?: string,
) {
  try {
    await publicClient().rpc("log_notification", {
      p_order_id: orderId,
      p_kind: kind,
      p_channel: channel,
      p_recipient: recipient,
      p_status: status,
      p_error: error ?? null,
    });
  } catch {
    // 기록조차 실패했다. 여기서 더 할 수 있는 일이 없고,
    // 이것 때문에 주문 처리를 멈출 수는 없다.
  }
}

async function deliver(
  orderId: string,
  kind: NotifyKind,
  phone: string,
  text: string,
): Promise<void> {
  try {
    const { sendAlimtalk, isAlimtalkReady } = await import("./alimtalk");

    if (!isAlimtalkReady()) {
      // 아직 대행사가 없다. 나갔어야 할 내용을 기록해 두면
      // 켜기 전에 문안을 눈으로 확인할 수 있다.
      await record(orderId, kind, "log", phone, "sent");
      return;
    }

    const result = await sendAlimtalk(phone, text);
    await record(
      orderId,
      kind,
      "alimtalk",
      phone,
      result.ok ? "sent" : "failed",
      result.ok ? undefined : result.error,
    );

    if (!result.ok) {
      // 매장이 새 주문을 못 받는 상황이다. 기록만으로는 아무도 안 본다.
      const { reportError } = await import("../report");
      await reportError("notify", result.error, kind);
    }
  } catch (error) {
    await record(
      orderId,
      kind,
      "alimtalk",
      phone,
      "failed",
      error instanceof Error ? error.message : "알 수 없는 오류",
    );
  }
}

/**
 * 주문 정보를 한 번에 읽는다. 알림마다 여러 번 조회하지 않는다.
 *
 * **테이블을 직접 읽지 않고 RPC 를 쓰는 이유** (0018):
 * 예전에는 `publicClient().from("orders")` 로 읽었다. 그런데 결제 웹훅은
 * 서버 대 서버 호출이라 세션이 없어 role 이 anon 이고, orders 의 select 정책은
 * 둘 다 authenticated 전용이다. RLS 는 오류가 아니라 **0행**을 돌려주므로
 * 이 함수가 늘 null 을 반환했고, 알림이 한 통도 안 나가는데 아무도 몰랐다.
 *
 * order_for_notify 는 app_secrets 의 비밀값으로 잠근 SECURITY DEFINER 함수다.
 * 세션이 없어도 되고, 비밀값을 모르면 한 줄도 못 읽는다.
 */
async function loadOrder(
  orderId: string,
): Promise<(NotifyOrder & { receiver_phone: string }) | null> {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) return null; // 아직 결제를 안 켰다. 호출부가 이유를 기록한다.

  try {
    const { data, error } = await publicClient().rpc("order_for_notify", {
      p_order_id: orderId,
      p_secret: secret,
    });

    if (error || !data) return null;
    return data as unknown as NotifyOrder & { receiver_phone: string };
  } catch {
    return null;
  }
}

/**
 * 주문을 못 읽으면 알림을 보낼 수 없다. 그냥 돌아가면 안 된다.
 *
 * 예전에 여기가 조용히 return 만 해서, 알림이 통째로 죽어 있는데도
 * notification_logs 에 아무 흔적이 없었다. 실패는 반드시 남긴다.
 */
async function reportMissingOrder(
  orderId: string,
  kind: NotifyKind,
): Promise<void> {
  const reason = process.env.PAYMENT_WEBHOOK_SECRET
    ? "주문을 읽지 못했습니다 (order_for_notify)"
    : "PAYMENT_WEBHOOK_SECRET 이 없어 주문을 읽을 수 없습니다";

  await record(orderId, kind, "alimtalk", "", "failed", reason);

  const { reportError } = await import("../report");
  await reportError("notify", reason, orderId);
}

/** 결제가 확정된 순간 매장에 보낸다. 사장님이 화면을 안 보고 있어도 알아야 한다. */
export async function notifyNewOrder(orderId: string): Promise<void> {
  const order = await loadOrder(orderId);
  if (!order) {
    // 매장이 새 주문을 못 받는 상황이다. 조용히 넘어가면 아무도 모른다.
    await reportMissingOrder(orderId, "new_order");
    return;
  }

  await deliver(orderId, "new_order", STORE_INFO.phone, storeMessage(order));
}

/** 사장님이 상태를 바꾸면 손님에게 보낸다. */
export async function notifyCustomer(
  orderId: string,
  kind: NotifyKind,
): Promise<void> {
  if (!shouldNotifyCustomer(kind)) return;

  const order = await loadOrder(orderId);
  if (!order) {
    await reportMissingOrder(orderId, kind);
    return;
  }
  // 번호가 비어 있는 건 주문을 못 읽은 것과 다르다. 남길 것이 없다.
  if (!order.receiver_phone) return;

  const text = customerMessage(order, kind);
  if (!text) return;

  await deliver(orderId, kind, order.receiver_phone, text);
}
