"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { StoreNotice } from "@/components/shop/StoreNotice";
import { placeOrder } from "@/lib/order-actions";
import { confirmMyPayment } from "@/lib/payment-actions";
import {
  isPaymentConfigured,
  PORTONE_CHANNEL_KEY,
  PORTONE_STORE_ID,
} from "@/lib/payments/config";
import {
  clearDraft,
  saveDraft,
  type CheckoutDraft,
} from "@/lib/checkout-draft-client";
import { checkDelivery, type DeliveryQuote, type OpenState } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import type { CartSummary } from "@/lib/cart";
import type {
  Address,
  DeliveryArea,
  Profile,
  StoreSettings,
} from "@/types/database";

const CLOSED_TEXT: Record<string, string> = {
  holiday: "오늘은 쉬는 날이에요",
  weekday_off: "오늘은 정기 휴무일이에요",
  before_open: "아직 영업 시작 전이에요",
  after_close: "오늘 영업이 끝났어요",
};

interface CheckoutBoardProps {
  cart: CartSummary;
  profile: Profile;
  addresses: Address[];
  settings: StoreSettings;
  areas: DeliveryArea[];
  slots: string[];
  openState: OpenState;
  /** 서버가 쿠키에서 되살려 지금 상황에 맞춰준 초기값 */
  draft: CheckoutDraft;
}

export function CheckoutBoard({
  cart,
  profile,
  addresses,
  settings,
  areas,
  slots,
  openState,
  draft,
}: CheckoutBoardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 초기값은 서버가 정한다. 여기서 다시 고르면 하이드레이션이 어긋난다.
  const [fulfillment, setFulfillment] = useState(draft.fulfillment);
  const [addressId, setAddressId] = useState(draft.addressId);
  const [slot, setSlot] = useState(draft.slot);
  const [memo, setMemo] = useState(draft.memo);

  /** 고른 것이 바뀔 때마다 쿠키에 남긴다. "추가 주문"으로 나갔다 와도 그대로다. */
  function remember(changes: Partial<CheckoutDraft>) {
    saveDraft({ fulfillment, addressId, slot, memo, ...changes });
  }

  const address = addresses.find((item) => item.id === addressId) ?? null;

  // 배달비와 최소주문 판정은 store.ts 하나만 본다 — place_order 와 같은 규칙이다.
  const quote = useMemo(
    () =>
      checkDelivery(
        settings,
        areas,
        address ? fullAddress(address) : null,
        cart.subtotal,
      ),
    [settings, areas, address, cart.subtotal],
  );

  const isDelivery = fulfillment === "delivery";
  const fee = isDelivery ? quote.fee : 0;
  const total = cart.subtotal + fee;

  const blocked = resolveBlock({
    cart,
    openState,
    isDelivery,
    quote,
    slot,
    hasSlots: slots.length > 0,
  });

  function submit() {
    setError(null);
    const formData = new FormData();
    formData.set("fulfillment", fulfillment);
    formData.set("address_id", addressId);
    formData.set("pickup_slot", slot);
    formData.set("memo", memo);

    startTransition(async () => {
      const result = await placeOrder(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const { orderId, paymentId, total: amount } = result.data;
      clearDraft(); // 주문이 만들어졌으니 들고 있을 이유가 없다

      // 결제를 아직 켜지 않았으면 여기서 끝. 주문은 남고 화면이 안내한다.
      if (!isPaymentConfigured()) {
        router.replace(`/orders/${orderId}`);
        return;
      }

      const paid = await openPaymentWindow({
        paymentId,
        amount,
        orderName: orderNameOf(cart),
        customerName: profile.name ?? "",
        customerPhone: profile.phone ?? "",
        redirectUrl: `${window.location.origin}/orders/${orderId}`,
      });

      if (!paid.ok) {
        // 결제 실패·취소. 주문은 pending_payment 로 남았다가 10분 뒤 재고가 돌아간다.
        // 손님이 상황을 볼 수 있게 주문 화면으로 보낸다.
        setError(paid.error);
        router.replace(`/orders/${orderId}`);
        return;
      }

      // 서버가 포트원에 다시 물어 확정한다. 실패해도 웹훅이 결국 처리하므로
      // 손님을 막지 않는다 — 주문 화면이 몇 초 뒤 스스로 바뀐다.
      await confirmMyPayment(paymentId);
      router.replace(`/orders/${orderId}`);
    });
  }

  return (
    <div className="pb-48">
      {/* 결제 직전이 "오늘 배달이 늦어요" 같은 공지를 볼 마지막 자리다.
          settings 는 이미 받고 있어서 조회가 늘지 않는다. */}
      {settings.notice && (
        <div className="pb-2.5">
          <StoreNotice notice={settings.notice} />
        </div>
      )}

      {cart.blockingIssues > 0 && (
        <div className="mb-2.5 rounded-card bg-cream p-4">
          <p className="text-[13.5px] leading-relaxed">
            주문할 수 없는 상품 {cart.blockingIssues}개가 담겨 있어요.
          </p>
          <Link
            href="/cart"
            className="mt-2 inline-flex text-[13px] text-clay underline underline-offset-4"
          >
            장바구니에서 정리하기
          </Link>
        </div>
      )}

      <Section title="수령 방법">
        <div className="grid grid-cols-2 gap-2">
          <Choice
            on={isDelivery}
            disabled={!settings.delivery_enabled}
            onClick={() => {
              setFulfillment("delivery");
              remember({ fulfillment: "delivery" });
            }}
            label="배달"
            hint={settings.delivery_enabled ? "집 앞까지" : "지금은 안 돼요"}
          />
          <Choice
            on={!isDelivery}
            disabled={!settings.pickup_enabled}
            onClick={() => {
              setFulfillment("pickup");
              remember({ fulfillment: "pickup" });
            }}
            label="픽업"
            hint={
              settings.pickup_enabled ? "매장에서 찾아가기" : "지금은 안 돼요"
            }
          />
        </div>
      </Section>

      <Section title="받는 분">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px]">{profile.name}</p>
            <p className="pt-0.5 text-[13px] text-ink-faint">{profile.phone}</p>
          </div>
          <Link
            href="/account"
            className="shrink-0 text-[13px] text-ink-faint underline underline-offset-4"
          >
            변경
          </Link>
        </div>
      </Section>

      {isDelivery ? (
        <Section title="배송지">
          {addresses.length === 0 ? (
            <Empty
              text="등록된 배송지가 없어요"
              href="/account"
              action="배송지 등록하기"
            />
          ) : (
            <ul className="space-y-2">
              {addresses.map((item) => (
                <li key={item.id}>
                  <label
                    className={`flex cursor-pointer gap-3 rounded-[12px] border p-3 transition-colors duration-200 ${
                      item.id === addressId
                        ? "border-olive bg-olive-soft"
                        : "border-line"
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      className="mt-1 h-4 w-4 shrink-0 accent-olive"
                      checked={item.id === addressId}
                      onChange={() => {
                        setAddressId(item.id);
                        remember({ addressId: item.id });
                      }}
                    />
                    <span className="min-w-0 text-[13.5px] leading-relaxed">
                      {item.label && (
                        <span className="mr-1.5 text-[12px] text-clay">
                          {item.label}
                        </span>
                      )}
                      {fullAddress(item)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : (
        <Section title="픽업 시간">
          {slots.length === 0 ? (
            <p className="text-[13.5px] leading-relaxed text-ink-soft">
              지금은 고를 수 있는 픽업 시간이 없어요.
              {openState.reason && ` ${CLOSED_TEXT[openState.reason]}.`}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSlot(value);
                    remember({ slot: value });
                  }}
                  aria-pressed={value === slot}
                  className={`h-11 rounded-pill px-4 text-[14px] tabular-nums transition-colors duration-200 ${
                    value === slot
                      ? "bg-olive text-white"
                      : "border border-line text-ink-soft hover:bg-olive-soft"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section title="요청사항">
        <textarea
          value={memo}
          onChange={(event) => {
            setMemo(event.target.value);
            remember({ memo: event.target.value });
          }}
          maxLength={200}
          rows={2}
          placeholder={isDelivery ? "문 앞에 놓아주세요" : "덜 맵게 해주세요"}
          className="w-full resize-none rounded-[12px] border border-line bg-canvas p-3 text-[14px] leading-relaxed outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-olive"
        />
      </Section>

      <section className="mb-2.5 rounded-card bg-white p-4 shadow-soft">
        <div className="flex items-baseline justify-between gap-3 pb-3">
          <h2 className="text-[13px] text-ink-faint">
            주문 상품 {cart.lines.length}개
          </h2>
          {/* 주문서에서 메뉴를 더 담고 싶을 때. 여기서 나가도 담아둔 것은 그대로 남는다. */}
          <Link
            href="/"
            className="shrink-0 text-[13px] text-clay underline underline-offset-4"
          >
            추가 주문
          </Link>
        </div>

        <ul className="space-y-2">
          {cart.lines.map((line) => (
            <li
              key={line.product.id}
              className="flex items-baseline justify-between gap-3 text-[13.5px]"
            >
              <span className="min-w-0 truncate text-ink-soft">
                {line.product.name}
                <span className="pl-1.5 text-ink-faint">×{line.quantity}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {line.issue ? "—" : formatPrice(line.lineTotal)}
              </span>
            </li>
          ))}
        </ul>

        <Link
          href="/cart"
          className="mt-3 inline-flex text-[13px] text-ink-faint underline underline-offset-4"
        >
          수량 변경하기
        </Link>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 backdrop-blur-md">
        <div className="mx-auto max-w-[560px]">
          <dl className="space-y-1.5 pb-3 text-[13.5px]">
            <Row label="상품 금액" value={formatPrice(cart.subtotal)} />
            {isDelivery && (
              <Row label="배달비" value={fee === 0 ? "무료" : formatPrice(fee)} />
            )}
            <div className="flex items-baseline justify-between border-t border-line pt-2.5">
              <dt className="text-[14px]">결제 금액</dt>
              <dd className="text-[20px] tabular-nums tracking-tight">
                {formatPrice(total)}
              </dd>
            </div>
          </dl>

          {(error || blocked) && (
            <p
              role={error ? "alert" : undefined}
              className={`pb-2.5 text-[13px] leading-relaxed ${
                error ? "text-danger" : "text-[#a96f14]"
              }`}
            >
              {error ?? blocked}
            </p>
          )}

          <button
            type="button"
            disabled={pending || blocked !== null}
            onClick={submit}
            className="tap-target w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending
              ? "주문 확인 중…"
              : `${formatPrice(total)} ${isPaymentConfigured() ? "결제하기" : "주문하기"}`}
          </button>

          {!isPaymentConfigured() && (
            <p className="pt-2 text-center text-[11.5px] text-ink-faint">
              결제 연결 전이라 주문만 접수됩니다
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** 주문을 막아야 할 이유. 없으면 null. 같은 판단을 서버가 다시 한다. */
function resolveBlock({
  cart,
  openState,
  isDelivery,
  quote,
  slot,
  hasSlots,
}: {
  cart: CartSummary;
  openState: OpenState;
  isDelivery: boolean;
  quote: DeliveryQuote;
  slot: string;
  hasSlots: boolean;
}): string | null {
  if (!openState.open) {
    const reason = CLOSED_TEXT[openState.reason ?? ""] ?? "지금은 주문을 받지 않아요";
    return `${reason}.`;
  }
  if (cart.blockingIssues > 0) return "주문할 수 없는 상품을 먼저 정리해 주세요.";
  if (cart.subtotal <= 0) return "주문할 상품이 없어요.";
  if (isDelivery) return quote.reason;
  if (!hasSlots || !slot) return "픽업 시간을 선택해 주세요.";
  return null;
}

export function fullAddress(address: Address): string {
  return [address.address1, address.address2].filter(Boolean).join(" ");
}

/** 결제창과 카드 명세서에 찍히는 주문명. "김치찌개 외 2건" */
function orderNameOf(cart: CartSummary): string {
  const first = cart.lines[0]?.product.name ?? "반찬";
  const rest = cart.lines.length - 1;
  return rest > 0 ? `${first} 외 ${rest}건` : first;
}

/**
 * 포트원 결제창.
 *
 * SDK 는 결제가 켜져 있을 때만 불러온다. 꺼져 있으면 번들에 실리지 않는다.
 *
 * 모바일에서는 결제 앱으로 넘어갔다가 redirectUrl 로 돌아오기 때문에 이 함수가
 * 값을 돌려주지 못할 수도 있다. 그 경우는 웹훅이 처리하고, 주문 화면이
 * 스스로 갱신되면서 결제 완료로 바뀐다.
 */
async function openPaymentWindow(input: {
  paymentId: string;
  amount: number;
  orderName: string;
  customerName: string;
  customerPhone: string;
  redirectUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const PortOne = await import("@portone/browser-sdk/v2");

    const response = await PortOne.requestPayment({
      storeId: PORTONE_STORE_ID,
      channelKey: PORTONE_CHANNEL_KEY,
      paymentId: input.paymentId,
      orderName: input.orderName,
      totalAmount: input.amount,
      currency: "CURRENCY_KRW" as never,
      payMethod: "CARD" as never,
      customer: {
        fullName: input.customerName,
        phoneNumber: input.customerPhone,
      },
      redirectUrl: input.redirectUrl,
    });

    // code 가 있으면 실패다. 손님이 창을 닫은 경우도 여기로 온다.
    if (response?.code) {
      return { ok: false, error: response.message ?? "결제가 취소되었어요." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "결제창을 열지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-2.5 rounded-card bg-white p-4 shadow-soft">
      <h2 className="pb-3 text-[13px] text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

function Choice({
  on,
  disabled,
  onClick,
  label,
  hint,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-[12px] border px-3 py-3 text-left transition-colors duration-200 disabled:opacity-40 ${
        on ? "border-olive bg-olive-soft" : "border-line"
      }`}
    >
      <span className="block text-[15px]">{label}</span>
      <span className="block pt-0.5 text-[12px] text-ink-faint">{hint}</span>
    </button>
  );
}

function Empty({
  text,
  href,
  action,
}: {
  text: string;
  href: string;
  action: string;
}) {
  return (
    <div className="py-2">
      <p className="text-[13.5px] text-ink-soft">{text}</p>
      <Link
        href={href}
        className="mt-2 inline-flex text-[13px] text-clay underline underline-offset-4"
      >
        {action}
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
