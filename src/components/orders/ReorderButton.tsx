"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reorder } from "@/lib/cart-actions";

/**
 * 지난 주문 그대로 다시 담기.
 *
 * 반찬가게는 같은 걸 또 시키는 손님이 대부분이라, 이 버튼 하나가
 * 목록을 처음부터 다시 훑는 수고를 없앤다. 배민·쿠팡이츠가 지난 주문에
 * 재주문을 붙여 두는 이유이기도 하다.
 *
 * 주문 상세와 주문 목록이 같이 쓴다. 두 곳에 따로 두면 "몇 가지가 빠졌다"는
 * 안내처럼 놓치기 쉬운 처리가 한쪽에서만 맞게 된다.
 */
interface ReorderButtonProps {
  orderId: string;
  className: string;
  label: string;
}

export function ReorderButton({
  orderId,
  className,
  label,
}: ReorderButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{
    text: string;
    partial: boolean;
  } | null>(null);

  function again() {
    setNotice(null);
    startTransition(async () => {
      const result = await reorder(orderId);

      if (!result.ok) {
        setNotice({ text: result.error, partial: false });
        return;
      }

      /**
       * 일부만 담겼으면 장바구니로 곧장 보내지 않는다.
       *
       * 예전에는 안내를 띄우자마자 이동해서, 정작 "오늘은 없어서 빠졌다"는
       * 말을 손님이 볼 겨를이 없었다. 지난번과 다른 구성인 걸 받고 나서야
       * 알게 되는 건 반찬가게에서 제일 나쁜 경험이다.
       */
      if (result.data.skipped > 0) {
        setNotice({
          text: `${result.data.added}가지를 담았어요. ${result.data.skipped}가지는 오늘 없어서 빠졌습니다.`,
          partial: true,
        });
        return;
      }

      router.push("/cart");
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={again}
        className={className}
      >
        {pending ? "담는 중…" : label}
      </button>

      {notice && (
        <div
          role="status"
          className="mt-2 rounded-card bg-cream p-3 text-[13px] leading-relaxed"
        >
          {notice.text}
          {notice.partial && (
            <Link
              href="/cart"
              className="mt-1.5 block text-clay-deep underline underline-offset-4"
            >
              장바구니에서 확인하기
            </Link>
          )}
        </div>
      )}
    </>
  );
}
