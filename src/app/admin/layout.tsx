import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { switchToAdminLogin } from "@/lib/auth";
import { getAdminAccess } from "@/lib/queries";

/**
 * 관리자 화면 입구. 관리자가 아닌 계정이면 화면 대신 안내를 보여준다.
 *
 * 로그인 여부는 proxy 가 보고, 관리자인지는 여기서 본다. 예전엔 로그인만
 * 하면 들어와져서, 손님 계정으로 로그인한 휴대폰에서 반찬을 추가하다가
 * 영어 권한 오류만 보고 막혔다.
 *
 * 이건 안내다. 실제로 막는 건 쓰기마다 걸리는 RLS(is_admin)라서, 여기가
 * 뚫려도 바뀌는 건 없다.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  // 로그인 쿠키를 읽는다. 프리렌더 중에는 돌 수 없다.
  await connection();

  const access = await getAdminAccess();
  if (access.admin) return <>{children}</>;

  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-16">
      <div className="rounded-card bg-white p-6 shadow-soft">
        <h1 className="text-[20px] leading-snug">이 계정은 관리자가 아니에요</h1>
        <p className="pt-3 text-[14px] leading-relaxed text-ink-soft">
          {access.email ? (
            <>
              지금 <span className="text-ink">{access.email}</span> 로 로그인돼
              있어요.{" "}
            </>
          ) : null}
          반찬·주문·매장 설정을 바꾸려면 관리자 계정으로 다시 로그인해 주세요.
        </p>

        <form action={switchToAdminLogin} className="pt-6">
          <button
            type="submit"
            className="h-12 w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep"
          >
            로그아웃하고 관리자로 로그인
          </button>
        </form>
        <Link
          href="/"
          className="mt-2.5 flex h-12 w-full items-center justify-center rounded-card border border-line text-[14px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
        >
          손님 화면으로
        </Link>
      </div>
    </main>
  );
}
