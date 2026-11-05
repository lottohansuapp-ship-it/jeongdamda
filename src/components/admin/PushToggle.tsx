"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/lib/push-actions";

/**
 * 「휴대폰 알림 켜기」 (0032). 관리자 앱을 닫아도 새 주문이 오면 휴대폰에 알림이 뜬다.
 *
 * 기기마다 따로 켠다 — 매장 태블릿과 사장님 휴대폰 둘 다 받으려면 둘에서 각각 누른다.
 * 아이폰·아이패드는 사파리에서 「홈 화면에 추가」 한 앱으로 열어야만 켤 수 있다(애플 규칙).
 */
const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State = "checking" | "unsupported" | "ios-browser" | "no-key" | "denied" | "off" | "on";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // 처음 열 때 이 기기 상태를 본다. 브라우저 기능이라 그린 뒤에만 알 수 있다.
  useEffect(() => {
    let alive = true;
    (async () => {
      let next: State;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        next = isIos() && !isStandalone() ? "ios-browser" : "unsupported";
      } else if (!PUBLIC_KEY) {
        next = "no-key";
      } else if (Notification.permission === "denied") {
        next = "denied";
      } else {
        const subscription = await currentSubscription().catch(() => null);
        if (subscription) {
          // 서버 쪽 기록이 지워졌을 수도 있다 — 켜져 있으면 조용히 다시 알려 둔다
          await savePushSubscription(subscription.toJSON() as never, navigator.userAgent).catch(() => null);
        }
        next = subscription ? "on" : "off";
      }
      if (alive) setState(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  function turnOn() {
    setMessage(null);
    startTransition(async () => {
      try {
        // 아이폰은 버튼을 누른 그 순간에 물어봐야 허락 창이 뜬다 — 다른 일보다 먼저 묻는다.
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          setMessage({ tone: "error", text: "알림 허용을 눌러야 켜져요." });
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(PUBLIC_KEY),
          }));
        const saved = await savePushSubscription(subscription.toJSON() as never, navigator.userAgent);
        if (!saved.ok) {
          setMessage({ tone: "error", text: saved.error });
          return;
        }
        setState("on");
        setMessage({ tone: "ok", text: "켜졌어요. 「시험 알림 보내기」로 한 번 확인해 보세요." });
      } catch {
        setMessage({ tone: "error", text: "알림을 켜지 못했어요. 앱을 다시 열고 한 번 더 눌러 주세요." });
      }
    });
  }

  function turnOff() {
    setMessage(null);
    startTransition(async () => {
      const subscription = await currentSubscription().catch(() => null);
      if (subscription) {
        await removePushSubscription(subscription.endpoint).catch(() => null);
        await subscription.unsubscribe().catch(() => false);
      }
      setState("off");
      setMessage({ tone: "ok", text: "이 기기는 알림을 껐어요." });
    });
  }

  function test() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendTestPush().catch(() => ({ ok: false as const, error: "연결이 끊겼어요." }));
      setMessage(
        result.ok
          ? { tone: "ok", text: `시험 알림을 보냈어요 (${result.data.sent}대). 몇 초 안에 휴대폰 위에 떠요.` }
          : { tone: "error", text: result.error },
      );
    });
  }

  if (state === "checking") return null;

  const notice: Record<Exclude<State, "checking" | "off" | "on">, string> = {
    "ios-browser":
      "아이폰·아이패드는 사파리 공유 버튼 → 「홈 화면에 추가」 한 앱으로 열어야 알림을 켤 수 있어요.",
    unsupported: "이 브라우저는 휴대폰 알림을 지원하지 않아요. 크롬이나 홈 화면에 추가한 앱으로 열어 주세요.",
    "no-key": "휴대폰 알림 설정이 아직 서버에 없어요. 담당자에게 알림 키(VAPID) 설정을 부탁해 주세요.",
    denied: "이 기기에서 알림이 막혀 있어요. 휴대폰 설정 → 앱(또는 브라우저) → 알림에서 허용해 주세요.",
  };

  return (
    <section className="mb-3 rounded-card bg-white p-4 shadow-soft" aria-labelledby="push-heading">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="push-heading" className="text-[15px]">
            휴대폰 알림 {state === "on" && <span className="text-olive-deep">· 켜짐</span>}
          </h2>
          <p className="pt-0.5 text-[13.5px] leading-relaxed text-ink-soft">
            {state === "on"
              ? "앱을 닫아도 새 주문이 오면 이 기기에 알림이 떠요."
              : state === "off"
                ? "켜 두면 앱을 닫아도 새 주문이 오면 알림이 떠요."
                : notice[state]}
          </p>
        </div>
        {state === "off" && (
          <button
            type="button"
            onClick={turnOn}
            disabled={pending}
            className="h-12 shrink-0 rounded-card bg-olive px-4 text-[14px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-50"
          >
            {pending ? "켜는 중…" : "알림 켜기"}
          </button>
        )}
      </div>

      {state === "on" && (
        <div className="flex gap-2 pt-3">
          <button
            type="button"
            onClick={test}
            disabled={pending}
            className="h-12 flex-1 rounded-card border border-olive bg-white text-[14px] text-olive-deep transition-colors duration-200 hover:bg-olive-soft disabled:opacity-50"
          >
            시험 알림 보내기
          </button>
          <button
            type="button"
            onClick={turnOff}
            disabled={pending}
            className="h-12 shrink-0 rounded-card px-4 text-[14px] text-ink-soft transition-colors duration-200 hover:text-danger disabled:opacity-50"
          >
            끄기
          </button>
        </div>
      )}

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`pt-2 text-[13.5px] leading-relaxed ${message.tone === "ok" ? "text-olive-deep" : "text-danger"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
