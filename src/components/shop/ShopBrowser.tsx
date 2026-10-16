"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { markFromList } from "@/components/ui/BackToList";
import { Toast } from "@/components/ui/Toast";
import { addToCart } from "@/lib/cart-actions";
import { takePendingAdd } from "@/lib/pending-add";
import { hasBadge, MAX_RECOMMENDED, RECOMMEND_KEY } from "@/lib/badges";
import { EMPTY_FILTERS, filterProducts, isFiltering, soldOutLast, type ShopFilters } from "@/lib/filter";
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

  function patch(next: Partial<ShopFilters>) {
    const merged = { ...filters, ...next };
    saveFilters(merged);
    setFilters(merged);
  }

  /*
    장바구니의 「메뉴 더 담기」·주문서의 「추가 주문」 으로 돌아오면 고르던
    카테고리·검색이 그대로다. 예전엔 「나물」 을 보다 나가면 돌아와서 다시 골라야 했다.
    서버는 sessionStorage 를 못 보므로 그린 뒤에 되살린다.
  */
  useEffect(() => {
    const saved = loadFilters(categories);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 그린 뒤에만 읽을 수 있다
    if (saved) setFilters(saved);
  }, [categories]);

  const listRef = useRef<HTMLElement>(null);

  // 상세의 「뒤로」 가 진짜 뒤로가기를 해도 되는지 알려 준다 (BackToList).
  useEffect(() => markFromList(), []);

  /*
    로그인하러 갔다가 돌아왔다 — 그때 누른 반찬을 담고 목록의 그 자리로 간다.
    예전엔 돌아와 보면 반찬이 안 담겨 있어서 한 번 더 눌러야 했다.
    로그인을 안 하고 돌아왔으면 담기가 거절되고 아무 일도 없다.
  */
  const router = useRouter();
  const [added, setAdded] = useState<{ message: string; tone: "error" | "notice" } | null>(null);
  useEffect(() => {
    const pending = takePendingAdd();
    if (!pending) return;
    // 화면 전환이 맨 위로 올린 뒤에 내려가야 한다 — 한 프레임 미룬다.
    if (pending.scrollY) requestAnimationFrame(() => window.scrollTo({ top: pending.scrollY }));
    const name = products.find((product) => product.id === pending.productId)?.name ?? "반찬";
    void addToCart(pending.productId, pending.quantity)
      .then((result) => {
        // 로그인 안 하고 돌아왔으면 조용히 넘어간다. 그 사이 품절 같은 건 알린다.
        if (!result.ok) {
          if (!result.error.includes("로그인")) setAdded({ message: result.error, tone: "error" });
          return;
        }
        setAdded({ message: `${name}을(를) 담았어요`, tone: "notice" });
        router.refresh(); // 하단 「장바구니 보기」 바를 띄운다
      })
      .catch(() =>
        setAdded({ message: `${name}을(를) 담지 못했어요. 다시 눌러 주세요.`, tone: "error" }),
      );
  }, [products, router]);

  useEffect(() => {
    if (!added) return;
    // 오류는 읽고 판단할 시간을 더 준다 (QuickAdd 와 같다).
    const id = setTimeout(() => setAdded(null), added.tone === "error" ? 6000 : 3000);
    return () => clearTimeout(id);
  }, [added]);

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

  // 품절은 뒤로(숨기지 않음). 많이 팔린 날 살 수 있는 반찬을 찾으려고
  // 품절을 몇 개씩 지나치지 않게.
  // 검색어가 있으면 고른 카테고리를 넘어서 찾는다. 「나물」 을 고른 채 「멸치」 를 치면
  // 「오늘은 없어요」 가 떠서, 있는 반찬도 없는 줄 알았다(카테고리는 기억까지 된다).
  const searching = filters.query.trim().length > 0;
  const visible = useMemo(
    () =>
      soldOutLast(
        filterProducts(products, searching ? { ...filters, categorySlug: null } : filters),
      ),
    [products, filters, searching],
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
        className={`scroll-mt-3 ${!browsing && recommended.length > 0 ? "pt-8" : "pt-1"}`}
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
            /*
              양 끝 20px(=좌우 여백) 만 흐리게. 360px 갤럭시에서 마지막 카테고리가
              칼로 자른 듯 잘려 고장처럼 보였다. 흐려지면 "더 있다" 로 읽힌다.
              한 줄에 다 들어가는 화면에서는 그 자리가 원래 빈 여백이라 아무것도 안 흐려진다.
            */
            className="no-scrollbar -mx-5 mt-2.5 flex flex-nowrap gap-x-0.5 overflow-x-auto px-5 [mask-image:linear-gradient(to_right,transparent,black_20px,black_calc(100%-20px),transparent)]"
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
        </div>

        {/* 보조 필터 — 카테고리 위에 덧씌우는 조건이라 한 단계 약하게.
            고정 바 밖에 둔다. 바가 182px 이라 작은 휴대폰에선 반찬이 세 줄밖에 안 보였다.
            자주 바꾸는 건 검색·카테고리이고, 이 둘은 목록 맨 위에서 고르면 된다.
            모양(테두리)과 크기 둘 다 다르게 해야 역할이 다르다는 게 읽힌다. */}
        <div className="flex gap-1.5 pt-2.5">
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

        <div className="flex items-baseline justify-between pb-4 pt-4">
          <h2 id="all-heading" className="text-[19px]">
            {searching
              ? "검색 결과"
              : filters.categorySlug
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
          <div className="rounded-card bg-white px-6 py-14 text-center text-[15px] leading-relaxed text-ink-soft shadow-soft">
            <p>
              찾으시는 반찬이 오늘은 없어요.
              <br />
              다른 이름으로 찾아보시겠어요?
            </p>
            {/* 막다른 화면에서 한 번에 처음으로 */}
            <button
              type="button"
              onClick={() => patch(EMPTY_FILTERS)}
              className="mt-4 h-12 rounded-pill border border-line px-5 text-[15px] text-ink transition-colors duration-200 hover:border-olive hover:text-olive-deep"
            >
              전체 반찬 보기
            </button>
          </div>
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

      {added && <Toast message={added.message} tone={added.tone} />}
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

const FILTERS_KEY = "jeongdamda-shop-filters";

function saveFilters(filters: ShopFilters) {
  try {
    const { query, categorySlug, badgeKey, hideSoldOut } = filters;
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ query, categorySlug, badgeKey, hideSoldOut }));
  } catch {
    // 막힌 브라우저면 돌아왔을 때 처음부터 고르게 된다
  }
}

/** 저장된 필터. 그사이 사라진 카테고리는 버린다 — 빈 목록이 뜨면 품절인 줄 안다. */
function loadFilters(categories: Category[]): ShopFilters | null {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<ShopFilters>;
    const slug =
      typeof saved.categorySlug === "string" &&
      categories.some((category) => category.slug === saved.categorySlug)
        ? saved.categorySlug
        : null;
    return {
      ...EMPTY_FILTERS,
      query: typeof saved.query === "string" ? saved.query : "",
      categorySlug: slug,
      badgeKey: typeof saved.badgeKey === "string" ? saved.badgeKey : null,
      hideSoldOut: saved.hideSoldOut === true,
    };
  } catch {
    return null;
  }
}
