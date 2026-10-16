"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { savePendingAdd, takePendingAdd } from "@/lib/pending-add";
import { clearFromList } from "@/components/ui/BackToList";
import { addToCart } from "@/lib/cart-actions";
import { clampQuantity } from "@/lib/cart";
import { formatPrice } from "@/lib/format";

interface AddToCartProps {
  productId: string;
  productName: string;
  price: number;
  stock: number;
  available: boolean;
}

export function AddToCart({
  productId,
  productName,
  price,
  stock,
  available,
}: AddToCartProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // 로그인하러 갔다가 돌아왔다 — 그때 누른 반찬을 이어서 담는다.
  // 예전엔 돌아와서 「담기」 를 한 번 더 눌러야 했다.
  useEffect(() => {
    const pending = takePendingAdd((item) => item.productId === productId);
    if (!pending) return;
    startTransition(async () => {
      const result = await addToCart(productId, pending.quantity).catch(() => ({
        ok: false as const,
        error: "담지 못했어요. 다시 눌러 주세요.",
      }));
      if (result.ok && pending.next) {
        router.push(pending.next); // 「바로 주문」 이었다 — 주문서로 이어 간다
      } else if (result.ok) {
        setDone(true);
        router.refresh();
      } else if (!result.error.includes("로그인")) {
        setMessage(result.error); // 그 사이 품절 등 — 조용히 안 담기면 담긴 줄 안다
      }
    });
  }, [productId, router]);

  const soldOut = !available || stock <= 0;
  const ceiling = clampQuantity(Number.MAX_SAFE_INTEGER, stock);

  function bump(delta: number) {
    setQuantity((current) => clampQuantity(current + delta, stock));
    setDone(false);
    setMessage(null);
  }

  /**
   * next 가 있으면 담은 뒤 그리로 보낸다 ("바로 결제").
   * 장바구니를 비우지 않는다 — 먼저 담아둔 것까지 함께 주문하는 게 손님이 기대하는 동작이다.
   */
  function submit(next?: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await addToCart(productId, quantity);

      if (result.ok) {
        if (next) {
          router.push(next);
          return;
        }
        setDone(true);
        router.refresh();
        return;
      }

      // 로그인 안 한 손님은 담기를 누른 그 순간 로그인으로 보낸다
      if (result.error.includes("로그인")) {
        // 로그인 뒤 이 화면으로 돌아와 고른 수량 그대로 자동으로 담는다 (아래 효과).
        savePendingAdd({ productId, quantity, ...(next ? { next } : {}) });
        clearFromList();
        router.push(
          `/login?next=${encodeURIComponent(`/product/${productId}`)}`,
        );
        return;
      }
      setMessage(result.error);
    });
  }

  if (soldOut) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <div className="mx-auto max-w-[720px]">
          <button
            type="button"
            disabled
            className="tap-target w-full cursor-not-allowed rounded-card border border-line bg-canvas text-[15px] text-ink-soft"
          >
            오늘은 품절되었어요
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
      <div className="mx-auto max-w-[720px]">
        {message && (
          <p role="alert" className="pb-2 text-[13px] text-danger">
            {message}
          </p>
        )}
        {/* 담은 뒤 다음 할 일. 상세에는 하단 탭이 없어서 예전엔 뒤로 → 목록 → 장바구니
            탭을 거쳐야 했다. */}
        {done && (
          <Link
            href="/cart"
            className="-mt-1 mb-1.5 flex min-h-12 items-center justify-between rounded-[12px] bg-olive-soft px-3.5 text-[14px] text-olive-deep transition-colors duration-200 hover:bg-olive-soft/70"
          >
            <span>{productName}을(를) 담았어요</span>
            <span className="shrink-0">장바구니 보기 →</span>
          </Link>
        )}

        {/* 두 줄로 나눈다. 수량 조절과 버튼 두 개를 한 줄에 넣으면
            320px(아이폰 SE 1세대)에서 버튼 글자가 잘린다. */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-pill border border-line px-1">
            <Step
              label="수량 줄이기"
              onClick={() => bump(-1)}
              disabled={quantity <= 1}
            >
              −
            </Step>
            <output
              aria-live="polite"
              className="min-w-[2.25rem] text-center text-[16px] tabular-nums"
            >
              {quantity}
            </output>
            <Step
              label="수량 늘리기"
              onClick={() => bump(1)}
              disabled={quantity >= ceiling}
            >
              +
            </Step>
          </div>

          <span className="ml-auto text-[18px] tabular-nums tracking-tight">
            {formatPrice(price * quantity)}
          </span>
        </div>

        <div className="flex gap-2 pt-2.5">
          <button
            type="button"
            onClick={() => submit()}
            disabled={pending}
            className="tap-target flex-1 rounded-card border border-olive text-[15px] text-olive-deep transition-colors duration-200 hover:bg-olive-soft disabled:opacity-50"
          >
            {pending ? "담는 중…" : done ? "담겼어요" : "담기"}
          </button>

          <button
            type="button"
            onClick={() => submit("/checkout")}
            disabled={pending}
            className="tap-target flex-[1.6] rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-50"
          >
            바로 주문
          </button>
        </div>

        {quantity >= ceiling && stock <= 5 && (
          <p className="pt-2 text-center text-[12.5px] text-clay-deep">
            {productName}은(는) 지금 {stock}개까지 담을 수 있어요
          </p>
        )}
      </div>
    </div>
  );
}

function Step({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="tap-target grid place-items-center rounded-full text-[20px] leading-none text-ink transition-[background-color,transform] duration-150 hover:bg-olive-soft active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
