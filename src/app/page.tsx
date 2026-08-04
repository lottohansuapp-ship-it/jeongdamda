import { ShopBrowser } from "@/components/shop/ShopBrowser";
import { BottomNav } from "@/components/ui/BottomNav";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { Wordmark } from "@/components/ui/Wordmark";
import { getShopData } from "@/lib/queries";

export default async function HomePage() {
  const result = await getShopData();

  return (
    <>
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pb-10">
      <header className="pb-8 pt-9">
        <Wordmark as="h1" size="lg" />
        <p className="pt-4 text-[15px] leading-relaxed text-ink-soft">
          오늘 아침에 만든 반찬입니다.
          {result.ok && (
            <>
              <br />
              지금 준비된 건{" "}
              <span className="text-[19px] tracking-tight text-olive-deep">
                {result.data.products.length}가지
              </span>
              예요.
            </>
          )}
        </p>
      </header>

      {result.ok ? (
        <ShopBrowser
          categories={result.data.categories}
          products={result.data.products}
        />
      ) : (
        <DataError message={result.error} />
      )}

      {/* 전자상거래법은 사업자 정보를 초기화면에 표시하라고 정한다. 여기가 그 자리다. */}
      <SiteFooter />
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
