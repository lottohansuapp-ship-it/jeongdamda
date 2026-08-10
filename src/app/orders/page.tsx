import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { OrderList } from "@/components/orders/OrderList";
import { BottomNav } from "@/components/ui/BottomNav";
import { getOrders, getProfile } from "@/lib/queries";

export const metadata: Metadata = {
  title: "주문내역",
  robots: { index: false, follow: false },
};

export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  return (
    <>
      <main className="mx-auto w-full max-w-[560px] flex-1 px-5">
        <header className="pb-5 pt-10">
          <h1 className="text-[26px] leading-tight">주문내역</h1>
        </header>

        {/* searchParams 를 읽으므로 Suspense 안에 있어야 한다 (PPR 요구사항) */}
        <Suspense fallback={<Skeleton />}>
          <OrdersBody searchParams={searchParams} />
        </Suspense>
      </main>
      <BottomNav active="orders" />
    </>
  );
}

async function OrdersBody({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=%2Forders");

  const { before } = await searchParams;
  const { orders, nextCursor } = await getOrders(before);

  return (
    <OrderList orders={orders} nextCursor={nextCursor} paged={Boolean(before)} />
  );
}

function Skeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[108px] rounded-card bg-white shadow-soft" />
      ))}
    </div>
  );
}
