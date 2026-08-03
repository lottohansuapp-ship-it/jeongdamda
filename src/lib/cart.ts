import type { ProductWithCategory } from "@/types/database";

/** 장바구니에 담긴 상품이 지금 주문 가능한 상태인지. null 이면 문제 없음. */
export type CartIssue = "unavailable" | "sold_out" | "insufficient";

export interface CartLine {
  product: ProductWithCategory;
  quantity: number;
  lineTotal: number;
  issue: CartIssue | null;
  /** insufficient 일 때 지금 담을 수 있는 최대 수량 */
  available: number;
}

export interface CartSummary {
  lines: CartLine[];
  subtotal: number;
  /** 담긴 개수 합계 — 하단 탭 뱃지에 쓴다 */
  itemCount: number;
  blockingIssues: number;
  /**
   * 상품 정보를 못 읽은 줄의 product_id.
   * 사장님이 판매를 끄면 RLS 가 손님에게서 그 상품을 감춘다. 줄을 조용히 지우면
   * 손님은 왜 없어졌는지 모른다. 이름 없이라도 남겨서 직접 빼게 한다.
   */
  orphanIds: string[];
}

export const MAX_PER_ITEM = 99;

export function lineIssue(
  product: ProductWithCategory,
  quantity: number,
): CartIssue | null {
  if (!product.today_available) return "unavailable";
  if (product.today_stock <= 0) return "sold_out";
  if (quantity > product.today_stock) return "insufficient";
  return null;
}

/**
 * 화면에 보이는 금액을 만든다. 결제 금액의 근거는 아니다 —
 * 실제 금액과 재고는 place_order() 가 서버에서 다시 계산한다 (D10).
 */
export function summarizeCart(
  rows: readonly { product: ProductWithCategory; quantity: number }[],
  orphanIds: readonly string[] = [],
): CartSummary {
  const lines = rows.map(({ product, quantity }) => {
    const issue = lineIssue(product, quantity);
    // 살 수 없는 줄은 합계에 넣지 않는다. 넣으면 손님이 낼 금액을 잘못 안다.
    const billable = issue === null ? quantity : 0;

    return {
      product,
      quantity,
      lineTotal: product.price * billable,
      issue,
      available: Math.max(0, product.today_stock),
    };
  });

  return {
    lines,
    subtotal: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    blockingIssues:
      lines.filter((line) => line.issue !== null).length + orphanIds.length,
    orphanIds: [...orphanIds],
  };
}

export const EMPTY_CART: CartSummary = {
  lines: [],
  subtotal: 0,
  itemCount: 0,
  blockingIssues: 0,
  orphanIds: [],
};

export function clampQuantity(value: number, stock: number): number {
  const ceiling = Math.min(MAX_PER_ITEM, Math.max(1, stock));
  return Math.min(Math.max(1, Math.round(value)), ceiling);
}
