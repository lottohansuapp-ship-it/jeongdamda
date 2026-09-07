"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmMyPayment } from "@/lib/payment-actions";

/**
 * 휴대폰 결제에서 돌아왔을 때 결제를 확정한다.
 *
 * 휴대폰은 결제 앱으로 넘어갔다가 redirectUrl 로 **페이지가 통째로 다시 뜬다.**
 * 그래서 주문서에서 결제창을 띄운 코드는 이어지지 못하고, 그 뒤에 있던
 * 확인 호출도 돌지 못한다. 지금까지는 웹훅 하나만 남아 있었다.
 *
 * 웹훅이 늦거나 실패하면 손님은 돈을 냈는데 "결제 대기" 만 보게 되고,
 * 매장 주문 목록에도 안 뜬다. 실제로 그 일이 났다. 확정 경로가 하나뿐이면
 * 그 하나가 끊기는 순간 아무도 모른다.
 *
 * 확정은 서버가 포트원에 다시 물어서 한다 (confirmMyPayment).
 * 주소창의 값은 어느 결제를 확인할지 가리키는 데만 쓰고, 금액도 상태도
 * 여기서 오는 값은 믿지 않는다.
 */
export function PaymentReturn({
  orderId,
  status,
  paymentId,
}: {
  orderId: string;
  status: string;
  paymentId: string | null;
}) {
  const router = useRouter();
  const done = useRef(false);
  const [failed, setFailed] = useState(false);

  /*
    주소창의 paymentId 만 보고 판단하면 안 된다. 그 값은 결제 앱에서 막
    돌아온 그 한 번만 붙는다. 손님이 주문내역을 거쳐 들어오거나 새로고침하면
    사라지고, 그러면 확정할 기회가 영영 없다 — 실제로 그렇게 막혔다.

    주문 자체가 "결제 대기" 이고 결제 건 번호를 들고 있으면 물어본다.
    결제창을 닫아 버린 주문도 여기로 오지만, 포트원이 "아직 결제 안 됨" 을
    돌려주고 아무 일도 일어나지 않는다.
  */
  useEffect(() => {
    if (done.current) return;
    if (status !== "pending_payment" || !paymentId) return;
    done.current = true;

    void confirmMyPayment(paymentId).then((result) => {
      if (result.ok) {
        // 주소창에 남은 결제 파라미터도 함께 지운다.
        router.replace(`/orders/${orderId}`);
        router.refresh();
      } else {
        // 웹훅이 늦게라도 처리한다. 손님에게 "실패" 라고 말하지 않는다 —
        // 돈은 이미 나갔고, 실제로는 몇 초 뒤 확정되는 경우가 대부분이다.
        setFailed(true);
      }
    });
  }, [status, paymentId, orderId, router]);

  if (!failed) return null;

  return (
    <p
      role="status"
      className="mb-2.5 rounded-card bg-cream px-4 py-3 text-[13px] leading-relaxed"
    >
      결제를 확인하는 중이에요. 잠시 뒤 자동으로 바뀝니다.
      <br />
      오래 걸리면 02-6953-8086 으로 전화 주세요.
    </p>
  );
}
