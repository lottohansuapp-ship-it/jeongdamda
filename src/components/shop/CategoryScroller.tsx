"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 가로로 미는 카테고리 줄.
 *
 * 한 줄로 고정한다(nowrap). 접으면 대체 폰트 → Pretendard 로 바뀌는 순간 두 줄 → 한 줄이 되며
 * 아래 목록이 44px 튀었다(CLS 0.195). 넘치는 만큼은 밀어서 본다.
 *
 * 2026-11 사장님이 「국·찌개」「젓갈·장아찌」 처럼 카테고리를 늘리자 휴대폰에서 뒤쪽이 화면 밖으로 나갔다.
 * 스크롤바를 숨겨 둬서 밀 수 있다는 게 안 보였다. 그래서 더 있는 쪽에만 화살표를 띄운다 —
 * 누르면 그쪽으로 넘어가고, 다 보이는 화면(PC)에서는 아무것도 안 뜬다.
 */
export function CategoryScroller({
  activeKey,
  itemCount,
  children,
}: {
  /** 고른 카테고리. 바뀌면 그 칸이 화면 안에 들어오게 옮긴다(저장된 선택을 되살릴 때도). */
  activeKey: string | null;
  /** 카테고리 수가 바뀌면 넘치는지 다시 잰다. */
  itemCount: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft < max - 4;
      setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // 칸마다도 본다 — 폰트가 늦게 도착하면 줄 폭은 그대로인데 안쪽 글자 폭만 바뀐다.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [itemCount]);

  /*
    처음 들어왔을 때 줄을 한 번 살짝 밀었다 돌려놓는다. 화살표만으로는 "누르는 것" 으로만 읽히고
    "밀 수 있다" 는 안 읽힌다(손님 대부분이 어르신). 앱을 열 때 한 번만, 움직임 줄이기를 켠 분은 안 한다.
    scrollLeft 가 아니라 transform 으로 움직인다 — 고른 카테고리로 옮기는 스크롤과 부딪히지 않는다.
  */
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth - el.clientWidth < 8 || motion() === "auto") return;
    try {
      if (sessionStorage.getItem(NUDGE_KEY)) return;
    } catch {
      return;
    }
    const nudge = el.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-36px)" }, { transform: "translateX(0)" }],
      { duration: 1000, delay: 700, easing: "ease-in-out" },
    );
    nudge.onfinish = () => {
      try {
        sessionStorage.setItem(NUDGE_KEY, "1");
      } catch {}
    };
    return () => nudge.cancel();
  }, []);

  useEffect(() => {
    const el = ref.current;
    const chip = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!el || !chip) return;
    const box = el.getBoundingClientRect();
    const at = chip.getBoundingClientRect();
    const room = 48; // 화살표 자리만큼 비켜 둔다
    const shift =
      at.left < box.left + room
        ? at.left - box.left - room
        : at.right > box.right - room
          ? at.right - box.right + room
          : 0;
    if (shift !== 0) el.scrollBy({ left: shift, behavior: motion() });
  }, [activeKey]);

  function page(direction: 1 | -1) {
    const el = ref.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.6, behavior: motion() });
  }

  return (
    <div className="relative -mx-5 mt-2.5">
      <div
        ref={ref}
        aria-label="카테고리"
        className="no-scrollbar flex flex-nowrap gap-x-0.5 overflow-x-auto px-5"
      >
        {children}
      </div>
      {/* 손가락으로 밀어도 되므로 화면 읽기·키보드에는 숨긴다(칸은 Tab 으로 다 지나간다). */}
      <EdgeArrow side="left" shown={more.left} onClick={() => page(-1)} />
      <EdgeArrow side="right" shown={more.right} onClick={() => page(1)} />
    </div>
  );
}

function EdgeArrow({
  side,
  shown,
  onClick,
}: {
  side: "left" | "right";
  shown: boolean;
  onClick: () => void;
}) {
  const right = side === "right";
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      className={`absolute inset-y-0 flex w-14 items-center transition-opacity duration-200 ${
        right
          ? "right-0 justify-end bg-linear-to-l pr-2"
          : "left-0 justify-start bg-linear-to-r pl-2"
      } from-canvas from-45% to-transparent ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full border border-line bg-white text-ink shadow-soft">
        <svg viewBox="0 0 16 16" className={`h-4 w-4 ${right ? "" : "rotate-180"}`} fill="none">
          <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
  );
}

const NUDGE_KEY = "jeongdamda-category-nudge";

function motion(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
