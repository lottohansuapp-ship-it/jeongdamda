"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addToCart } from "@/lib/cart-actions";

/**
 * 목록에서 바로 담기. 상세로 들어갔다 나오지 않아도 되게 한다.
 *
 * 카드 전체가 <Link> 라서 이 버튼은 그 바깥에 겹쳐 둔다.
 * 그래도 터치가 링크로 새지 않도록 preventDefault 를 건다.
 */
export function QuickAdd({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");

  useEffect(() => {
    if (state !== "done") return;
    const id = setTimeout(() => setState("idle"), 1400);
    return () => clearTimeout(id);
  }, [state]);

  async function add(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (state === "sending") return;

    setState("sending");
    const result = await addToCart(productId, 1);

    if (result.ok) {
      setState("done");
      router.refresh(); // 하단 탭 뱃지
      return;
    }

    setState("idle");
    if (result.error.includes("로그인")) {
      router.push(`/login?next=${encodeURIComponent(`/product/${productId}`)}`);
    }
  }

  return (
    <button
      type="button"
      onClick={add}
      aria-label={`${productName} 장바구니에 담기`}
      className={`grid h-11 w-11 place-items-center rounded-full shadow-lift transition-[background-color,transform] duration-200 active:scale-90 ${
        state === "done" ? "bg-olive-deep text-white" : "bg-white/95 text-ink"
      }`}
    >
      {state === "done" ? <CheckIcon /> : <PlusIcon />}
    </button>
  );
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function PlusIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" {...STROKE}>
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" {...STROKE}>
      <path d="m5.5 12.5 4 4 9-9" />
    </svg>
  );
}
