import { connection } from "next/server";
import { getStore } from "@/lib/queries";
import { closedNotice, toSeoulClock } from "@/lib/store";

/**
 * 매장이 닫혀 있으면 홈 맨 위에 알린다. 열려 있으면 아무것도 그리지 않는다.
 *
 * 지금 시각을 읽어야 해서 요청 때만 그릴 수 있다 — 반드시 <Suspense> 안에서 쓴다
 * (홈의 나머지는 미리 그려 둔 그대로). 매장 설정은 캐시된 조회라 왕복이 늘지 않는다.
 */
export async function StoreClosedBanner() {
  await connection();
  const { settings } = await getStore().catch(() => ({ settings: null }));
  if (!settings) return null;

  const notice = closedNotice(settings, toSeoulClock(new Date()));
  if (!notice) return null;

  return (
    <section
      role="status"
      className="mb-5 rounded-card border border-clay/30 bg-cream px-4 py-3.5"
    >
      <p className="text-[16px] text-clay-deep">{notice.title}</p>
      <p className="pt-0.5 text-[14px] leading-relaxed text-ink-soft">{notice.detail}</p>
    </section>
  );
}
