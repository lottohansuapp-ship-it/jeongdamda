"use client";

import { useMemo, useState } from "react";
import { hasBadge, RECOMMEND_KEY } from "@/lib/badges";
import { EMPTY_FILTERS, filterProducts, type ShopFilters } from "@/lib/filter";
import type { Category, ProductWithCategory } from "@/types/database";
import { ProductCard } from "./ProductCard";

const HOT_SLUGS = ["soup", "stew"];

interface ShopBrowserProps {
  categories: Category[];
  products: ProductWithCategory[];
}

export function ShopBrowser({ categories, products }: ShopBrowserProps) {
  const [filters, setFilters] = useState<ShopFilters>(EMPTY_FILTERS);

  const patch = (next: Partial<ShopFilters>) =>
    setFilters((current) => ({ ...current, ...next }));

  const visible = useMemo(
    () => filterProducts(products, filters),
    [products, filters],
  );

  const recommended = useMemo(
    () => products.filter((p) => hasBadge(p.badges, RECOMMEND_KEY)).slice(0, 3),
    [products],
  );

  const hotPot = useMemo(
    () => products.filter((p) => HOT_SLUGS.includes(p.category.slug)).slice(0, 6),
    [products],
  );

  const browsing =
    filters.query.trim().length > 0 ||
    filters.categorySlug !== null ||
    filters.recommendedOnly ||
    filters.hideSoldOut;

  return (
    <>
      {!browsing && recommended.length > 0 && (
        <section className="pt-2" aria-labelledby="recommend-heading">
          <SectionHead
            id="recommend-heading"
            title="오늘의 추천"
            note="사장님이 오늘 제일 자신 있는 반찬"
          />
          <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2">
            {recommended.map((product, index) => (
              <div
                key={product.id}
                className="w-[78vw] max-w-[340px] shrink-0 snap-start"
              >
                <ProductCard product={product} featured priority={index === 0} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!browsing && hotPot.length > 0 && (
        <section className="pt-9" aria-labelledby="hotpot-heading">
          <SectionHead
            id="hotpot-heading"
            title="오늘의 국·찌개"
            note="따뜻하게 데워 바로 드세요"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {hotPot.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}

      <section className="pt-9" aria-labelledby="all-heading">
        <div className="sticky top-0 z-10 -mx-5 bg-canvas/92 px-5 pb-3 pt-3 backdrop-blur-md">
          <label className="relative block">
            <span className="sr-only">반찬 검색</span>
            <SearchIcon />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => patch({ query: event.target.value })}
              placeholder="먹고 싶은 반찬을 찾아보세요"
              className="h-12 w-full rounded-pill border border-line bg-white pl-11 pr-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus:outline-none"
            />
          </label>

          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
            <Chip
              active={filters.categorySlug === null}
              onClick={() => patch({ categorySlug: null })}
            >
              전체
            </Chip>
            {categories.map((category) => (
              <Chip
                key={category.id}
                active={filters.categorySlug === category.slug}
                onClick={() => patch({ categorySlug: category.slug })}
              >
                {category.name}
              </Chip>
            ))}
          </div>

          <div className="mt-2.5 flex gap-2">
            <Toggle
              active={filters.recommendedOnly}
              onClick={() => patch({ recommendedOnly: !filters.recommendedOnly })}
            >
              추천만
            </Toggle>
            <Toggle
              active={filters.hideSoldOut}
              onClick={() => patch({ hideSoldOut: !filters.hideSoldOut })}
            >
              품절 제외
            </Toggle>
          </div>
        </div>

        <div className="flex items-baseline justify-between pb-4 pt-5">
          <h2 id="all-heading" className="text-[19px]">
            {filters.categorySlug
              ? categories.find((c) => c.slug === filters.categorySlug)?.name
              : "전체 반찬"}
          </h2>
          <span className="text-[13px] text-ink-soft">{visible.length}가지</span>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-card bg-white px-6 py-16 text-center text-[14px] leading-relaxed text-ink-soft shadow-soft">
            찾으시는 반찬이 오늘은 없어요.
            <br />
            다른 이름으로 검색해 보시겠어요?
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function SectionHead({
  id,
  title,
  note,
}: {
  id: string;
  title: string;
  note: string;
}) {
  return (
    <div className="pb-4">
      <h2 id={id} className="text-[19px]">
        {title}
      </h2>
      <p className="pt-1 text-[13px] text-ink-soft">{note}</p>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 shrink-0 rounded-pill px-4 text-[14px] transition-colors duration-200 ${
        active
          ? "bg-ink text-white"
          : "border border-line bg-white text-ink-soft hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 rounded-pill px-3 text-[13px] transition-colors duration-200 ${
        active
          ? "bg-olive-soft text-olive-deep"
          : "border border-line bg-white text-ink-faint hover:text-ink-soft"
      }`}
    >
      {children}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
    </svg>
  );
}
