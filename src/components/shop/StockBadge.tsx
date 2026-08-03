import { stockStatus } from "@/lib/stock";

const TONE = {
  out: "bg-danger/8 text-danger",
  low: "bg-warn/12 text-[#a96f14]",
  plenty: "bg-success/10 text-[#2f8449]",
} as const;

interface StockBadgeProps {
  stock: number;
  showCount?: boolean;
}

export function StockBadge({ stock, showCount = false }: StockBadgeProps) {
  const status = stockStatus(stock);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-1 text-[12px] leading-none ${TONE[status.level]}`}
    >
      <span aria-hidden>{status.dot}</span>
      {status.urgent ? "얼마 안 남았어요" : status.label}
      {showCount && status.level !== "out" && (
        <span className="opacity-70">· {stock}개</span>
      )}
    </span>
  );
}
