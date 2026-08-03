export const LOW_STOCK_THRESHOLD = 5;

export type StockLevel = "out" | "low" | "plenty";

export interface StockStatus {
  level: StockLevel;
  label: string;
  dot: string;
  /** 마감 임박 — 🔥 문구를 띄울지 */
  urgent: boolean;
}

/**
 * 재고 뱃지의 단일 진실. 카드·상세·관리자가 모두 이 함수를 부른다.
 * 복사해서 쓰면 반드시 어긋난다.
 */
export function stockStatus(stock: number): StockStatus {
  if (stock <= 0) {
    return { level: "out", label: "품절", dot: "🔴", urgent: false };
  }
  if (stock <= LOW_STOCK_THRESHOLD) {
    return { level: "low", label: "얼마 안 남음", dot: "🟡", urgent: true };
  }
  return { level: "plenty", label: "충분", dot: "🟢", urgent: false };
}
