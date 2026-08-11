import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { connection } from "next/server";
import { Suspense } from "react";
import { StoreForm } from "@/components/admin/StoreForm";
import { getStore } from "@/lib/queries";
import { storeOpenState, toSeoulClock } from "@/lib/store";

export const metadata: Metadata = {
  title: "매장 설정",
  robots: { index: false, follow: false },
};

export default function AdminStorePage() {
  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5">
      <AdminNav current="/admin/store" title="매장 설정" />

      <p className="pb-5 text-[13px] leading-relaxed text-ink-soft">
        영업시간과 배달 조건은 손님 주문서에 그대로 적용됩니다.
      </p>

      <Suspense fallback={<Skeleton />}>
        <StoreBody />
      </Suspense>
    </main>
  );
}

async function StoreBody() {
  // 영업 여부는 서버 시계로 판단한다. 기기 시계는 틀릴 수 있고,
  // 실제로 주문을 받을지 정하는 것도 서버다.
  await connection();
  const { settings, areas } = await getStore();

  if (!settings) {
    return (
      <div className="rounded-card bg-white px-6 py-16 text-center shadow-soft">
        <p className="text-[15px]">매장 설정을 불러오지 못했어요.</p>
        <p className="pt-3 text-[12.5px] leading-relaxed text-ink-faint">
          0006_store.sql 마이그레이션이 적용됐는지 확인해 주세요.
        </p>
      </div>
    );
  }

  const openState = storeOpenState(settings, toSeoulClock(new Date()));

  return (
    <StoreForm settings={settings} areas={areas} openState={openState} />
  );
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="h-[420px] rounded-card bg-white shadow-soft" />
      <div className="h-[120px] rounded-card bg-white shadow-soft" />
    </div>
  );
}
