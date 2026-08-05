"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProductPhoto } from "@/components/shop/ProductPhoto";
import { clearCart, removeFromCart, setCartQuantity } from "@/lib/cart-actions";
import {
  clampQuantity,
  summarizeCart,
  type CartIssue,
  type CartLine,
  type CartSummary,
} from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import type { StoreSettings } from "@/types/database";

const ISSUE_TEXT: Record<CartIssue, string> = {
  unavailable: "오늘은 판매하지 않아요",
  sold_out: "품절되었어요",
  insufficient: "수량이 부족해요",
};

interface CartBoardProps {
  cart: CartSummary;
  settings: StoreSettings | null;
}

/**
 * 배달 최소주문까지 얼마 남았는지. 배민·쿠팡이츠가 장바구니에서 하는 그 안내다.
 * 손님이 "왜 주문이 안 되지" 하고 헤매는 대신 얼마를 더 담으면 되는지 바로 알게 한다.
 * 판정 자체는 place_order 가 다시 한다 — 이건 안내다.
 */
function deliveryGap(
  settings: StoreSettings | null,
  subtotal: number,
): { short: number; minimum: number } | null {
  if (!settings?.delivery_enabled) return null;
  const minimum = settings.min_order_amount;
  if (minimum <= 0 || subtotal >= minimum) return null;
  return { short: minimum - subtotal, minimum };
}

/** summarizeCart 에 넣을 최소 형태. 화면에서 수량만 바꿔가며 다시 계산한다. */
type CartRow = { product: CartLine["product"]; quantity: number };

function toRows(cart: CartSummary): CartRow[] {
  return cart.lines.map(({ product, quantity }) => ({ product, quantity }));
}

export function CartBoard({ cart, settings }: CartBoardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * 수량은 화면에서 먼저 바꾸고 서버에 보낸다.
   *
   * 예전에는 +/- 한 번에 router.refresh() 로 장바구니 전체를 다시 받아 다시 그렸다.
   * 숫자 하나 바뀌는 데 왕복이 여러 번 붙어서 연타하면 눈에 띄게 밀렸다.
   * 금액은 summarizeCart() 로 여기서 다시 계산한다 — 서버가 쓰는 함수와 같은 함수다.
   * 물론 결제 금액의 근거는 아니다. 그건 place_order 가 다시 계산한다 (D21).
   */
  const [rows, setRows] = useState(() => toRows(cart));
  const [seen, setSeen] = useState(cart);
  if (seen !== cart) {
    setSeen(cart);
    setRows(toRows(cart));
  }

  const view = summarizeCart(rows, cart.orphanIds);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 2600);
    return () => clearTimeout(id);
  }, [error]);

  /** 화면을 먼저 바꾸고 서버에 보낸다. 실패하면 되돌린다. */
  async function run(
    next: CartRow[],
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    const previous = rows;
    setError(null);
    setPending(true);
    setRows(next);

    const result = await action();
    setPending(false);

    if (result.ok) {
      // 하단 탭 뱃지를 서버 값과 맞춘다. 화면은 이미 바뀌어 있어 기다림이 보이지 않는다.
      router.refresh();
    } else {
      setRows(previous);
      setError(result.error ?? "처리하지 못했어요.");
    }
  }

  function withQuantity(productId: string, quantity: number): CartRow[] {
    return rows.map((row) =>
      row.product.id === productId ? { ...row, quantity } : row,
    );
  }

  const gap = deliveryGap(settings, view.subtotal);
  const empty = view.lines.length === 0 && view.orphanIds.length === 0;

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
        {view.lines.map((line) => {
          const blocked = line.issue !== null;
          const ceiling = clampQuantity(
            Number.MAX_SAFE_INTEGER,
            line.product.today_stock,
          );

          return (
            <li
              key={line.product.id}
              className="rounded-card bg-white p-4 shadow-soft"
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
                      onClick={() =>
                        run(
                          rows.filter(
                            (row) => row.product.id !== line.product.id,
                          ),
                          () => removeFromCart(line.product.id),
                        )
                      }
                      className="-my-3.5 -mr-2 flex min-h-[48px] shrink-0 items-center px-2 text-[13px] text-ink-faint transition-colors duration-200 hover:text-danger"
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
                      {/* 연타를 막지 않는다 — 숫자는 이미 바뀌어 있고 저장만 뒤따른다 */}
                      <Step
                        label="수량 줄이기"
                        disabled={line.quantity <= 1}
                        onClick={() =>
                          run(
                            withQuantity(line.product.id, line.quantity - 1),
                            () =>
                              setCartQuantity(
                                line.product.id,
                                line.quantity - 1,
                              ),
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
                        disabled={line.quantity >= ceiling}
                        onClick={() =>
                          run(
                            withQuantity(line.product.id, line.quantity + 1),
                            () =>
                              setCartQuantity(
                                line.product.id,
                                line.quantity + 1,
                              ),
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

        {view.orphanIds.map((id) => (
          <li
            key={id}
            className="flex items-center justify-between gap-3 rounded-card bg-white p-4 text-[13.5px] text-ink-soft shadow-soft"
          >
            <span>지금은 주문할 수 없는 상품이에요</span>
            {/* orphan 은 상품 정보가 없어 화면에서 미리 지울 수 없다. 서버 응답을 기다린다. */}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(rows, () => removeFromCart(id))}
              className="-my-3.5 -mr-2 flex min-h-[48px] shrink-0 items-center px-2 text-[13px] text-ink-faint transition-colors duration-200 hover:text-danger"
            >
              빼기
            </button>
          </li>
        ))}
      </ul>

      {/* 배민·쿠팡이츠처럼 목록 바로 아래에 둔다. 여기가 "하나 더 담을까" 하는 자리다. */}
      <Link
        href="/"
        className="tap-target mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-line bg-white text-[14px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
      >
        <PlusIcon />
        메뉴 더 담기
      </Link>

      <div className="pt-4 text-center">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("장바구니를 비울까요?")) return;
            run([], clearCart);
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
          {view.blockingIssues > 0 && (
            <p className="pb-2 text-[12.5px] text-clay-deep">
              주문할 수 없는 상품 {view.blockingIssues}개를 먼저 정리해 주세요
            </p>
          )}

          {gap ? (
            <div className="pb-3">
              <div className="flex items-baseline justify-between pb-1.5">
                <span className="text-[13px]">
                  <strong className="font-normal text-clay-deep">
                    {formatPrice(gap.short)}
                  </strong>{" "}
                  더 담으면 배달돼요
                </span>
                <span className="text-[11.5px] text-ink-faint">
                  지금도 픽업은 가능해요
                </span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-pill bg-line"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={gap.minimum}
                aria-valuenow={view.subtotal}
                aria-label="배달 최소주문까지 남은 금액"
              >
                <div
                  className="h-full rounded-pill bg-olive transition-[width] duration-300"
                  style={{
                    width: `${Math.round((view.subtotal / gap.minimum) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            settings?.delivery_enabled &&
            view.subtotal > 0 && (
              <p className="pb-2 text-[12.5px] text-olive-deep">
                배달 주문할 수 있어요
                {settings.delivery_fee === 0 && " · 배달비 무료"}
              </p>
            )
          )}

          <div className="flex items-center justify-between pb-2.5">
            <span className="text-[13.5px] text-ink-soft">주문 금액</span>
            <span className="text-[19px] tracking-tight">
              {formatPrice(view.subtotal)}
            </span>
          </div>

          {/* 막힌 항목이 있으면 아예 못 넘어가게 한다. 주문서에서 되돌아오면 손님만 헛걸음한다.
              다만 disabled 로 두면 키보드로 훑는 손님은 버튼이 있다는 것도 모르고,
              왜 못 넘어가는지도 모른 채 끝난다. 이유를 버튼에 묶어 둔다. */}
          {view.blockingIssues > 0 || view.subtotal <= 0 ? (
            <>
              <p
                id="cart-blocked"
                role="status"
                className="pb-2.5 text-[13px] leading-relaxed text-clay-deep"
              >
                {view.subtotal <= 0
                  ? "담긴 반찬이 없어요."
                  : `주문할 수 없는 상품 ${view.blockingIssues}개를 먼저 정리해 주세요.`}
              </p>
              <button
                type="button"
                aria-disabled
                aria-describedby="cart-blocked"
                className="tap-target w-full cursor-not-allowed rounded-card bg-olive text-[15px] text-white opacity-40"
              >
                주문서 작성하기
              </button>
            </>
          ) : (
            <Link
              href="/checkout"
              className="tap-target flex w-full items-center justify-center rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep"
            >
              주문서 작성하기
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
    >
      <path d="M12 6v12M6 12h12" />
    </svg>
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
