"use client";

import { useMemo, useState } from "react";
import { hasBadge, MAX_RECOMMENDED, RECOMMEND_KEY } from "@/lib/badges";
import { EMPTY_FILTERS, filterProducts, isFiltering, type ShopFilters } from "@/lib/filter";
import { FilterChip, FilterTab } from "@/components/ui/Filters";
import type { Category, ProductWithCategory } from "@/types/database";
import { Carousel } from "./Carousel";
import { ProductCard } from "./ProductCard";
import { ProductRow } from "./ProductRow";

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
    () =>
      products
        .filter((p) => hasBadge(p.badges, RECOMMEND_KEY))
        .slice(0, MAX_RECOMMENDED),
    [products],
  );

  const browsing = isFiltering(filters);

  return (
    <>
      {!browsing && recommended.length > 0 && (
        <section className="pt-1" aria-labelledby="recommend-heading">
          <SectionHead
            id="recommend-heading"
            title="오늘의 추천"
            note="사장님이 오늘 제일 자신 있는 반찬"
          />
          <Carousel label="오늘의 추천 반찬">
            {recommended.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                priority={index === 0}
              />
            ))}
          </Carousel>
        </section>
      )}

      {/* 카테고리를 고르면 위의 추천 캐러셀이 사라진다. 그때도 pt-8 이 남아 있으면
          공지와 검색창 사이가 휑하게 벌어진다. 캐러셀이 있을 때만 띄운다. */}
      <section
        className={browsing ? "pt-1" : "pt-8"}
        aria-labelledby="all-heading"
      >
        {/* z-20 이어야 한다. 카드의 담기 버튼이 z-10 이라, 같은 층이면 스크롤할 때
            버튼이 이 바 위로 올라와 겹친다. */}
        <div className="sticky top-0 z-20 -mx-5 bg-canvas/92 px-5 pb-2.5 pt-3 backdrop-blur-md">
          <label className="relative block">
            <span className="sr-only">반찬 검색</span>
            <SearchIcon />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => patch({ query: event.target.value })}
              placeholder="먹고 싶은 반찬을 찾아보세요"
              className="h-12 w-full rounded-pill border border-line bg-white pl-11 pr-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
            />
          </label>

          {/* 메인 카테고리 — 무엇을 보고 있는지 정하는 자리라 가장 진하게.
              고르지 않은 것은 배경 없이 글자만 남겨 한 줄이 가볍게 보이게 한다. */}
          <div
            aria-label="카테고리"
            className="no-scrollbar -mx-5 mt-2.5 flex gap-1 overflow-x-auto px-5"
          >
            <FilterTab
              active={filters.categorySlug === null}
              onClick={() => patch({ categorySlug: null })}
            >
              전체
            </FilterTab>
            {categories.map((category) => (
              <FilterTab
                key={category.id}
                active={filters.categorySlug === category.slug}
                onClick={() => patch({ categorySlug: category.slug })}
              >
                {category.name}
              </FilterTab>
            ))}
          </div>

          {/* 보조 필터 — 카테고리 위에 덧씌우는 조건이라 한 단계 약하게.
              모양(테두리)과 크기 둘 다 다르게 해야 역할이 다르다는 게 읽힌다. */}
          <div className="mt-1.5 flex gap-1.5">
            <FilterChip
              active={filters.badgeKey === RECOMMEND_KEY}
              onClick={() =>
                patch({
                  badgeKey:
                    filters.badgeKey === RECOMMEND_KEY ? null : RECOMMEND_KEY,
                })
              }
            >
              추천만
            </FilterChip>
            <FilterChip
              active={filters.hideSoldOut}
              onClick={() => patch({ hideSoldOut: !filters.hideSoldOut })}
            >
              품절 제외
            </FilterChip>
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
          // 세로 카드는 한 화면에 넷이 들어가는데 대부분이 사진이었다.
          // 가로줄이면 같은 높이에 두 배가 들어가고 이름·가격이 한눈에 정렬된다.
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((product) => (
              <ProductRow key={product.id} product={product} />
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
