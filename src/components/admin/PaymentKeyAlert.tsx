import { portOneKeyHealth } from "@/lib/payments/portone";

/**
 * 포트원 API 시크릿이 거절되고 있으면 관리자 화면 맨 위에 빨갛게 띄운다.
 *
 * 매장 PC 는 주문 화면을 하루 종일 켜 둔다. 그래서 여기 띄우면 손님이 겪기
 * 전에 사장님이 먼저 안다. 키가 만료되면 카드 승인은 나는데 주문 확정과
 * 환불이 전부 막힌다 — 실제로 30일짜리 시크릿이 그렇게 만료됐었다.
 *
 * 확실히 거절된 경우(401/403)에만 띄운다. 포트원이 잠깐 느린 것까지 띄우면
 * 알림이 늘 떠 있게 되고, 그러면 진짜 문제가 생겨도 아무도 안 본다.
 */
export async function PaymentKeyAlert() {
  if ((await portOneKeyHealth()) !== "rejected") return null;

  return (
    <div
      role="alert"
      className="mt-4 rounded-card border border-danger/40 bg-danger/5 p-4"
    >
      <p className="text-[14px] text-danger">결제 키가 만료됐거나 맞지 않아요</p>
      <p className="pt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
        지금은 손님 카드가 승인돼도 주문이 「결제완료」로 바뀌지 않고, 취소·환불도
        되지 않아요. 포트원 → 연동 정보 → 식별코드·API Keys 에서 V2 API Secret 을
        <strong className="font-normal text-ink"> 무기한</strong>으로 다시 발급해
        Vercel 의 PORTONE_API_SECRET 에 넣고 재배포해 주세요.
      </p>
    </div>
  );
}
