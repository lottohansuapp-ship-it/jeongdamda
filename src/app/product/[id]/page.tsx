import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddToCart } from "@/components/cart/AddToCart";
import { BADGE_STYLE, resolveBadges } from "@/lib/badges";
import { ProductPhoto } from "@/components/shop/ProductPhoto";
import { StockBadge } from "@/components/shop/StockBadge";
import { formatPrice } from "@/lib/format";
import { getProduct } from "@/lib/queries";
import { stockStatus } from "@/lib/stock";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getProduct(id);
  if (!result.ok || !result.data) return { title: "반찬을 찾을 수 없어요" };

  const product = result.data;
  return {
    title: product.name,
    description:
      product.description ??
      `${product.category.name} · ${formatPrice(product.price)}`,
  };
}

// params 는 요청 시점에만 알 수 있다. 셸은 정적으로 내보내고 본문만 스트리밍한다.
export default function ProductPage({ params }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 pb-52">
      <Suspense fallback={<ProductSkeleton />}>
        <ProductBody params={params} />
      </Suspense>
    </main>
  );
}

function ProductSkeleton() {
  return (
    <div aria-hidden>
      <div className="aspect-[16/9] w-full bg-white sm:mt-6 sm:rounded-card" />
      <div className="space-y-3 px-5 pt-6">
        <div className="h-6 w-2/3 rounded-pill bg-white" />
        <div className="h-4 w-1/2 rounded-pill bg-white" />
        <div className="h-[76px] rounded-card bg-white" />
      </div>
    </div>
  );
}

async function ProductBody({ params }: PageProps) {
  const { id } = await params;
  const result = await getProduct(id);

  if (!result.ok) {
    return (
      <div className="px-5 py-24 text-center">
        <p className="text-[15px]">상품 정보를 불러오지 못했어요.</p>
        <p className="pt-3 text-[12px] text-ink-faint">{result.error}</p>
        <BackLink />
      </div>
    );
  }

  if (!result.data) notFound();

  const product = result.data;
  const status = stockStatus(product.today_stock);

  const facts = [
    ["원산지", product.origin],
    ["알레르기 정보", product.allergy],
    ["추천 조합", product.pairing],
  ].filter(([, value]) => Boolean(value)) as [string, string][];

  return (
    <>
      <div className="relative aspect-[16/9] w-full overflow-hidden sm:mt-6 sm:rounded-card">
        <ProductPhoto
          name={product.name}
          photoPath={product.photo_path}
          priority
          sizes="(max-width: 720px) 100vw, 720px"
        />
        {status.level === "out" && (
          <div className="absolute inset-0 grid place-items-center bg-ink/45">
            <span className="rounded-pill bg-white/95 px-4 py-2 text-[14px]">
              오늘은 품절되었어요
            </span>
          </div>
        )}
      </div>

      <div className="px-5">
        <div className="flex flex-wrap items-center gap-1.5 pt-4">
          <span className="rounded-pill bg-white px-2.5 py-1 text-[12px] text-ink-soft shadow-soft">
            {product.category.name}
          </span>
          {resolveBadges(product.badges).map((badge) => (
            <span
              key={badge.key}
              className={`rounded-pill px-2.5 py-1 text-[12px] leading-none ${BADGE_STYLE[badge.tone]}`}
            >
              {badge.label}
            </span>
          ))}
        </div>

        <h1 className="pt-2.5 text-[24px] leading-tight">{product.name}</h1>

        {/* 가격과 재고를 이름 바로 아래 둔다. 예전에는 설명 아래 별도 카드라
            얼마인지 보려고 한 번 밀어야 했다. 배달앱이 이름·가격을 붙여 두는
            이유가 그것이다 — 손님이 가장 먼저 확인하는 두 가지다. */}
        <div className="flex items-center gap-3 pt-2">
          <span className="text-[22px] tracking-tight">
            {formatPrice(product.price)}
          </span>
          <StockBadge stock={product.today_stock} showCount />
        </div>

        {product.description && (
          <p className="pt-3 text-[14.5px] leading-relaxed text-ink-soft">
            {product.description}
          </p>
        )}

        {facts.length > 0 && (
          <dl className="mt-4 divide-y divide-line rounded-card bg-white px-4 shadow-soft">
            {facts.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[76px_1fr] gap-3 py-2.5">
                <dt className="text-[12.5px] text-ink-faint">{label}</dt>
                <dd className="text-[13.5px] leading-relaxed">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <p className="pt-5 text-center text-[12.5px] leading-relaxed text-ink-faint">
          재고는 매장에서 수정하는 즉시 반영됩니다.
          <br />
          방문 전 한 번 더 확인해 주세요.
        </p>

        <BackLink />
      </div>

      <AddToCart
        productId={product.id}
        productName={product.name}
        price={product.price}
        stock={product.today_stock}
        available={product.today_available}
      />
    </>
  );
}

function BackLink() {
  return (
    <div className="pt-5 text-center">
      <Link
        href="/"
        className="inline-flex h-12 items-center rounded-pill border border-line bg-white px-6 text-[14px] text-ink-soft transition-colors duration-200 hover:border-ink-faint"
      >
        다른 반찬 더 보기
      </Link>
    </div>
  );
}
