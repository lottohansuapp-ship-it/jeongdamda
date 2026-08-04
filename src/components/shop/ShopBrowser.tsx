"use client";

import { useMemo, useState } from "react";
import { hasBadge, MAX_RECOMMENDED, RECOMMEND_KEY } from "@/lib/badges";
import { EMPTY_FILTERS, filterProducts, type ShopFilters } from "@/lib/filter";
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

      <section className="pt-8" aria-labelledby="all-heading">
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
              className="h-12 w-full rounded-pill border border-line bg-white pl-11 pr-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus:outline-none"
            />
          </label>

          {/* 메인 카테고리 — 무엇을 보고 있는지 정하는 자리라 가장 진하게.
              고르지 않은 것은 배경 없이 글자만 남겨 한 줄이 가볍게 보이게 한다. */}
          <div
            role="tablist"
            aria-label="카테고리"
            className="no-scrollbar -mx-5 mt-2.5 flex gap-1 overflow-x-auto px-5"
          >
            <Tab
              active={filters.categorySlug === null}
              onClick={() => patch({ categorySlug: null })}
            >
              전체
            </Tab>
            {categories.map((category) => (
              <Tab
                key={category.id}
                active={filters.categorySlug === category.slug}
                onClick={() => patch({ categorySlug: category.slug })}
              >
                {category.name}
              </Tab>
            ))}
          </div>

          {/* 보조 필터 — 카테고리 위에 덧씌우는 조건이라 한 단계 약하게.
              모양(테두리)과 크기 둘 다 다르게 해야 역할이 다르다는 게 읽힌다. */}
          <div className="mt-1.5 flex gap-1.5">
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

/**
 * 메인 카테고리.
 *
 * 누르는 자리는 48px 를 지키되(프로젝트 규칙) 보이는 배경은 34px 로 짧게 둔다.
 * 여백으로 손가락 자리를 만들면 한 줄이 차지하는 높이는 그대로여도
 * 눈에는 훨씬 가볍게 보인다. 캐러셀 점에서 쓴 방법과 같다.
 */
function Tab({
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
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="group shrink-0 py-[7px]"
    >
      <span
        className={`block rounded-[10px] px-3.5 py-2 text-[14px] leading-none transition-colors duration-200 ${
          active
            ? "bg-ink text-white"
            : "text-ink-soft group-hover:bg-white group-hover:text-ink"
        }`}
      >
        {children}
      </span>
    </button>
  );
}

/** 보조 필터. 메인보다 작고, 켜지 않았을 때도 테두리가 남아 성격이 다르다는 걸 보인다. */
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
      className="group py-[9px]"
    >
      <span
        className={`block rounded-pill border px-2.5 py-1.5 text-[12.5px] leading-none transition-colors duration-200 ${
          active
            ? "border-olive bg-olive-soft text-olive-deep"
            : "border-line bg-white text-ink-faint group-hover:text-ink-soft"
        }`}
      >
        {children}
      </span>
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
