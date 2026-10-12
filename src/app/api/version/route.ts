import { NextResponse } from "next/server";
import { PORTONE_CHANNELS } from "@/lib/payments/config";
import { missingPaymentConfig } from "@/lib/payments/portone";

/**
 * 지금 배포된 코드가 어느 커밋인지, 결제가 어느 채널로 붙어 있는지.
 *
 * 배포가 실제로 반영됐는지 확인할 방법이 없어 여러 번 헤맸다. 고친 곳이
 * 대부분 로그인 뒤 화면이라 밖에서는 보이지 않고, Vercel 의 Redeploy 버튼은
 * **그 시점 커밋을 다시 빌드**해서 최신 코드가 안 올라간다. 그래서
 * "고쳤는데 그대로다" 가 코드 문제인지 배포 문제인지 가릴 수가 없었다.
 *
 * 결제 쪽은 테스트 → 실연동으로 갈아끼울 때 "제대로 들어갔나" 를 보려고 넣었다.
 *   · 채널 키는 원래 주문서에서 손님 브라우저로 나가는 공개 값이다. 끝자리만 보여
 *     포트원 콘솔의 실연동 채널 키와 맞춰 보게 한다.
 *   · 휴대폰·카카오페이는 켜졌는지만. 예전 테스트 키가 남으면 그 수단만
 *     테스트로 결제돼 밤에 자동 취소된다 — 그걸 잡으려는 것이다.
 *   · 서버 비밀값은 **빠진 이름**만. 값이나 길이, 일부도 내보내지 않는다.
 */
export async function GET() {
  const tail = (key: string) => (key ? `…${key.slice(-6)}` : null);

  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? null,
    payment: {
      card: tail(PORTONE_CHANNELS.card),
      mobile: tail(PORTONE_CHANNELS.mobile),
      kakaopay: tail(PORTONE_CHANNELS.kakaopay),
      missing: missingPaymentConfig(),
    },
  });
}
