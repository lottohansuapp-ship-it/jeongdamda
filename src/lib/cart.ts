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

export interface ReorderPlan {
  /** 장바구니에 써 넣을 최종 수량. 이미 담긴 만큼보다 늘어나는 줄만 들어 있다. */
  rows: { product_id: string; quantity: number }[];
  /** 오늘 판매 안 함·품절이라 뺀 가짓수 */
  soldOut: number;
  /** 재고가 모자라 지난번보다 적게 담은 가짓수 */
  reduced: number;
}

/**
 * 지난 주문 다시 담기 계획.
 *
 * 예전에는 "오늘 판매함" 만 보고 품절(재고 0)까지 담았다. 그러면 장바구니가
 * "주문할 수 없는 상품을 먼저 정리해 주세요" 로 막히고, 단골은 품절마다 삭제를
 * 눌러야 했다. 재고가 금방 떨어지는 반찬가게라 단골이 가장 자주 겪는 막힘이었다.
 *
 * 재고는 여기서 잡지 않는다 — 결제 시작 때 DB 가 잡는다. 이건 담을 양을 정할 뿐이다.
 * 이미 담겨 있던 수량은 줄이지 않는다(손님이 직접 담은 것).
 *
 * @param stock 오늘 판매 중인 반찬의 남은 재고. 여기 없으면 오늘 판매 안 함.
 * @param already 지금 장바구니에 담긴 수량.
 */
export function planReorder(
  wanted: readonly { product_id: string; quantity: number }[],
  stock: ReadonlyMap<string, number>,
  already: ReadonlyMap<string, number>,
): ReorderPlan {
  const merged = new Map<string, number>();
  for (const row of wanted) {
    merged.set(row.product_id, (merged.get(row.product_id) ?? 0) + row.quantity);
  }

  const rows: ReorderPlan["rows"] = [];
  let soldOut = 0;
  let reduced = 0;

  for (const [productId, quantity] of merged) {
    const left = stock.get(productId) ?? 0;
    if (left <= 0) {
      soldOut += 1;
      continue;
    }
    const current = already.get(productId) ?? 0;
    const target = Math.min(MAX_PER_ITEM, current + quantity);
    const final = Math.max(current, Math.min(target, left));
    if (final < target) reduced += 1;
    if (final > current) rows.push({ product_id: productId, quantity: final });
  }

  return { rows, soldOut, reduced };
}

export function clampQuantity(value: number, stock: number): number {
  const ceiling = Math.min(MAX_PER_ITEM, Math.max(1, stock));
  return Math.min(Math.max(1, Math.round(value)), ceiling);
}
