"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  bulkUpdateProducts,
  createProduct,
  reorderProducts,
} from "@/lib/actions";
import {
  EMPTY_FILTERS,
  filterProducts,
  isFiltering,
  type ShopFilters,
} from "@/lib/filter";
import { FilterChip, FilterTab } from "@/components/ui/Filters";
import { signOut } from "@/lib/auth";
import { BADGES, hasBadge, MAX_RECOMMENDED, RECOMMEND_KEY } from "@/lib/badges";
import { stockStatus } from "@/lib/stock";
import { missingStoreInfo } from "@/lib/store-info";
import { Wordmark } from "@/components/ui/Wordmark";
import type { Category, ProductWithCategory } from "@/types/database";
import { AdminRow } from "./AdminRow";

const TOAST_MS = 2600;

const INPUT =
  "h-12 w-full rounded-card border border-line bg-canvas px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus:outline-none";

interface AdminBoardProps {
  categories: Category[];
  products: ProductWithCategory[];
}

interface Toast {
  tone: "error" | "notice";
  message: string;
}

/**
 * 사업자 정보가 덜 채워졌다고 알린다.
 *
 * 이 항목들은 전자상거래법상 표시 의무이고, 포트원·PG 심사도 신청 시점에
 * 사이트에 이미 있어야 통과시킨다. 비어 있으면 심사가 반려된다.
 * 다 채우면 이 안내는 사라진다.
 */
function StoreInfoNotice() {
  const missing = missingStoreInfo();
  if (missing.length === 0) return null;

  return (
    <div className="mt-3 rounded-card bg-cream p-3.5">
      <p className="text-[13px] leading-relaxed">
        결제를 켜기 전에 <strong className="font-normal text-clay">
          {missing.join(" · ")}
        </strong>{" "}
        을(를) 등록해야 해요. 화면 아래쪽 사업자 정보에 &lsquo;미등록&rsquo;으로
        보이는 항목입니다.
      </p>
      <p className="pt-1.5 text-[12px] text-ink-faint">
        개발자에게 값을 알려주시면 반영됩니다 (src/lib/store-info.ts)
      </p>
    </div>
  );
}

export function AdminBoard({ categories, products }: AdminBoardProps) {
  const [order, setOrder] = useState(products);
  const [synced, setSynced] = useState(products);
  const [toast, setToast] = useState<Toast | null>(null);
  const [adding, setAdding] = useState(false);
  const [filters, setFilters] = useState<ShopFilters>(EMPTY_FILTERS);

  const patch = (next: Partial<ShopFilters>) =>
    setFilters((current) => ({ ...current, ...next }));

  // 걸러 보는 중에는 순서를 못 바꾼다. 화면에 안 보이는 상품과 자리를
  // 맞바꾸게 되어 사장님이 의도한 것과 다른 결과가 나온다.
  const filtering = isFiltering(filters);

  // 손님 화면과 같은 필터 로직을 쓴다. 두 벌로 두면 결과가 갈린다.
  const visible = useMemo(
    () => filterProducts(order, filters),
    [order, filters],
  );

  // 서버가 새 목록을 내려주면 렌더 중에 맞춘다. effect 로 하면 한 프레임 어긋난다.
  if (synced !== products) {
    setSynced(products);
    setOrder(products);
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const summary = useMemo(() => {
    const selling = products.filter((p) => p.today_available);
    return {
      // 전체와 판매중이 다르다. 전체가 안 보이면 관리자 권한이 붙었는지 알 수 없다
      total: products.length,
      hidden: products.length - selling.length,
      selling: selling.length,
      soldOut: selling.filter((p) => stockStatus(p.today_stock).level === "out")
        .length,
      low: selling.filter((p) => stockStatus(p.today_stock).level === "low")
        .length,
      // 손님 화면 맨 위 캐러셀에 올라가는 개수. 상한을 넘기면 넘긴 만큼은
      // 아무 표시 없이 안 나오므로 여기서 알려준다.
      recommended: selling.filter((p) => hasBadge(p.badges, RECOMMEND_KEY))
        .length,
      // 뱃지별 개수. 숨긴 상품도 센다 — 사장님은 그것도 관리해야 한다.
      badges: Object.fromEntries(
        BADGES.map((badge) => [
          badge.key,
          products.filter((p) => hasBadge(p.badges, badge.key)).length,
        ]),
      ) as Record<string, number>,
    };
  }, [products]);

  const onError = (message: string) => setToast({ tone: "error", message });
  const onNotice = (message: string) => setToast({ tone: "notice", message });

  /**
   * 지금 화면에 보이는 것 전부에 적용한다.
   * 필터로 추린 목록이 곧 대상이라, 체크박스 없이도 무엇이 바뀌는지 눈에 보인다.
   */
  async function bulk(available: boolean) {
    const targets = visible.filter((p) => p.today_available !== available);
    if (targets.length === 0) {
      onNotice("이미 전부 그렇게 되어 있어요");
      return;
    }
    if (
      !confirm(
        `보이는 ${targets.length}개를 ${available ? "판매중으로" : "숨김으로"} 바꿀까요?`,
      )
    ) {
      return;
    }

    const result = await bulkUpdateProducts(
      targets.map((p) => p.id),
      { today_available: available },
    );
    if (result.ok) onNotice(`${result.data.changed}개 바꿨어요`);
    else onError(result.error);
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;

    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);

    const result = await reorderProducts(next.map((p) => p.id));
    if (result.ok) onNotice("순서 저장됨");
    else {
      setOrder(products);
      onError(result.error);
    }
  }

  async function onAdd(formData: FormData) {
    const result = await createProduct({
      name: String(formData.get("name") ?? ""),
      price: Number(formData.get("price") ?? 0),
      category_id: String(formData.get("category_id") ?? ""),
      today_stock: Number(formData.get("today_stock") ?? 0),
      badges: ["today"],
      sort_order: order.length + 1,
    });

    if (result.ok) {
      setAdding(false);
      onNotice("상품이 추가되었습니다");
    } else {
      onError(result.error);
    }
  }

  return (
    <div className="pb-24">
      <header className="flex items-start justify-between gap-3 pb-6 pt-10">
        <div>
          <Wordmark size="sm" />
          <h1 className="pt-2 text-[26px] leading-tight">오늘 재고 관리</h1>
          <StoreInfoNotice />
          <p className="pt-3 text-[13px] text-ink-soft">
            전체 {summary.total}가지 · 판매중 {summary.selling}
          </p>
          {summary.recommended > MAX_RECOMMENDED && (
            <p className="pt-1 text-[13px] text-danger">
              추천이 {summary.recommended}개예요 — 손님 화면에는{" "}
              {MAX_RECOMMENDED}개까지만 나옵니다
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/admin/orders"
            className="flex h-11 items-center rounded-pill bg-olive px-4 text-[13px] text-white transition-colors duration-200 hover:bg-olive-deep"
          >
            주문 관리
          </Link>
          <Link
            href="/admin/sales"
            className="flex h-11 items-center rounded-pill border border-line bg-white px-4 text-[13px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
          >
            매출
          </Link>
          <Link
            href="/admin/store"
            className="flex h-11 items-center rounded-pill border border-line bg-white px-4 text-[13px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
          >
            매장 설정
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="h-11 rounded-pill border border-line bg-white px-4 text-[13px] text-ink-soft transition-colors duration-200 hover:border-ink-faint"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      {adding ? (
        <form
          action={onAdd}
          className="mb-4 space-y-2.5 rounded-card bg-white p-4 shadow-soft"
        >
          <p className="text-[15px]">새 반찬 추가</p>
          <input name="name" required placeholder="상품명" className={INPUT} />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              name="price"
              type="number"
              min={0}
              step={100}
              required
              placeholder="가격"
              className={INPUT}
            />
            <input
              name="today_stock"
              type="number"
              min={0}
              defaultValue={0}
              placeholder="오늘 재고"
              className={INPUT}
            />
          </div>
          <select name="category_id" required className={INPUT} defaultValue="">
            <option value="" disabled>
              카테고리 선택
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="h-12 flex-1 rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep"
            >
              추가하기
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-12 rounded-card border border-line px-5 text-[14px] text-ink-soft"
            >
              취소
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mb-4 h-12 w-full rounded-card border border-dashed border-line bg-white text-[14px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
        >
          + 새 반찬 추가
        </button>
      )}

      <div className="sticky top-0 z-20 -mx-5 mb-3 bg-canvas/92 px-5 pb-3 pt-2 backdrop-blur-md">
        <label className="relative block">
          <span className="sr-only">반찬 검색</span>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => patch({ query: event.target.value })}
            placeholder="반찬 이름으로 찾기"
            className="h-12 w-full rounded-pill border border-line bg-white px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus:outline-none"
          />
        </label>

        {/* 손님 화면과 같은 칩을 쓴다. 사장님이 두 화면을 오갈 때 다른 앱처럼
            느껴지면 안 된다. */}
        <div
          role="tablist"
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

        {/* 상태와 뱃지. 숫자를 함께 보여준다 — 사장님이 관리자에 들어오는 이유가
            "품절 몇 개지?" 이고, 그 숫자를 눌러 바로 그 목록으로 갈 수 있어야 한다.
            해당 상품이 없으면 눌러 봐야 빈 화면이라 아예 막는다. */}
        <div className="no-scrollbar -mx-5 mt-1 flex gap-1.5 overflow-x-auto px-5">
          <FilterChip
            tone="danger"
            active={filters.stockLevel === "out"}
            disabled={summary.soldOut === 0}
            count={summary.soldOut}
            onClick={() =>
              patch({ stockLevel: filters.stockLevel === "out" ? null : "out" })
            }
          >
            품절
          </FilterChip>
          <FilterChip
            tone="warn"
            active={filters.stockLevel === "low"}
            disabled={summary.low === 0}
            count={summary.low}
            onClick={() =>
              patch({ stockLevel: filters.stockLevel === "low" ? null : "low" })
            }
          >
            마감임박
          </FilterChip>
          <FilterChip
            active={filters.hiddenOnly}
            disabled={summary.hidden === 0}
            count={summary.hidden}
            onClick={() => patch({ hiddenOnly: !filters.hiddenOnly })}
          >
            숨김
          </FilterChip>

          <span aria-hidden className="my-[9px] w-px shrink-0 bg-line" />

          {BADGES.map((badge) => (
            <FilterChip
              key={badge.key}
              active={filters.badgeKey === badge.key}
              disabled={summary.badges[badge.key] === 0}
              count={summary.badges[badge.key]}
              onClick={() =>
                patch({
                  badgeKey: filters.badgeKey === badge.key ? null : badge.key,
                })
              }
            >
              {badge.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtering && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-card bg-white p-3 shadow-soft">
          <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-soft">
            {visible.length}가지 표시 중
            <span className="text-ink-faint"> · 순서 변경은 전체 목록에서만</span>
          </p>
          {visible.length > 0 && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => bulk(false)}
                className="h-9 rounded-pill border border-line px-3 text-[12.5px] text-ink-soft transition-colors duration-200 hover:border-danger hover:text-danger"
              >
                전부 숨기기
              </button>
              <button
                type="button"
                onClick={() => bulk(true)}
                className="h-9 rounded-pill border border-line px-3 text-[12.5px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
              >
                전부 판매중
              </button>
            </div>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-card bg-white px-6 py-16 text-center text-[14px] text-ink-soft shadow-soft">
          {order.length === 0
            ? "아직 등록된 반찬이 없습니다."
            : "조건에 맞는 반찬이 없어요."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((product) => {
            const index = order.findIndex((p) => p.id === product.id);
            return (
            <AdminRow
              key={product.id}
              product={product}
              categories={categories}
              onError={onError}
              onNotice={onNotice}
                onMove={(direction) => move(index, direction)}
                isFirst={index === 0}
                isLast={index === order.length - 1}
                canMove={filtering === false}
              />
            );
          })}
        </ul>
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-[420px] rounded-card px-4 py-3.5 text-[13.5px] leading-relaxed text-white shadow-lift"
          style={{ background: toast.tone === "error" ? "#c9302c" : "#2f3330" }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
