import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { OrderBoard } from "@/components/admin/OrderBoard";
import { getAdminOrders } from "@/lib/queries";

export const metadata: Metadata = {
  title: "주문 관리",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ range?: string }>;
}

/**
 * 기간을 서버에서 자른다. 예전에는 "최근 100건"을 통째로 가져와 화면에서 걸렀는데,
 * 주문이 쌓이면 매번 그만큼을 나르게 된다. 사장님은 대개 오늘 것만 본다.
 */
const RANGES = [
  { key: "today", days: 1 },
  { key: "week", days: 7 },
  { key: "month", days: 30 },
] as const;

export default function AdminOrdersPage({ searchParams }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5">
      <Suspense fallback={<Skeleton />}>
        <OrdersBody searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function OrdersBody({ searchParams }: PageProps) {
  // 주문은 매 순간 바뀐다. 프리렌더된 목록을 보여주면 사장님이 새 주문을 놓친다.
  await connection();

  const { range } = await searchParams;
  const picked = RANGES.find((r) => r.key === range) ?? RANGES[0];
  const { orders, truncated } = await getAdminOrders(picked.days);

  return <OrderBoard orders={orders} truncated={truncated} range={picked.key} />;
}

function Skeleton() {
  return (
    <div className="space-y-2.5 pt-24" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="h-[260px] rounded-card bg-white shadow-soft" />
      ))}
    </div>
  );
}
