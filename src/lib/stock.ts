export const LOW_STOCK_THRESHOLD = 5;

export type StockLevel = "out" | "low" | "plenty";

export interface StockStatus {
  level: StockLevel;
  /** 한 단어로. 카드가 좁아 긴 문장은 줄바꿈되거나 잘린다. */
  label: string;
}

/**
 * 재고 뱃지의 단일 진실. 카드·상세·관리자가 모두 이 함수를 부른다.
 * 복사해서 쓰면 반드시 어긋난다.
 *
 * 점은 이모지가 아니라 CSS 원으로 그린다 (StockBadge).
 * 🔴🟡🟢 는 삼성·애플·크롬이 각자 다른 그림으로 그려서 크기와 기준선이 기기마다 다르다.
 */
export function stockStatus(stock: number): StockStatus {
  if (stock <= 0) return { level: "out", label: "품절" };
  if (stock <= LOW_STOCK_THRESHOLD) return { level: "low", label: "소량" };
  return { level: "plenty", label: "충분" };
}
