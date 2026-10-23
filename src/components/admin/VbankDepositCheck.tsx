"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmMyPayment } from "@/lib/payment-actions";

/**
 * 입금 대기 가상계좌 주문의 「입금 확인」.
 *
 * 입금이 확정되는 길은 KCP → 포트원 → 우리 웹훅 하나뿐이다. 그 사이 하나라도 끊기면
 * (KCP 상점관리자에 입금 통보 주소가 없거나, 포트원 웹훅이 테스트 모드에만 걸려 있거나)
 * 손님은 돈을 보냈는데 주문은 「입금 대기」 로 남는다. 2026-10 실제로 그랬다.
 *
 * 이 버튼은 포트원에 직접 다시 묻는다. 포트원이 입금을 알면 그 자리에서 주문이 확정되고,
 * 모르면 "KCP 쪽 통보가 안 왔다" 는 걸 사장님이 바로 안다. 금액·상태는 서버가 포트원에서
 * 다시 읽은 값만 쓴다(confirmPayment) — 이 버튼이 결제를 만들 수는 없다.
 */
export function VbankDepositCheck({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "wait" | "error"; text: string } | null>(
    null,
  );

  function check() {
    setMessage(null);
    startTransition(async () => {
      const result = await confirmMyPayment(paymentId).catch(() => ({
        ok: false as const,
        error: "연결이 끊겼어요. 다시 눌러 주세요.",
      }));
      if (!result.ok) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      if (result.data.status === "PAID") {
        setMessage({ tone: "ok", text: "입금이 확인돼 주문을 확정했어요." });
        router.refresh();
        return;
      }
      if (result.data.status === "canceled") {
        setMessage({
          tone: "error",
          text: "이미 취소된 주문에 입금이 들어왔어요. 손님 계좌로 직접 돌려주세요.",
        });
        router.refresh();
        return;
      }
      setMessage({
        tone: "wait",
        text: "포트원에 아직 입금 기록이 없어요. 손님이 입금하셨다면 KCP 입금 통보 설정을 확인해 주세요.",
      });
    });
  }

  return (
    <div className="pt-2.5">
      <button
        type="button"
        onClick={check}
        disabled={pending}
        className="tap-target w-full rounded-card border border-olive bg-white text-[14px] text-olive-deep transition-colors duration-200 hover:bg-olive-soft disabled:opacity-50"
      >
        {pending ? "포트원에 확인하는 중…" : "입금됐는지 확인하기"}
      </button>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`pt-2 text-[13.5px] leading-relaxed ${
            message.tone === "ok"
              ? "text-olive-deep"
              : message.tone === "wait"
                ? "text-clay-deep"
                : "text-danger"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
