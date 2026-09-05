import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { connection } from "next/server";
import { Suspense } from "react";
import { StoreForm } from "@/components/admin/StoreForm";
import { getStore } from "@/lib/queries";
import { missingPaymentConfig } from "@/lib/payments/portone";
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
    <>
      <PaymentStatus />
      <StoreForm settings={settings} areas={areas} openState={openState} />
    </>
  );
}

/**
 * 결제 연결 상태.
 *
 * 결제가 안 켜지는 이유가 "주문하기 버튼이 그대로다" 하나뿐이면 다섯 군데를
 * 다 뒤져야 한다. 무엇이 빠졌는지 여기서 보인다.
 *
 * **이름만 보여준다.** 값은 어디에도 렌더링하지 않는다 — 관리자 화면이라도
 * 화면은 캡처되고 어깨너머로 보인다.
 */
function PaymentStatus() {
  const missing = missingPaymentConfig();

  if (missing.length === 0) {
    return (
      <div className="mb-2.5 rounded-card bg-white p-4 shadow-soft">
        <p className="text-[13.5px] text-success-deep">
          결제 연결됨 — 주문서에 결제창이 뜹니다
        </p>
      </div>
    );
  }

  return (
    <div className="mb-2.5 rounded-card bg-cream p-4 shadow-soft">
      <p className="text-[13.5px]">결제 연결 전 — 주문만 접수됩니다</p>
      <p className="pt-2 text-[12.5px] leading-relaxed text-ink-soft">
        Vercel 환경변수 {missing.length}개가 비어 있어요. 채우고 다시
        배포하면 켜집니다.
      </p>
      <ul className="pt-2 space-y-1">
        {missing.map((name) => (
          <li key={name} className="text-[12px] text-clay-deep">
            {name}
          </li>
        ))}
      </ul>
    </div>
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
