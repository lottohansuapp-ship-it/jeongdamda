/*
  사장님 휴대폰 푸시 알림 (0032).

  하는 일은 둘뿐이다 — 알림을 받아 띄우고, 누르면 관리자 주문 화면을 연다.
  화면을 저장해 두는(캐시) 기능은 일부러 넣지 않았다. 넣으면 앱을 고쳐도 예전 화면이
  남는 일이 생긴다(2026-10 손님 PC 에서 겪었다). fetch 는 손대지 않는다.
*/

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "정담따 새 주문", {
      body: data.body || "",
      // 같은 주문 알림은 하나로 겹치되, 겹칠 때도 소리·진동이 다시 나게 한다
      tag: data.tag || "order",
      renotify: true,
      // 사장님이 확인할 때까지 남겨 둔다 (지원하는 기기에서)
      requireInteraction: true,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: [200, 100, 200],
      data: { url: data.url || "/admin/orders" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/admin/orders", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // 이미 열린 앱 창이 있으면 그 창을 앞으로 가져와 주문 화면으로 보낸다
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
