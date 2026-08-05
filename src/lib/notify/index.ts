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

/** 주문 정보를 한 번에 읽는다. 알림마다 여러 번 조회하지 않는다. */
async function loadOrder(
  orderId: string,
): Promise<(NotifyOrder & { receiver_phone: string }) | null> {
  try {
    const { data } = await publicClient()
      .from("orders")
      .select(
        "order_no, fulfillment, total, address_snapshot, pickup_at, created_at, receiver_phone, items:order_items(name, quantity)",
      )
      .eq("id", orderId)
      .maybeSingle();

    return (data as unknown as NotifyOrder & { receiver_phone: string }) ?? null;
  } catch {
    return null;
  }
}

/** 결제가 확정된 순간 매장에 보낸다. 사장님이 화면을 안 보고 있어도 알아야 한다. */
export async function notifyNewOrder(orderId: string): Promise<void> {
  const order = await loadOrder(orderId);
  if (!order) return;

  await deliver(orderId, "new_order", STORE_INFO.phone, storeMessage(order));
}

/** 사장님이 상태를 바꾸면 손님에게 보낸다. */
export async function notifyCustomer(
  orderId: string,
  kind: NotifyKind,
): Promise<void> {
  if (!shouldNotifyCustomer(kind)) return;

  const order = await loadOrder(orderId);
  if (!order?.receiver_phone) return;

  const text = customerMessage(order, kind);
  if (!text) return;

  await deliver(orderId, kind, order.receiver_phone, text);
}
