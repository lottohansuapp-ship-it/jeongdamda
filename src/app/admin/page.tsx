import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminBoard } from "@/components/admin/AdminBoard";
import { getAdminData, getRecentErrors } from "@/lib/queries";

export const metadata: Metadata = {
  title: "오늘 재고 관리",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-5">
      <Suspense fallback={<Skeleton />}>
        <Board />
      </Suspense>
    </main>
  );
}

// getAdminData 는 로그인 쿠키를 읽으므로 요청 시점에만 실행될 수 있다.
async function Board() {
  // 최근 오류를 "지금부터 24시간 전"으로 세므로 시각을 읽는다.
  // 프리렌더 중에는 시각을 읽을 수 없어 요청 시점임을 먼저 알린다.
  await connection();

  const [result, errors] = await Promise.all([
    getAdminData(),
    getRecentErrors(),
  ]);

  if (!result.ok) {
    return (
      <div className="mt-24 rounded-card bg-white px-6 py-16 text-center shadow-soft">
        <p className="text-[15px]">관리자 데이터를 불러오지 못했어요.</p>
        <p className="pt-4 text-[12px] leading-relaxed text-ink-faint">
          {result.error}
        </p>
      </div>
    );
  }

  return (
    <AdminBoard
      categories={result.data.categories}
      products={result.data.products}
      errors={errors}
    />
  );
}

function Skeleton() {
  return (
    <div className="space-y-3 pt-24" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[168px] rounded-card bg-white shadow-soft" />
      ))}
    </div>
  );
}
