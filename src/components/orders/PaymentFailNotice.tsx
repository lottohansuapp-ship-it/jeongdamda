"use client";

import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

export const PAY_ERROR_KEY = (orderId: string) => `jeongdamda-pay-error:${orderId}`;

const noop = () => () => {};

/**
 * 결제창이 열리지 않았거나 실패했을 때, 그 이유를 주문 화면에 보여준다.
 *
 * 주문서는 결제가 실패하면 곧바로 이 화면으로 넘어온다. 예전엔 실패 문구를
 * 주문서에 띄운 채 넘어와서 문구가 그대로 사라졌다 — 손님은 "아무 화면도 안
 * 나왔다" 고만 느꼈고, 우리는 포트원이 왜 거절했는지 알 길이 없었다.
 *
 * 주소창이 아니라 sessionStorage 로 넘긴다. 주소에 문구를 실으면 남이 가짜
 * 안내문을 담은 링크를 만들어 보낼 수 있다.
 */
export function PaymentFailNotice({ orderId, status }: { orderId: string; status: string }) {
  const key = PAY_ERROR_KEY(orderId);
  const [dismissed, setDismissed] = useState(false);

  /*
    휴대폰 결제는 결제 앱에서 이 주소로 페이지가 통째로 다시 뜬다. 실패·취소면 포트원이
    주소에 code 를 붙인다. 예전엔 그걸 안 읽어서 결제창을 닫은 손님도 「확인 중」 만 봤다.
    문구는 주소에서 가져오지 않는다(아래 설명과 같은 이유) — 있다는 사실만 쓴다.
  */
  const returnedWithError = useSearchParams().has("code");

  const stored = useSyncExternalStore(
    noop,
    () => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );

  const message =
    stored ?? (returnedWithError ? "결제창을 닫으셨거나 결제가 승인되지 않았어요." : null);

  // 결제가 결국 확정됐으면(웹훅이 늦게 처리한 경우) 실패 안내는 틀린 말이다
  if (!message || dismissed || status !== "pending_payment") return null;

  function dismiss() {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // 지우지 못해도 이번 화면에서는 닫힌다
    }
    setDismissed(true);
  }

  return (
    <div role="alert" className="mb-2.5 rounded-card border border-danger/30 bg-danger/5 p-4">
      <p className="text-[15px] text-danger">결제가 진행되지 않았어요</p>
      <p className="pt-1.5 text-[14px] leading-relaxed text-ink-soft">
        {message}
        <br />
        돈은 빠져나가지 않았어요. 아래 「다시 결제하기」로 이어서 결제하실 수 있어요.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="mt-2.5 h-12 rounded-pill border border-danger/30 px-4 text-[14px] text-danger transition-colors duration-200 hover:bg-danger/10"
      >
        확인했어요
      </button>
    </div>
  );
}
