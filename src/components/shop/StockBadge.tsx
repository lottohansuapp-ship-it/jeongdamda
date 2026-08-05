import { stockStatus, type StockLevel } from "@/lib/stock";

const TONE: Record<StockLevel, string> = {
  out: "bg-danger/8 text-danger-deep",
  low: "bg-warn/12 text-[#a96f14]",
  plenty: "bg-success/10 text-[#2f8449]",
};

interface StockBadgeProps {
  stock: number;
  showCount?: boolean;
}

export function StockBadge({ stock, showCount = false }: StockBadgeProps) {
  const status = stockStatus(stock);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-1 text-[12px] leading-none ${TONE[status.level]}`}
    >
      {/* 이모지를 쓰지 않는다 — 삼성·애플이 각자 다른 그림으로 그려 크기와 위치가 기기마다 달라진다.
          bg-current 면 점 색이 글자색을 그대로 따라간다. */}
      <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-current" />
      {status.label}
      {showCount && status.level !== "out" && (
        <span>{stock}개</span>
      )}
    </span>
  );
}
