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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "done") return;
    const id = setTimeout(() => setState("idle"), 1400);
    return () => clearTimeout(id);
  }, [state]);

  // 오류는 읽을 시간을 넉넉히 준다. 담기 성공 표시(1.4초)와 달리
  // 이건 손님이 무엇을 해야 할지 판단해야 하는 내용이다.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(id);
  }, [error]);

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
      return;
    }

    // 예전에는 여기서 그냥 끝났다. 지하철에서 잠깐 끊긴 손님은 버튼이
    // 눌렸다 돌아오는 것만 보고 왜 안 담기는지 몰라 계속 눌렀다.
    setError(result.error);
  }

  return (
    <>
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

      {/* 담겼다는 걸 소리로도 알린다. 아이콘만 바뀌면 눈으로 보는 손님만 알 수 있고,
          안 들리면 담겼는지 몰라 한 번 더 눌러 두 개가 담긴다. */}
      <span role="status" className="sr-only">
        {state === "done" ? `${productName} 1개를 담았어요` : ""}
      </span>

      {error && (
        <p
          role="alert"
          className="absolute inset-x-3.5 bottom-2 z-20 rounded-[10px] bg-danger px-2.5 py-1.5 text-[12px] leading-snug text-white"
        >
          {error}
        </p>
      )}
    </>
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
