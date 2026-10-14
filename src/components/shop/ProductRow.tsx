import Link from "next/link";
import { BADGE_STYLE_INLINE, resolveBadges } from "@/lib/badges";
import { formatPrice } from "@/lib/format";
import { stockStatus } from "@/lib/stock";
import type { ProductWithCategory } from "@/types/database";
import { ProductPhoto } from "./ProductPhoto";
import { QuickAdd } from "./QuickAdd";
import { StockBadge } from "./StockBadge";

/**
 * 목록의 한 줄. 왼쪽 사진, 오른쪽 정보, 끝에 담기 버튼.
 *
 * 세로 카드에서 바꾼 이유는 밀도다. 세로 카드는 한 화면에 네 개가 들어가는데
 * 그중 대부분이 사진이라, 반찬 이름을 훑어보려면 계속 스크롤해야 했다.
 * 가로줄은 같은 높이에 두 배가 들어가고 이름·가격이 한눈에 정렬된다.
 * 배민·쿠팡이츠가 메뉴 목록에 세로 카드를 쓰지 않는 이유이기도 하다.
 *
 * 링크 안에 버튼을 넣을 수 없다. 그래서 제목의 링크에 after 로 줄 전체를 덮고
 * 담기 버튼만 그 위(z-10)에 올린다. 줄 아무 데나 누르면 상세로 가고,
 * 버튼을 누르면 담기만 된다.
 */
export function ProductRow({ product }: { product: ProductWithCategory }) {
  const level = stockStatus(product.today_stock).level;
  const soldOut = level === "out";
  const badges = resolveBadges(product.badges);

  return (
    <article
      className="defer-offscreen relative flex gap-3.5 rounded-card bg-white p-3.5 shadow-soft transition-shadow duration-200 hover:shadow-lift"
    >
      <div className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[12px]">
        <ProductPhoto
          name={product.name}
          photoPath={product.photo_path}
          sizes="84px"
        />
        {/* 반투명 위의 흰 11px 글씨는 밝은 반찬 사진 위에서 대비가 3:1 도 안 됐다.
            흰 알약 위의 진한 글씨는 사진과 상관없이 읽힌다 (ProductCard 와 같은 모양). */}
        {soldOut && (
          <div className="absolute inset-0 grid place-items-center bg-ink/30">
            <span className="rounded-pill bg-white/95 px-2 py-1 text-[12px] leading-none text-ink">
              품절
            </span>
          </div>
        )}
      </div>

      {/* min-w-0 이 없으면 긴 설명이 담기 버튼을 화면 밖으로 밀어낸다 */}
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] leading-snug">
          {/* after 로 줄 전체를 덮는다. 링크의 이름은 반찬 이름 그대로 남는다. */}
          <Link
            href={`/product/${product.id}`}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-olive"
          >
            {product.name}
          </Link>
        </h3>

        <p className="pt-1 text-[16px] leading-none tracking-tight">
          {formatPrice(product.price)}
        </p>

        {product.description && (
          <p className="line-clamp-1 pt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
            {product.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          {/* 얼마 안 남았을 때만 보인다. 넉넉한 반찬마다 「충분」 이 붙으면 소음이 되고,
              정작 2개 남은 반찬이 30개 남은 반찬과 똑같아 보였다. */}
          {level === "low" && <StockBadge stock={product.today_stock} showCount />}
          {badges.map((badge) => (
            <span
              key={badge.key}
              className={`rounded-[6px] px-1.5 py-1 text-[11px] leading-none ${BADGE_STYLE_INLINE[badge.tone]}`}
            >
              {badge.label}
            </span>
          ))}
          <span className="text-[11.5px] text-ink-faint">
            {product.category.name}
          </span>
        </div>
      </div>

      {!soldOut && (
        // 링크가 덮은 면 위로 올린다. 이게 없으면 담기가 아니라 상세로 넘어간다.
        <div className="relative z-10 self-center">
          <QuickAdd productId={product.id} productName={product.name} />
        </div>
      )}
    </article>
  );
}
