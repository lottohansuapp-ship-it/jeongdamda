"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

  const soldOut = !available || stock <= 0;
  const ceiling = clampQuantity(Number.MAX_SAFE_INTEGER, stock);

  function bump(delta: number) {
    setQuantity((current) => clampQuantity(current + delta, stock));
    setDone(false);
    setMessage(null);
  }

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await addToCart(productId, quantity);

      if (result.ok) {
        setDone(true);
        router.refresh();
        return;
      }

      // 로그인 안 한 손님은 담기를 누른 그 순간 로그인으로 보낸다
      if (result.error.includes("로그인")) {
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
            className="tap-target w-full cursor-not-allowed rounded-card bg-line text-[15px] text-ink-faint"
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

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-pill border border-line px-1">
            <Step
              label="수량 줄이기"
              onClick={() => bump(-1)}
              disabled={quantity <= 1}
            >
              −
            </Step>
            <span className="min-w-[2.25rem] text-center text-[16px] tabular-nums">
              {quantity}
            </span>
            <Step
              label="수량 늘리기"
              onClick={() => bump(1)}
              disabled={quantity >= ceiling}
            >
              +
            </Step>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="tap-target flex-1 rounded-card bg-olive px-4 text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-50"
          >
            {pending
              ? "담는 중…"
              : done
                ? "장바구니에 담겼어요"
                : `${formatPrice(price * quantity)} 담기`}
          </button>
        </div>

        {quantity >= ceiling && stock <= 5 && (
          <p className="pt-2 text-center text-[12.5px] text-[#a96f14]">
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
