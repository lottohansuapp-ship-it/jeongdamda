import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { BottomNav } from "@/components/ui/BottomNav";
import { getOrder, getProfile } from "@/lib/queries";

export const metadata: Metadata = {
  title: "주문 상세",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

// params 는 요청 시점에만 알 수 있다. 셸은 정적으로 내보내고 본문만 스트리밍한다.
export default function OrderPage({ params }: PageProps) {
  return (
    <>
      <main className="mx-auto w-full max-w-[560px] flex-1 px-5 pt-6">
        <Suspense fallback={<Skeleton />}>
          <OrderBody params={params} />
        </Suspense>
      </main>
      <BottomNav active="orders" />
    </>
  );
}

async function OrderBody({ params }: PageProps) {
  const { id } = await params;

  const profile = await getProfile();
  if (!profile) redirect(`/login?next=%2Forders%2F${id}`);

  // 남의 주문은 RLS 가 0행으로 막는다. 여기서 권한을 다시 따질 필요가 없다.
  const order = await getOrder(id);
  if (!order) notFound();

  return <OrderDetail order={order} />;
}

function Skeleton() {
  return (
    <div className="space-y-2.5" aria-hidden>
      <div className="h-[180px] rounded-card bg-white shadow-soft" />
      <div className="h-[160px] rounded-card bg-white shadow-soft" />
    </div>
  );
}
