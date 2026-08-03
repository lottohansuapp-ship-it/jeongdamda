import Link from "next/link";
import { ShopBrowser } from "@/components/shop/ShopBrowser";
import { BottomNav } from "@/components/ui/BottomNav";
import { getShopData } from "@/lib/queries";

export default async function HomePage() {
  const result = await getShopData();

  return (
    <>
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pb-10">
      <header className="pb-8 pt-10">
        <p className="text-[14px] text-ink-soft">안녕하세요 :)</p>
        <h1 className="pt-1.5 text-[28px] leading-tight sm:text-[34px]">
          오늘의 반찬입니다.
        </h1>
        {result.ok && (
          <p className="pt-5 text-[15px] text-ink-soft">
            오늘 준비된 반찬{" "}
            <span className="text-[22px] tracking-tight text-olive-deep">
              {result.data.products.length}
            </span>
            가지
          </p>
        )}
      </header>

      {result.ok ? (
        <ShopBrowser
          categories={result.data.categories}
          products={result.data.products}
        />
      ) : (
        <DataError message={result.error} />
      )}

      <footer className="pt-16 text-center text-[12.5px] leading-relaxed text-ink-faint">
        재고는 사장님이 수정하는 즉시 반영됩니다.
        <br />
        <Link href="/admin" className="underline underline-offset-4">
          사장님 로그인
        </Link>
      </footer>
    </main>
    <BottomNav active="home" />
    </>
  );
}

function DataError({ message }: { message: string }) {
  return (
    <div className="rounded-card bg-white px-6 py-16 text-center shadow-soft">
      <p className="text-[15px]">반찬 목록을 불러오지 못했어요.</p>
      <p className="pt-2 text-[13px] leading-relaxed text-ink-soft">
        잠시 후 다시 시도해 주세요.
      </p>
      <p className="pt-4 text-[12px] text-ink-faint">{message}</p>
    </div>
  );
}
