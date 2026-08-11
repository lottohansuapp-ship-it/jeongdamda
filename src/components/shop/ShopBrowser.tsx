"use client";

import { useMemo, useRef, useState } from "react";
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

  const listRef = useRef<HTMLElement>(null);

  /**
   * 카테고리를 고르면 목록 첫 줄로 옮겨 준다.
   *
   * 반찬이 서른아홉 가지라 손님은 한참 내려간 자리에서 카테고리를 누르게 된다.
   * 그러면 목록은 바뀌었는데 화면은 그대로 아래에 있어서, 고른 카테고리의
   * 첫 반찬을 보려면 다시 위로 올려야 했다. 무엇이 바뀌었는지도 잘 안 보인다.
   *
   * 위로 끝까지 올리지는 않는다. 검색창과 카테고리 줄은 화면에 남겨 둬야
   * 손님이 방금 무엇을 골랐는지 보이고, 바로 다른 카테고리로 옮길 수 있다.
   */
  function chooseCategory(slug: string | null) {
    patch({ categorySlug: slug });

    /*
      한 프레임 기다렸다가 옮긴다. 지금 재면 안 된다 —
      카테고리를 고르는 순간 위의 추천 캐러셀이 사라지고 여백(pt-8 -> pt-1)도
      줄어서 목록이 통째로 위로 올라온다. 바뀌기 전 위치로 옮기면 목록 한참
      아래에 떨어진다. 클릭은 화면에 그리기 전에 반영되므로 rAF 안에서는
      바뀐 자리를 잰다.

      자리 계산은 브라우저에 맡긴다. 여백은 scroll-mt-3 으로 준다.
    */
    requestAnimationFrame(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      listRef.current?.scrollIntoView({
        block: "start",
        behavior: reduce ? "auto" : "smooth",
      });
    });
  }

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
        className={`scroll-mt-3 ${browsing ? "pt-1" : "pt-8"}`}
        ref={listRef}
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

          {/*
            메인 카테고리 — 무엇을 보고 있는지 정하는 자리라 가장 진하게.
            고르지 않은 것은 배경 없이 글자만 남긴다.

            가로로 밀지 않고 접는다. 카테고리가 9개인데 예전 여백(px-3.5)으로는
            줄 폭이 527px 이라 화면(390px)을 넘어, 뒤쪽 셋은 손가락으로 밀어야만
            보였다. 좌우 여백을 6px 로 좁히니 360px 이상에서는 아홉 개가 한 줄에
            들어간다. 글자 크기는 14px 그대로 뒀다 — 어르신이 읽을 수 있게
            키워 둔 것을 여백 때문에 되돌릴 수는 없다.

            320px 기기에서는 두 줄로 접힌다. 밀어서 찾는 것보다 접혀 보이는 편이
            낫고, 이 폭에서 아홉 개를 한 줄에 넣으려면 글자를 줄이는 수밖에 없다.
            좁아진 뒤에도 누르는 자리는 24×44px 로 기준을 지킨다.
          */}
          <div
            aria-label="카테고리"
            /*
              접지 않는다. 한 줄로 고정하고, 넘치면 밀어서 본다.

              flex-wrap 이었을 때 이런 일이 있었다. 첫 화면은 대체 폰트로
              그려지는데 한글 폭이 넓어 카테고리가 두 줄(88px)이 된다.
              Pretendard 가 도착하면 한 줄(44px)로 접히고, 그 순간 아래 목록이
              통째로 44px 위로 밀린다. CLS 가 0.002 에서 0.195 로 뛰었다 —
              손님이 누르려던 반찬이 손가락 아래에서 사라지는 크기다.

              min-h 로 막아 보려 했지만 소용없었다. 최소 높이는 두 줄로
              커지는 것을 막지 못한다. 폰트 목록에 한글 대체 폰트를 넣어도
              첫 페인트는 여전히 두 줄이었다.

              nowrap 이면 폰트가 무엇이든 높이가 한 줄로 고정된다.
              아홉 개가 360px 이상에서 한 줄에 들어가는 것은 이미 확인했고,
              320px 처럼 좁은 화면에서만 살짝 밀어서 보게 된다.
              화면이 튀는 것보다 그편이 낫다.
            */
            className="no-scrollbar -mx-5 mt-2.5 flex flex-nowrap gap-x-0.5 overflow-x-auto px-5"
          >
            <FilterTab
              active={filters.categorySlug === null}
              onClick={() => chooseCategory(null)}
            >
              전체
            </FilterTab>
            {categories.map((category) => (
              <FilterTab
                key={category.id}
                active={filters.categorySlug === category.slug}
                onClick={() => chooseCategory(category.slug)}
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
          {/* 카테고리를 고르거나 검색어를 치면 목록이 바뀌는데 아무 안내가 없었다.
              결과가 몇 가지인지 읽히면 화면을 처음부터 다시 훑지 않아도 된다. */}
          <span role="status" className="text-[13px] text-ink-soft">
            {visible.length}가지
          </span>
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
