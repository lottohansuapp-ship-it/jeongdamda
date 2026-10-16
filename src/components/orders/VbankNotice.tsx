"use client";

import { useState, useSyncExternalStore } from "react";
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
const noop = () => () => {};

export function VbankNotice({ order }: { order: Order }) {
  const [copy, setCopy] = useState<"idle" | "done" | "blocked">("idle");
  // 서버는 지금 시각을 모른 채 그린다. 브라우저에서만 마감이 지났는지 본다.
  const expired = useSyncExternalStore(
    noop,
    () => Boolean(order.vbank_due) && Date.now() > Date.parse(order.vbank_due ?? ""),
    () => false,
  );

  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(order.vbank_account ?? "");
      setCopy("done");
    } catch {
      // 카카오톡 안에서 연 화면 등은 복사가 막힌다. 예전엔 아무 말 없이 「복사」 로 남았다.
      setCopy("blocked");
    }
  }

  return (
    <div className="mt-4 rounded-[12px] bg-cream p-4">
      {/* 제일 중요한 건 언제까지인가. 예전엔 맨 아래 13px 문장 속에 시각만 있었다. */}
      <p className="text-[17px] leading-snug text-clay-deep">
        {expired
          ? "입금 기한이 지났어요"
          : `${formatClock(order.vbank_due)}까지 입금해 주세요`}
      </p>
      <p className="pt-1 text-[14px] leading-relaxed text-ink-soft">
        {expired
          ? "계좌가 닫혀 곧 주문이 자동으로 취소돼요. 이 계좌로는 입금하지 마세요."
          : "1회용 계좌라 기한이 지나면 닫혀요. 입금하면 주문이 바로 확정돼요."}
      </p>

      <dl className="mt-3 space-y-2 text-[14px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-soft">은행</dt>
          <dd>{bankLabel(order.vbank_bank)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-soft">계좌번호</dt>
          <dd className="flex items-center gap-2">
            <span className="select-all text-[17px] tabular-nums tracking-tight">{order.vbank_account}</span>
            <button
              type="button"
              onClick={copyAccount}
              className="tap-target rounded-pill border border-line bg-white px-3.5 text-[14px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
            >
              {copy === "done" ? "복사됨" : "복사"}
            </button>
          </dd>
        </div>
        {order.vbank_holder && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-soft">예금주</dt>
            <dd>{order.vbank_holder}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-soft">입금할 금액</dt>
          <dd className="text-[16px] tabular-nums tracking-tight">{formatPrice(order.total)}</dd>
        </div>
      </dl>

      {copy === "blocked" && (
        <p role="alert" className="pt-3 text-[14px] leading-relaxed text-danger">
          이 화면에서는 복사가 안 돼요. 계좌번호를 길게 눌러 복사하시거나 적어 주세요.
        </p>
      )}
      <p className="pt-3 text-[14px] leading-relaxed">
        금액이 1원이라도 다르면 입금되지 않아요. 위 금액 그대로 보내 주세요.
      </p>
      {/* 화면이 바뀐 걸 알 수 있게 — 입금되면 이 상자가 사라지고 "결제 완료" 로 바뀐다. */}
      <span role="status" className="sr-only">
        {copy === "done" ? "계좌번호를 복사했어요" : ""}
      </span>
    </div>
  );
}
