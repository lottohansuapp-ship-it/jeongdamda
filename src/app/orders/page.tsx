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

export default function OrdersPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-[560px] flex-1 px-5">
        <header className="pb-5 pt-10">
          <h1 className="text-[26px] leading-tight">주문내역</h1>
        </header>

        <Suspense fallback={<Skeleton />}>
          <OrdersBody />
        </Suspense>
      </main>
      <BottomNav active="orders" />
    </>
  );
}

async function OrdersBody() {
  const profile = await getProfile();
  if (!profile) redirect("/login?next=%2Forders");

  return <OrderList orders={await getOrders()} />;
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
