import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { OrderBoard } from "@/components/admin/OrderBoard";
import { getAdminOrders } from "@/lib/queries";

export const metadata: Metadata = {
  title: "주문 관리",
  robots: { index: false, follow: false },
};

export default function AdminOrdersPage() {
  return (
    <main className="mx-auto w-full max-w-[560px] flex-1 px-5">
      <Suspense fallback={<Skeleton />}>
        <OrdersBody />
      </Suspense>
    </main>
  );
}

async function OrdersBody() {
  // 주문은 매 순간 바뀐다. 프리렌더된 목록을 보여주면 사장님이 새 주문을 놓친다.
  await connection();
  return <OrderBoard orders={await getAdminOrders()} />;
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
