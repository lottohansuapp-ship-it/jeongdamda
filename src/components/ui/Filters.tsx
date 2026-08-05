"use client";

/**
 * 필터 칩. **손님 화면과 관리자가 같은 것을 쓴다.**
 *
 * 전에는 각자 갖고 있어서, 손님 쪽만 새로 고쳤을 때 관리자는 옛 모양으로 남았다.
 * 사장님이 손님 화면을 보고 관리자로 넘어오면 다른 앱처럼 느껴진다.
 *
 * 두 층으로 나눈다.
 *   · FilterTab  — 무엇을 보고 있는지 정하는 자리. 고른 것만 진하게.
 *   · FilterChip — 그 위에 덧씌우는 조건. 더 작고, 안 골라도 테두리가 남는다.
 *
 * 모양만 다르게 하는 것보다 **무게까지** 다르게 해야 역할 차이가 읽힌다.
 * 누르는 자리는 둘 다 48px 를 지킨다 — 보이는 배경만 짧고 나머지는 여백이다.
 */
export function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className="group shrink-0 py-[7px]"
    >
      <span
        className={`block rounded-[10px] px-3.5 py-2 text-[14px] leading-none transition-colors duration-200 ${
          active
            ? "bg-ink text-white"
            : "text-ink-soft group-hover:bg-white group-hover:text-ink"
        }`}
      >
        {children}
      </span>
    </button>
  );
}

const ACTIVE = {
  neutral: "border-olive bg-olive-soft text-olive-deep",
  warn: "border-warn bg-warn/12 text-clay-deep",
  danger: "border-danger bg-danger/10 text-danger-deep",
} as const;

export function FilterChip({
  active,
  onClick,
  disabled = false,
  count,
  tone = "neutral",
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** 해당하는 상품이 없을 때. 눌러 봐야 빈 목록이라 아예 막는다. */
  disabled?: boolean;
  /** 몇 개인지. 사장님은 이 숫자를 보려고 관리자에 들어온다. */
  count?: number;
  tone?: keyof typeof ACTIVE;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="group shrink-0 py-[9px] disabled:opacity-40"
    >
      <span
        className={`flex items-center gap-1 rounded-pill border px-2.5 py-1.5 text-[12.5px] leading-none transition-colors duration-200 ${
          active
            ? ACTIVE[tone]
            : "border-line bg-white text-ink-faint group-hover:text-ink-soft"
        }`}
      >
        {children}
        {count !== undefined && (
          <span className="tabular-nums">{count}</span>
        )}
      </span>
    </button>
  );
}
