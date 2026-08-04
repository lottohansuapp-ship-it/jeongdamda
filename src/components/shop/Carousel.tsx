"use client";

import { Children, useRef, useState } from "react";

/**
 * 가로로 넘겨 보는 카드 줄.
 *
 * 배민·요기요·쿠팡이츠를 보면 셋 다 모바일에 화살표를 달지 않는다. 엄지로 밀면 되고,
 * 화살표는 손가락에 가려 누르기도 어렵다. 대신 공통으로 하는 것이 둘 있다.
 *
 *   1. 다음 카드를 살짝 걸쳐 보여준다 (78vw). 넘길 수 있다는 걸 화살표 없이 알린다.
 *   2. 지금 몇 번째인지 표시한다.
 *
 * 그래서 점은 항상 띄우고, 화살표는 마우스가 있는 기기에만 띄운다.
 * 화면 폭이 아니라 포인터 종류로 가른다 — 768px 태블릿도 손가락으로 만진다.
 */
interface CarouselProps {
  children: React.ReactNode;
  /** 스크린리더가 읽을 이름 */
  label: string;
}

export function Carousel({ children, label }: CarouselProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const items = Children.toArray(children);
  const count = items.length;

  /**
   * 카드 하나만큼의 거리 (카드 폭 + 간격).
   * 78vw 와 gap 을 JS 에서 다시 계산하면 CSS 를 고칠 때마다 어긋난다. DOM 에서 읽는다.
   */
  function step(): number {
    const first = railRef.current?.firstElementChild as HTMLElement | null;
    if (!first) return 1;

    const second = first.nextElementSibling as HTMLElement | null;
    return second
      ? second.offsetLeft - first.offsetLeft
      : first.offsetWidth || 1;
  }

  function handleScroll() {
    const rail = railRef.current;
    if (!rail) return;

    const index = Math.round(rail.scrollLeft / step());
    // 같은 값이면 React 가 알아서 넘어간다. 스크롤마다 다시 그리지 않는다.
    setActive(Math.max(0, Math.min(count - 1, index)));
  }

  function goTo(index: number) {
    const rail = railRef.current;
    if (!rail) return;

    const next = Math.max(0, Math.min(count - 1, index));
    // 부드럽게 움직인다. 모션을 끈 손님에게는 globals.css 가 즉시 이동으로 바꾼다.
    rail.scrollTo({ left: next * step(), behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={railRef}
        onScroll={handleScroll}
        aria-label={label}
        className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-2"
      >
        {items.map((item, index) => (
          <div
            key={index}
            /**
             * 34vw — 2개 반이 보이는 폭이다. 390px 화면에서
             * 2.5w + 간격 2×10 = 350(좌우 여백 뺀 폭) → w ≈ 132px.
             * 320px 에서는 34vw 가 109px 라 너무 좁아 min-w 로 받치고,
             * 넓은 화면에서는 카드가 커지지 않게 max-w 로 잘라 준다.
             */
            className="w-[34vw] min-w-[120px] max-w-[200px] shrink-0 snap-start"
          >
            {item}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <Arrow
            side="left"
            disabled={active === 0}
            onClick={() => goTo(active - 1)}
          />
          <Arrow
            side="right"
            disabled={active === count - 1}
            onClick={() => goTo(active + 1)}
          />

          <div className="flex justify-center gap-1.5 pt-3">
            {items.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`${index + 1}번째 반찬 보기`}
                aria-current={index === active}
                // 점은 작아도 누르는 자리는 넓게. 음수 마진 + 패딩으로 만든다.
                className="group -m-1.5 p-1.5"
              >
                <span
                  className={`block h-1.5 rounded-pill transition-[width,background-color] duration-300 ${
                    index === active
                      ? "w-5 bg-olive"
                      : "w-1.5 bg-line group-hover:bg-ink-faint"
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 마우스가 있는 기기에만 보인다. 터치 기기에서는 아예 그려지지 않는다. */
function Arrow({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "이전 반찬" : "다음 반찬"}
      className={`absolute top-[31%] hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-ink shadow-lift transition-opacity duration-200 disabled:pointer-events-none disabled:opacity-0 [@media(hover:hover)and(pointer:fine)]:grid ${
        side === "left" ? "-left-1" : "-right-1"
      }`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d={side === "left" ? "M14.5 5 8 12l6.5 7" : "M9.5 5 16 12l-6.5 7"}
        />
      </svg>
    </button>
  );
}
