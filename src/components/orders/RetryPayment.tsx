"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { confirmMyPayment } from "@/lib/payment-actions";
import { PORTONE_CHANNELS } from "@/lib/payments/config";
import {
  availableMethods,
  KCP_EXTRAS,
  pickMethod,
  type PaymentMethodKey,
} from "@/lib/payments/methods";
import { openPaymentWindow, orderNameFrom } from "@/lib/payments/open-window";
import type { OrderWithItems } from "@/types/database";

/**
 * 결제가 안 된 주문에서 결제 수단을 바꿔 다시 결제한다.
 *
 * 예전엔 결제창이 실패하거나 수단을 바꾸고 싶으면 주문을 취소하고 처음부터
 * 다시 담아야 했다. 같은 주문의 결제번호로 결제창을 다시 연다 — 포트원은
 * 이미 결제된 번호를 거절하므로 두 번 빠질 일이 없다.
 *
 * **남은 시간이 2분 넘을 때만** 연다. 주문은 10분 뒤 자동 취소되는데, 그 직전에
 * 결제창을 열면 결제 도중 주문이 취소될 수 있다. 그렇게 돼도 돈은 자동으로
 * 돌려주지만(needsRefund), 손님이 헛걸음하지 않게 미리 막는다.
 */
const MIN_LEFT_MS = 2 * 60 * 1000;
const TICK_MS = 15 * 1000;

function subscribe(callback: () => void) {
  const id = setInterval(callback, TICK_MS);
  return () => clearInterval(id);
}

export function RetryPayment({ order }: { order: OrderWithItems }) {
  const router = useRouter();
  const methods = useMemo(() => availableMethods(PORTONE_CHANNELS, KCP_EXTRAS), []);
  const [methodKey, setMethodKey] = useState<PaymentMethodKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서버에서는 지금 시각을 모른다(프리렌더). 브라우저에서만 15초마다 다시 본다.
  const now = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / TICK_MS) * TICK_MS,
    () => null,
  );

  const method = pickMethod(methods, methodKey);
  const paymentId = order.payment_id;
  if (order.status !== "pending_payment" || !paymentId || !method || now === null) return null;

  const deadline = order.reserved_until ? Date.parse(order.reserved_until) : 0;
  const msLeft = deadline - now;

  if (msLeft <= MIN_LEFT_MS) {
    return (
      <p className="mt-2.5 rounded-card bg-cream px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
        결제할 수 있는 시간이 얼마 남지 않았어요. 이 주문은 곧 자동으로 취소되니,
        잠시 뒤 장바구니에서 다시 주문해 주세요.
      </p>
    );
  }

  async function retry() {
    if (!method || !paymentId) return;
    setError(null);
    setBusy(true);

    // 이미 결제가 끝났는데 화면만 못 따라온 경우(휴대폰에서 돌아오다 끊김)를 먼저 본다.
    // 그때 결제창을 또 열면 포트원이 거절하고 손님만 헷갈린다.
    const before = await confirmMyPayment(paymentId).catch(() => null);
    if (before?.ok && before.data.status === "paid") {
      router.refresh();
      return;
    }

    const paid = await openPaymentWindow({
      method,
      paymentId,
      // 금액·이름은 화면 계산이 아니라 주문에 저장된 값이다. 서버가 이 금액과
      // 포트원 결제 금액을 다시 대조한다.
      amount: order.total,
      orderName: orderNameFrom(order.items.map((item) => item.name)),
      customerName: order.receiver_name,
      customerPhone: order.receiver_phone,
      shopUserId: order.user_id ?? "",
      redirectUrl: `${window.location.origin}/orders/${order.id}`,
    });

    if (!paid.ok) {
      // 이 화면에 그대로 머문다. 수단을 바꿔 바로 다시 누를 수 있게.
      setError(paid.error);
      setBusy(false);
      return;
    }

    await confirmMyPayment(paymentId).catch(() => null);
    router.refresh();
  }

  const minutes = Math.ceil(msLeft / 60000);

  return (
    <section className="mt-2.5 rounded-card bg-white p-4 shadow-soft">
      <h2 className="text-[15px]">다시 결제하기</h2>
      <p className="pt-1 text-[12.5px] leading-relaxed text-ink-soft">
        결제 수단을 바꿔서 다시 결제할 수 있어요. 약 {minutes}분 안에 결제해 주세요.
      </p>

      {methods.length > 1 && (
        <div className="space-y-2 pt-3">
          {methods.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMethodKey(option.key)}
              aria-pressed={method.key === option.key}
              className={`tap-target flex w-full items-center justify-between gap-3 rounded-[12px] border px-4 text-left transition-colors duration-200 ${
                method.key === option.key
                  ? "border-olive bg-olive-soft"
                  : "border-line bg-canvas hover:border-ink-faint"
              }`}
            >
              <span className="py-2.5">
                <span className="block text-[14.5px]">{option.label}</span>
                <span className="block pt-0.5 text-[12px] text-ink-soft">{option.hint}</span>
              </span>
              {method.key === option.key && (
                <span aria-hidden className="text-[15px] text-olive-deep">
                  &#10003;
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="pt-3 text-[13px] leading-relaxed text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="tap-target mt-3 w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-50"
      >
        {busy ? "결제창 여는 중…" : `${method.label}로 결제하기`}
      </button>
    </section>
  );
}
