import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatPrice } from "@/lib/format";
import { getSales } from "@/lib/queries";
import { seoulDate } from "@/lib/store";

export const metadata: Metadata = {
  title: "매출",
  robots: { index: false, follow: false },
};

const RANGES = [
  { key: "today", label: "오늘", days: 0 },
  { key: "week", label: "최근 7일", days: 6 },
  { key: "month", label: "최근 30일", days: 29 },
] as const;

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

export default function SalesPage({ searchParams }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5 pb-16">
      <AdminNav current="/admin/sales" title="매출" />

      <Suspense fallback={<Skeleton />}>
        <SalesBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function SalesBody({ searchParams }: PageProps) {
  // 오늘 날짜가 걸린 화면이다. 프리렌더된 어제 값을 보여주면 안 된다.
  await connection();

  const { range } = await searchParams;
  const picked = RANGES.find((r) => r.key === range) ?? RANGES[0];

  const now = new Date();
  const to = seoulDate(now);
  const from = seoulDate(new Date(now.getTime() - picked.days * 86400000));

  const data = await getSales(from, to);

  return (
    <>
      <nav className="flex gap-1.5 pb-5">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/admin/sales?range=${r.key}`}
            aria-current={r.key === picked.key ? "page" : undefined}
            className={`rounded-[10px] px-3.5 py-2 text-[14px] leading-none transition-colors duration-200 ${
              r.key === picked.key
                ? "bg-ink text-white"
                : "bg-white text-ink-soft"
            }`}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      {!data ? (
        <p className="rounded-card bg-white px-6 py-16 text-center text-[14px] leading-relaxed text-ink-soft shadow-soft">
          매출을 불러오지 못했어요.
          <br />
          0014_sales.sql 이 적용됐는지 확인해 주세요.
        </p>
      ) : (
        <>
          <section className="rounded-card bg-white p-5 shadow-soft">
            <p className="text-[13px] text-ink-faint">
              {picked.label} 매출
              {from !== to && (
                <span className="pl-1.5">
                  ({from} ~ {to})
                </span>
              )}
            </p>
            <p className="pt-1.5 text-[32px] leading-none tracking-tight">
              {formatPrice(data.summary.revenue)}
            </p>
            <p className="pt-3 text-[13.5px] text-ink-soft">
              주문 {data.summary.orders}건 · 배달 {data.summary.delivery} · 픽업{" "}
              {data.summary.pickup}
            </p>
            {(data.summary.canceled > 0 || data.summary.refunded > 0) && (
              <p className="pt-1 text-[13px] text-ink-faint">
                취소 {data.summary.canceled}건 · 환불{" "}
                {formatPrice(data.summary.refunded)}
              </p>
            )}
          </section>

          <section className="mt-2.5 rounded-card bg-white p-5 shadow-soft">
            <h2 className="pb-3.5 text-[13px] text-ink-faint">많이 나간 반찬</h2>
            {data.items.length === 0 ? (
              <p className="py-6 text-center text-[13.5px] text-ink-soft">
                아직 판매된 반찬이 없어요
              </p>
            ) : (
              <ol className="space-y-2.5">
                {data.items.map((item, index) => (
                  <li
                    key={item.name}
                    className="flex items-baseline justify-between gap-3 text-[14px]"
                  >
                    <span className="min-w-0 truncate">
                      <span className="pr-2 tabular-nums text-ink-faint">
                        {index + 1}
                      </span>
                      {item.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-soft">
                      {item.quantity}개 · {formatPrice(item.revenue)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="pt-4 text-[12px] leading-relaxed text-ink-faint">
            결제가 끝난 주문만 셉니다. 결제 전이거나 취소된 주문은 매출에서
            빠집니다.
          </p>
        </>
      )}
    </>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      <div className="h-[150px] rounded-card bg-white shadow-soft" />
      <div className="h-[220px] rounded-card bg-white shadow-soft" />
    </div>
  );
}
