"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "./supabase/client";

/**
 * 주문이 바뀌면 화면을 다시 받아온다.
 *
 * 두 가지를 함께 쓴다.
 *   · Realtime 구독 — 사장님이 "접수"를 누르는 순간 손님 화면이 바뀐다.
 *   · 폴링 — 구독이 끊기거나 붙지 못했을 때의 안전망.
 *
 * 왜 둘 다인가: 웹소켓은 지하철·엘리베이터에서 조용히 끊긴다. 끊긴 걸 모르면
 * 화면이 영영 멈춘 채로 남고, 그게 폴링만 있을 때보다 나쁘다.
 * 대신 구독이 붙어 있는 동안에는 폴링을 60초로 늦춰 서버를 아낀다.
 *
 * 공통으로 지키는 것:
 *   · 끝난 주문에서는 아예 돌지 않는다
 *   · 탭이 뒤에 있으면 건너뛴다. 아무도 안 보는 화면 때문에 서버를 부르지 않는다
 *   · 탭으로 돌아온 순간 즉시 한 번 받아온다
 */
const FAST_MS = 15000; // 구독이 없을 때
const SLOW_MS = 60000; // 구독이 붙어 있을 때의 안전망

interface Options {
  enabled: boolean;
  /**
   * Realtime 필터. 손님은 자기 주문 하나만 본다 (`id=eq.<uuid>`).
   * 관리자는 비워 두면 전부 받는다 — RLS 가 누가 무엇을 받을지 가른다.
   */
  filter?: string;
  /**
   * 탭이 뒤에 있어도 받아온다. 매장 PC 전용이다 —
   * 사장님이 다른 탭을 보고 계셔도 주문 소리는 나야 한다.
   *
   * 이때 실제로 일하는 건 구독 쪽이다. 뒤에 있는 탭은 setInterval 이
   * 1분에 한 번꼴로 늦춰져서 폴링은 거의 소용이 없다.
   *
   * 손님 화면에는 켜지 않는다. 안 보는 화면 때문에 서버를 부를 이유가 없고
   * 휴대폰에서는 배터리로 돌아온다.
   */
  evenWhenHidden?: boolean;
}

export function useLiveRefresh({
  enabled,
  filter,
  evenWhenHidden = false,
}: Options): void {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(false);

  // 구독. 붙으면 폴링을 늦춘다.
  useEffect(() => {
    if (!enabled) return;

    const supabase = browserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`orders:${filter ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter },
        () => {
          // 페이로드는 쓰지 않는다. 무엇이 바뀌었는지는 서버에 다시 묻는다 —
          // 그래야 RLS·조인·표시 규칙이 한 곳에만 있다.
          if (evenWhenHidden || document.visibilityState === "visible") {
            router.refresh();
          }
        },
      )
      .subscribe((status: string) => setSubscribed(status === "SUBSCRIBED"));

    return () => {
      setSubscribed(false);
      supabase.removeChannel(channel);
    };
  }, [enabled, filter, evenWhenHidden, router]);

  // 안전망.
  useEffect(() => {
    if (!enabled) return;

    const refreshIfVisible = () => {
      if (evenWhenHidden || document.visibilityState === "visible") {
        router.refresh();
      }
    };

    // 탭을 다시 켠 순간이 가장 값진 갱신 시점이다
    document.addEventListener("visibilitychange", refreshIfVisible);
    const timer = setInterval(refreshIfVisible, subscribed ? SLOW_MS : FAST_MS);

    return () => {
      document.removeEventListener("visibilitychange", refreshIfVisible);
      clearInterval(timer);
    };
  }, [enabled, subscribed, evenWhenHidden, router]);
}
