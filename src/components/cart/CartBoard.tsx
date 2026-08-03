"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ProductPhoto } from "@/components/shop/ProductPhoto";
import { clearCart, removeFromCart, setCartQuantity } from "@/lib/cart-actions";
import { clampQuantity, type CartIssue, type CartSummary } from "@/lib/cart";
import { formatPrice } from "@/lib/format";

const ISSUE_TEXT: Record<CartIssue, string> = {
  unavailable: "오늘은 판매하지 않아요",
  sold_out: "품절되었어요",
  insufficient: "수량이 부족해요",
};

interface CartBoardProps {
  cart: CartSummary;
}

export function CartBoard({ cart }: CartBoardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 2600);
    return () => clearTimeout(id);
  }, [error]);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error ?? "처리하지 못했어요.");
    });
  }

  const empty = cart.lines.length === 0 && cart.orphanIds.length === 0;

  if (empty) {
    return (
      <div className="pt-24 text-center">
        <p className="text-[15px]">장바구니가 비어 있어요</p>
        <p className="pt-2 text-[13.5px] leading-relaxed text-ink-soft">
          오늘 만든 반찬을 둘러보세요.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-12 items-center rounded-pill bg-olive px-6 text-[14px] text-white transition-colors duration-200 hover:bg-olive-deep"
        >
          반찬 보러가기
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-40">
      <ul className="space-y-2.5">
        {cart.lines.map((line) => {
          const blocked = line.issue !== null;
          const ceiling = clampQuantity(
            Number.MAX_SAFE_INTEGER,
            line.product.today_stock,
          );

          return (
            <li
              key={line.product.id}
              className={`rounded-card bg-white p-4 shadow-soft ${blocked ? "opacity-75" : ""}`}
            >
              <div className="flex gap-3.5">
                <Link
                  href={`/product/${line.product.id}`}
                  className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[12px]"
                >
                  <ProductPhoto
                    name={line.product.name}
                    photoPath={line.product.photo_path}
                    sizes="76px"
                  />
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/product/${line.product.id}`}
                        className="block truncate text-[15px]"
                      >
                        {line.product.name}
                      </Link>
                      <p className="pt-0.5 text-[12.5px] text-ink-faint">
                        {formatPrice(line.product.price)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => removeFromCart(line.product.id))}
                      className="shrink-0 text-[13px] text-ink-faint transition-colors duration-200 hover:text-danger"
                    >
                      삭제
                    </button>
                  </div>

                  {blocked && line.issue && (
                    <p className="pt-1.5 text-[12.5px] text-danger">
                      {ISSUE_TEXT[line.issue]}
                      {line.issue === "insufficient" &&
                        ` · ${line.available}개까지 가능`}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-2.5">
                    <div className="flex items-center gap-1 rounded-pill border border-line px-1">
                      <Step
                        label="수량 줄이기"
                        disabled={pending || line.quantity <= 1}
                        onClick={() =>
                          run(() =>
                            setCartQuantity(line.product.id, line.quantity - 1),
                          )
                        }
                      >
                        −
                      </Step>
                      <span className="min-w-[2rem] text-center text-[15px] tabular-nums">
                        {line.quantity}
                      </span>
                      <Step
                        label="수량 늘리기"
                        disabled={pending || line.quantity >= ceiling}
                        onClick={() =>
                          run(() =>
                            setCartQuantity(line.product.id, line.quantity + 1),
                          )
                        }
                      >
                        +
                      </Step>
                    </div>

                    <span className="text-[15px] tracking-tight">
                      {blocked ? "—" : formatPrice(line.lineTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}

        {cart.orphanIds.map((id) => (
          <li
            key={id}
            className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-[13.5px] text-ink-soft shadow-soft"
          >
            <span>지금은 주문할 수 없는 상품이에요</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeFromCart(id))}
              className="shrink-0 text-[13px] text-ink-faint transition-colors duration-200 hover:text-danger"
            >
              빼기
            </button>
          </li>
        ))}
      </ul>

      <div className="pt-4 text-center">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("장바구니를 비울까요?")) return;
            run(clearCart);
          }}
          className="h-10 rounded-pill px-3 text-[13px] text-ink-faint transition-colors duration-200 hover:text-ink-soft"
        >
          장바구니 비우기
        </button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
        <div className="mx-auto max-w-[560px]">
          {error && (
            <p role="alert" className="pb-2 text-[13px] text-danger">
              {error}
            </p>
          )}
          {cart.blockingIssues > 0 && (
            <p className="pb-2 text-[12.5px] text-[#a96f14]">
              주문할 수 없는 상품 {cart.blockingIssues}개를 먼저 정리해 주세요
            </p>
          )}

          <div className="flex items-center justify-between pb-2.5">
            <span className="text-[13.5px] text-ink-soft">주문 금액</span>
            <span className="text-[19px] tracking-tight">
              {formatPrice(cart.subtotal)}
            </span>
          </div>

          <button
            type="button"
            disabled={cart.blockingIssues > 0 || cart.subtotal <= 0}
            className="tap-target w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            주문서 작성하기
          </button>
          <p className="pt-2 text-center text-[11.5px] text-ink-faint">
            주문·결제 기능은 준비 중이에요
          </p>
        </div>
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
      className="grid h-11 w-11 place-items-center rounded-full text-[19px] leading-none text-ink transition-[background-color,transform] duration-150 hover:bg-olive-soft active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
