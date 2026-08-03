import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { stockStatus } from "@/lib/stock";
import type { ProductWithCategory } from "@/types/database";
import { ProductPhoto } from "./ProductPhoto";
import { StockBadge } from "./StockBadge";

interface ProductCardProps {
  product: ProductWithCategory;
  priority?: boolean;
  /** 캐러셀용 가로형 — 사진을 더 크게 */
  featured?: boolean;
}

export function ProductCard({
  product,
  priority = false,
  featured = false,
}: ProductCardProps) {
  const soldOut = stockStatus(product.today_stock).level === "out";

  return (
    <Link
      href={`/product/${product.id}`}
      className="group block rounded-card bg-white shadow-soft transition-[transform,box-shadow] duration-250 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive active:translate-y-0"
      style={{ transitionTimingFunction: "var(--ease-out-soft)" }}
    >
      <div
        className={`relative overflow-hidden rounded-t-card ${featured ? "aspect-[4/3]" : "aspect-square"}`}
      >
        <ProductPhoto
          name={product.name}
          photoPath={product.photo_path}
          priority={priority}
          sizes={
            featured
              ? "(max-width: 768px) 78vw, 340px"
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
          {product.made_today && (
            <span className="rounded-pill bg-olive px-2 py-1 text-[11px] leading-none tracking-wide text-white">
              TODAY
            </span>
          )}
          {product.recommended && (
            <span className="rounded-pill bg-white/95 px-2 py-1 text-[11px] leading-none text-clay">
              추천
            </span>
          )}
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
  );
}
