import Link from "next/link";
import { BADGE_STYLE, resolveBadges } from "@/lib/badges";
import { formatPrice } from "@/lib/format";
import { stockStatus } from "@/lib/stock";
import type { ProductWithCategory } from "@/types/database";
import { ProductPhoto } from "./ProductPhoto";

/**
 * 추천 캐러셀의 카드. **이제 여기서만 쓴다** — 목록은 ProductRow(가로줄)로 바뀌었다.
 *
 * 담기 버튼을 달지 않는다. 카드가 2.5개 보이는 크기라 44px 버튼이 사진의 1/3을
 * 가리고, 어차피 아래 목록에는 줄마다 담기 버튼이 있다.
 * 덤으로 사진 위에 겹쳐 두던 버튼이 사라져서, 스크롤할 때 고정 바 위로
 * 올라오던 문제도 원인 자체가 없어졌다.
 */
export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductWithCategory;
  priority?: boolean;
}) {
  const soldOut = stockStatus(product.today_stock).level === "out";

  return (
    <Link
      href={`/product/${product.id}`}
      className="group block overflow-hidden rounded-card bg-white shadow-soft transition-[transform,box-shadow] duration-250 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive active:translate-y-0"
      style={{ transitionTimingFunction: "var(--ease-out-soft)" }}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <ProductPhoto
          name={product.name}
          photoPath={product.photo_path}
          priority={priority}
          sizes="(max-width: 768px) 34vw, 200px"
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />

        {soldOut && (
          <div className="absolute inset-0 grid place-items-center bg-ink/45">
            <span className="rounded-pill bg-white/95 px-2.5 py-1 text-[11.5px] text-ink">
              품절
            </span>
          </div>
        )}

        <div className="absolute left-2 top-2 flex gap-1">
          {resolveBadges(product.badges).map((badge) => (
            <span
              key={badge.key}
              className={`rounded-[6px] px-1.5 py-1 text-[10px] leading-none ${BADGE_STYLE[badge.tone]}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      <div className="px-3 pb-3.5 pt-2.5">
        <h3 className="truncate text-[14px] leading-snug">{product.name}</h3>
        <p className="pt-1 text-[15px] leading-none tracking-tight">
          {formatPrice(product.price)}
        </p>
      </div>
    </Link>
  );
}
