/**
 * 가게 상호. 간판을 그대로 옮긴 게 아니라 옮길 수 있는 것만 옮겼다.
 *
 * 간판 서체는 상용 폰트라 웹에 실을 수 없다. 대신 Pretendard 를 굵게 쓰고
 * 자간을 좁혀 간판의 묵직한 느낌에 맞췄다. 사실 이 가게를 알아보게 하는 건
 * 글꼴보다 옆의 **빨간 「반찬가게」 배지**여서, 그건 두 줄 배치까지 그대로 재현했다.
 *
 * 쉼표 뒤 여백도 간판을 따랐다 — "정,담따" 가 아니라 "정, 담따" 다.
 */
const SIZES = {
  sm: { name: "text-[19px]", badge: "text-[8px] px-1 py-0.5", gap: "gap-1.5" },
  md: { name: "text-[26px]", badge: "text-[9px] px-1.5 py-1", gap: "gap-2" },
  lg: { name: "text-[32px]", badge: "text-[11px] px-2 py-1.5", gap: "gap-2.5" },
} as const;

interface WordmarkProps {
  size?: keyof typeof SIZES;
  /** 제목으로 쓸 때. 한 화면에 h1 은 하나여야 한다. */
  as?: "h1" | "p" | "span";
  className?: string;
}

export function Wordmark({
  size = "md",
  as: Tag = "span",
  className = "",
}: WordmarkProps) {
  const style = SIZES[size];

  return (
    <Tag
      className={`inline-flex items-center ${style.gap} ${className}`}
      aria-label="정, 담따 반찬가게"
    >
      <span
        aria-hidden
        className={`${style.name} font-extrabold leading-none tracking-[-0.04em]`}
      >
        정, 담따
      </span>
      <span
        aria-hidden
        className={`${style.badge} shrink-0 rounded-[6px] bg-brand text-center font-semibold leading-[1.15] tracking-tight text-white`}
      >
        반찬
        <br />
        가게
      </span>
    </Tag>
  );
}
