import Link from "next/link";
import { resolveBadges, type BadgeTone } from "@/lib/badges";
import { formatPrice } from "@/lib/format";
import { stockStatus } from "@/lib/stock";
import type { ProductWithCategory } from "@/types/database";
import { ProductPhoto } from "./ProductPhoto";
import { QuickAdd } from "./QuickAdd";
import { StockBadge } from "./StockBadge";

/** 뱃지 색은 카드·상세·관리자가 같은 표를 쓴다 */
export const BADGE_STYLE: Record<BadgeTone, string> = {
  olive: "bg-olive text-white",
  clay: "bg-white/95 text-clay",
  danger: "bg-danger text-white",
};

/**
 * 사진 비율. 사진 칸과 담기 버튼을 얹는 칸이 같은 값을 써야 한다 —
 * 두 군데 따로 적으면 한쪽만 고쳐져 버튼이 엉뚱한 데 붙는다.
 *
 * 추천 카드가 16:9 인 이유: 4:3 이면 카드 높이가 아래 격자 카드의 1.4배가 되어
 * 화면을 혼자 차지한다. 폭만 넓고 높이는 비슷해야 나란히 놓았을 때 자연스럽다.
 */
const ASPECT = {
  featured: "aspect-[16/9]",
  grid: "aspect-square",
} as const;

interface ProductCardProps {
  product: ProductWithCategory;
  priority?: boolean;
  /** 캐러셀용 가로형 — 사진을 더 넓게 */
  featured?: boolean;
}

export function ProductCard({
  product,
  priority = false,
  featured = false,
}: ProductCardProps) {
  const soldOut = stockStatus(product.today_stock).level === "out";
  const aspect = featured ? ASPECT.featured : ASPECT.grid;

  return (
    // 담기 버튼을 링크 안에 둘 수 없다 (버튼 안의 버튼). 카드를 감싸고 그 위에 겹친다.
    <article className="group relative">
      {!soldOut && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 z-10 ${aspect}`}
        >
          <div className="pointer-events-auto absolute bottom-2.5 right-2.5">
            <QuickAdd productId={product.id} productName={product.name} />
          </div>
        </div>
      )}

      <Link
        href={`/product/${product.id}`}
        className="block rounded-card bg-white shadow-soft transition-[transform,box-shadow] duration-250 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive active:translate-y-0"
        style={{ transitionTimingFunction: "var(--ease-out-soft)" }}
      >
      <div className={`relative overflow-hidden rounded-t-card ${aspect}`}>
        <ProductPhoto
          name={product.name}
          photoPath={product.photo_path}
          priority={priority}
          sizes={
            featured
              ? "(max-width: 768px) 84vw, 330px"
              : "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 240px"
          }
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />

        {soldOut && (
          <div className="absolute inset-0 grid place-items-center bg-ink/45">
            <span className="rounded-pill bg-white/95 px-3 py-1.5 text-[13px] text-ink">
              오늘은 품절되었어요
            </span>
          </div>
        )}

        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          {resolveBadges(product.badges).map((badge) => (
            <span
              key={badge.key}
              className={`rounded-pill px-2 py-1 text-[11px] leading-none ${BADGE_STYLE[badge.tone]}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 px-3.5 pb-4 pt-3">
        <p className="text-[11px] tracking-wide text-ink-faint">
          {product.category.name}
        </p>
        <h3 className="text-[15px] leading-snug">{product.name}</h3>
        {product.description && (
          <p className="line-clamp-1 text-[12.5px] leading-relaxed text-ink-soft">
            {product.description}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[16px] tracking-tight">
            {formatPrice(product.price)}
          </span>
          <StockBadge stock={product.today_stock} />
        </div>
        </div>
      </Link>
    </article>
  );
}
