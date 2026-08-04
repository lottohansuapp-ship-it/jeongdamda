import { normalize } from "./format.ts";
import { hasBadge } from "./badges.ts";
import { stockStatus, type StockLevel } from "./stock.ts";
import type { ProductWithCategory } from "@/types/database";

/**
 * 손님 화면과 관리자 화면이 **같은 필터**를 쓴다.
 *
 * 두 벌로 두면 언젠가 갈라진다. 사장님이 관리자에서 "추천"으로 걸러 본 목록과
 * 손님 화면의 추천 캐러셀이 다르면, 뭘 켠 건지 확인할 방법이 없어진다.
 *
 * badgeKey 하나로 통일한 이유도 같다. 예전에는 손님용 recommendedOnly 라는
 * 불리언이 따로 있었는데, 관리자에서 "오늘"이나 "인기"로도 거르려면
 * 그때마다 불리언을 하나씩 늘려야 했다.
 */
export interface ShopFilters {
  query: string;
  categorySlug: string | null;
  /** 뱃지 key 로 거르기 (recommend / today / best …). null 이면 전체 */
  badgeKey: string | null;
  hideSoldOut: boolean;
  /** 관리자 전용 — 재고 상태로 거르기 */
  stockLevel: StockLevel | null;
  /** 관리자 전용 — 손님에게 안 보이는 상품만 */
  hiddenOnly: boolean;
}

export const EMPTY_FILTERS: ShopFilters = {
  query: "",
  categorySlug: null,
  badgeKey: null,
  hideSoldOut: false,
  stockLevel: null,
  hiddenOnly: false,
};

/** 순수 함수로 둔다 — 서버 왕복 없이 즉시 반응하고, 테스트도 여기서 끝난다. */
export function filterProducts(
  products: readonly ProductWithCategory[],
  filters: ShopFilters,
): ProductWithCategory[] {
  const q = normalize(filters.query);

  return products.filter((product) => {
    if (filters.categorySlug && product.category.slug !== filters.categorySlug) {
      return false;
    }
    if (filters.badgeKey && !hasBadge(product.badges, filters.badgeKey)) {
      return false;
    }
    if (filters.hiddenOnly && product.today_available) return false;
    if (
      filters.stockLevel &&
      stockStatus(product.today_stock).level !== filters.stockLevel
    ) {
      return false;
    }
    if (filters.hideSoldOut && product.today_stock <= 0) return false;
    if (!q) return true;

    return (
      normalize(product.name).includes(q) ||
      normalize(product.description ?? "").includes(q) ||
      normalize(product.category.name).includes(q)
    );
  });
}

/** 필터가 하나라도 걸려 있는지. 화면이 "전체를 보고 있는가"를 판단한다. */
export function isFiltering(filters: ShopFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.categorySlug !== null ||
    filters.badgeKey !== null ||
    filters.stockLevel !== null ||
    filters.hiddenOnly ||
    filters.hideSoldOut
  );
}
