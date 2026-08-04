"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 진행 중인 주문이 있는 동안만 화면을 조용히 다시 받아온다.
 *
 * 사장님이 "접수"를 눌러도 손님 화면은 가만히 있었다. 손님이 직접 새로고침해야
 * 바뀌었는데, 주문 상태를 지켜보는 손님에게 그건 앱이 멈춘 것으로 보인다.
 *
 * Realtime 구독이 더 즉각적이지만 v2-F 에서 사장님 쪽(신규 주문 알림)과 함께
 * 붙이기로 했다. 지금 따로 만들면 곧 다시 걷어내게 된다.
 *
 * 성능에 대해:
 *   · 끝난 주문(완료·취소)에서는 아예 돌지 않는다
 *   · 탭이 뒤에 있으면 건너뛴다. 아무도 안 보는 화면 때문에 서버를 부르지 않는다
 *   · 탭으로 돌아온 순간 즉시 한 번 받아온다. 손님이 실제로 보는 그 시점이다
 *
 * 이 매장 규모(동시에 살아 있는 주문 5~8건)에서 초당 0.5회 미만이다.
 */
const INTERVAL_MS = 15000;

export function useLiveRefresh(enabled: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };

    // 탭을 다시 켠 순간이 가장 값진 갱신 시점이다
    document.addEventListener("visibilitychange", refreshIfVisible);
    const timer = setInterval(refreshIfVisible, INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      clearInterval(timer);
    };
  }, [enabled, router]);
}
