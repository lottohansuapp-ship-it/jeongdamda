import { ShopBrowser } from "@/components/shop/ShopBrowser";
import { StoreNotice } from "@/components/shop/StoreNotice";
import { BottomNav } from "@/components/ui/BottomNav";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { Wordmark } from "@/components/ui/Wordmark";
import { getShopData, getStore } from "@/lib/queries";

export default async function HomePage() {
  // 둘 다 'use cache' 라 홈은 계속 정적으로 프리렌더된다. 왕복이 늘지 않는다.
  const [result, store] = await Promise.all([getShopData(), getStore()]);

  return (
    <>
    {/*
      반찬 60줄 × (이름 링크 + 담기 버튼) 이라 하단 탭까지 탭 정지점이 약 120개다.
      스크린리더는 랜드마크로 건너뛸 수 있지만, 스크린리더를 안 쓰는
      키보드·스위치 사용자에게는 이 링크가 유일한 지름길이다.
      긴 목록이 있는 화면은 여기뿐이라 전역이 아니라 홈에만 둔다 —
      하단 탭이 없는 화면(로그인·약관)에 두면 가리킬 곳이 없는 링크가 된다.
    */}
    <a
      href="#main-nav"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-ink focus:px-4 focus:py-3 focus:text-[14px] focus:text-white"
    >
      메뉴로 건너뛰기
    </a>
    <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pb-10">
      <header className="pb-5 pt-9">
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

      {/* 사장님 공지는 목록보다 위에. 반찬을 다 고르고 나서 알면 늦다.
          위(header pb-5)와 아래(pb-5)를 같게 둬서 공지가 한쪽으로 쏠려 보이지 않게 한다. */}
      <div className="pb-5">
        <StoreNotice notice={store.settings?.notice ?? null} />
      </div>

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
