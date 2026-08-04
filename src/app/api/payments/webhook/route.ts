import { NextResponse } from "next/server";
import { confirmPayment } from "@/lib/payments/confirm";
import { isPortOneReady, verifyWebhookSignature } from "@/lib/payments/portone";

/**
 * 포트원 웹훅.
 *
 * 손님이 결제창을 닫아 버려도, 브라우저가 죽어도, 이 경로로 결제 사실이 들어온다.
 * 화면 쪽 확인(payment-actions)은 빠를 뿐이고, 믿을 수 있는 것은 이쪽이다.
 *
 * 지켜야 할 것 둘:
 *   · 본문에 적힌 금액을 쓰지 않는다. paymentId 만 꺼내고 나머지는 포트원에 다시 묻는다.
 *   · 포트원은 재시도한다. 같은 웹훅이 열 번 와도 결과가 같아야 한다
 *     (멱등 처리는 mark_order_paid 안에 있다).
 *
 * 상태 코드도 의미가 있다. 5xx 면 포트원이 재시도하고 2xx 면 하지 않는다.
 * 우리 쪽 일시적 장애는 5xx 로 답해서 다시 받아야 한다.
 */
export async function POST(request: Request) {
  // 아직 결제를 켜지 않았다. 던지지 않고 조용히 알린다 —
  // 500 으로 남으면 로그에서 진짜 장애와 구분되지 않는다.
  if (!isPortOneReady()) {
    return NextResponse.json(
      { message: "결제가 아직 연결되지 않았습니다." },
      { status: 503 },
    );
  }

  const body = await request.text();

  const valid = verifyWebhookSignature(body, {
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
  });

  if (!valid) {
    // 재시도해도 서명은 그대로다. 400 으로 끊는다.
    return NextResponse.json(
      { message: "서명이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  let paymentId: string | null = null;
  try {
    const parsed = JSON.parse(body) as { data?: { paymentId?: string } };
    paymentId = parsed.data?.paymentId ?? null;
  } catch {
    return NextResponse.json(
      { message: "본문을 읽지 못했습니다." },
      { status: 400 },
    );
  }

  if (!paymentId) {
    // 결제와 무관한 이벤트일 수 있다. 재시도를 부르지 않도록 200 으로 닫는다.
    return NextResponse.json({ message: "처리할 결제가 없습니다." });
  }

  const result = await confirmPayment(paymentId);

  if (!result.ok) {
    // 포트원 조회 실패나 DB 오류다. 다시 받아야 하므로 5xx.
    console.error("[payment-webhook]", paymentId, result.error);
    return NextResponse.json({ message: result.error }, { status: 500 });
  }

  return NextResponse.json({ applied: result.applied, status: result.status });
}
