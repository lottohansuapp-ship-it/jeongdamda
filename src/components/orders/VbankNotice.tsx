"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/format";
import { formatClock } from "@/lib/orders";
import { bankLabel } from "@/lib/payments/vbank";
import type { Order } from "@/types/database";

/**
 * 가상계좌 입금 안내. 계좌가 발급되고 아직 입금 전인 주문에만 보인다.
 *
 * 손님이 이 화면을 보고 은행 앱으로 넘어간다. 계좌번호를 손으로 옮겨 적다
 * 틀리면 입금이 안 되므로 복사 버튼을 크게 둔다. 금액도 함께 보여 준다 —
 * 가상계좌는 주문 금액과 정확히 같아야 입금된다.
 */
export function VbankNotice({ order }: { order: Order }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(order.vbank_account ?? "");
      setCopied(true);
    } catch {
      // 복사가 막힌 브라우저(카카오톡 인앱 등). 번호가 화면에 크게 있으니 그대로 둔다.
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 rounded-[12px] bg-cream p-4">
      <p className="text-[13px] text-ink-soft">아래 계좌로 입금하면 주문이 확정돼요</p>

      <dl className="mt-3 space-y-2 text-[14px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-faint">은행</dt>
          <dd>{bankLabel(order.vbank_bank)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-faint">계좌번호</dt>
          <dd className="flex items-center gap-2">
            <span className="text-[16px] tabular-nums tracking-tight">{order.vbank_account}</span>
            <button
              type="button"
              onClick={copy}
              className="tap-target rounded-pill border border-line bg-white px-3 text-[12.5px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
            >
              {copied ? "복사됨" : "복사"}
            </button>
          </dd>
        </div>
        {order.vbank_holder && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-faint">예금주</dt>
            <dd>{order.vbank_holder}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-faint">입금할 금액</dt>
          <dd className="text-[16px] tabular-nums tracking-tight">{formatPrice(order.total)}</dd>
        </div>
      </dl>

      <p className="pt-3 text-[13px] leading-relaxed">
        <strong className="font-normal text-clay-deep">{formatClock(order.vbank_due)}</strong>
        까지 입금해 주세요. 지나면 계좌가 닫히고 주문이 자동으로 취소돼요.
      </p>
      {/* 화면이 바뀐 걸 알 수 있게 — 입금되면 이 상자가 사라지고 "결제 완료" 로 바뀐다. */}
      <span role="status" className="sr-only">
        {copied ? "계좌번호를 복사했어요" : ""}
      </span>
    </div>
  );
}
