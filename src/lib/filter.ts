import { normalize } from "./format.ts";
import { hasBadge, RECOMMEND_KEY } from "./badges.ts";
import type { ProductWithCategory } from "@/types/database";

export interface ShopFilters {
  query: string;
  categorySlug: string | null;
  recommendedOnly: boolean;
  hideSoldOut: boolean;
}

export const EMPTY_FILTERS: ShopFilters = {
  query: "",
  categorySlug: null,
  recommendedOnly: false,
  hideSoldOut: false,
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
    if (filters.recommendedOnly && !hasBadge(product.badges, RECOMMEND_KEY)) {
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
