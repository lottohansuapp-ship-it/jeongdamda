"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { StoreNotice } from "@/components/shop/StoreNotice";
import { placeOrder } from "@/lib/order-actions";
import { confirmMyPayment } from "@/lib/payment-actions";
import { PAY_ERROR_KEY } from "@/components/orders/PaymentFailNotice";
import { openPaymentWindow, orderNameFrom } from "@/lib/payments/open-window";
import { PORTONE_CHANNELS } from "@/lib/payments/config";
import {
  availableMethods,
  KCP_EXTRAS,
  pickMethod,
  type PaymentMethodKey,
} from "@/lib/payments/methods";
import {
  clearDraft,
  saveDraft,
  type CheckoutDraft,
} from "@/lib/checkout-draft-client";
import { checkDelivery, type DeliveryQuote, type OpenState } from "@/lib/store";
import { formatPrice } from "@/lib/format";
import { formatOrderTime } from "@/lib/orders";
import type { CartSummary } from "@/lib/cart";
import type { Address, DeliveryArea, Profile, StoreSettings, UserCoupon } from "@/types/database";

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
  /** 지금 배달 접수 시간인지. 매장이 열려 있어도 배달은 닫힐 수 있다 (0023). */
  deliveryOpen: OpenState;
  /** 손님이 지금 갖고 있는 쿠폰. 아직 안 쓰고 기한이 남은 것만 내려온다. */
  coupons: UserCoupon[];
  /** 서버가 쿠키에서 되살려 지금 상황에 맞춰준 초기값 */
  draft: CheckoutDraft;
  /**
   * 결제를 켤 수 있는 상태인가. 서버가 판단해서 내려준다 —
   * 브라우저는 서버 키가 있는지 볼 수 없고, 반쪽만 켜지면 손님 돈이 샌다.
   */
  paymentReady: boolean;
}

export function CheckoutBoard({
  cart,
  profile,
  addresses,
  settings,
  areas,
  slots,
  openState,
  deliveryOpen,
  coupons,
  draft,
  paymentReady,
}: CheckoutBoardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 계약한 수단만 나온다. 하나뿐이면 고를 것이 없으니 화면에 띄우지 않는다.
  const methods = useMemo(() => availableMethods(PORTONE_CHANNELS, KCP_EXTRAS), []);
  const [methodKey, setMethodKey] = useState<PaymentMethodKey | null>(null);
  const method = pickMethod(methods, methodKey);
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
        deliveryOpen,
      ),
    [settings, areas, address, cart.subtotal, deliveryOpen],
  );

  const isDelivery = fulfillment === "delivery";
  const fee = isDelivery ? quote.fee : 0;

  /*
    쿠폰. 화면의 계산은 **안내일 뿐**이고 실제 금액은 place_order 가 다시 낸다 (0025).
    그래도 여기서 같은 규칙으로 계산해야 손님이 결제 직전에 놀라지 않는다.

    할인은 반찬 값에서만 빼고 배달비는 안 깎는다. 반찬 값보다 많이 깎이지도 않는다.
  */
  const [couponId, setCouponId] = useState<string | null>(null);
  const picked = coupons.find((c) => c.id === couponId) ?? null;
  const usable = picked !== null && cart.subtotal >= picked.coupon.min_order;
  const discount = usable ? Math.min(picked.coupon.discount, cart.subtotal) : 0;

  const total = cart.subtotal + fee - discount;

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
    // 번호만 보낸다. 할인액은 서버가 다시 계산한다.
    formData.set("user_coupon_id", usable && picked ? picked.id : "");

    startTransition(async () => {
      const result = await placeOrder(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const { orderId, paymentId, total: amount } = result.data;
      clearDraft(); // 주문이 만들어졌으니 들고 있을 이유가 없다

      // 결제를 아직 켜지 않았으면 여기서 끝. 주문은 남고 화면이 안내한다.
      if (!paymentReady) {
        router.replace(`/orders/${orderId}`);
        return;
      }

      const paid = await openPaymentWindow({
        method,
        paymentId,
        amount,
        orderName: orderNameOf(cart),
        customerName: profile.name ?? "",
        customerPhone: profile.phone ?? "",
        shopUserId: profile.id,
        redirectUrl: `${window.location.origin}/orders/${orderId}`,
      });

      if (!paid.ok) {
        // 결제 실패·취소. 주문은 pending_payment 로 남았다가 10분 뒤 재고가 돌아간다.
        // 손님이 상황을 볼 수 있게 주문 화면으로 보낸다.
        // 이 화면은 곧 사라지므로 실패 이유를 주문 화면으로 넘긴다 (PaymentFailNotice)
        try {
          sessionStorage.setItem(PAY_ERROR_KEY(orderId), paid.error);
        } catch {
          // 저장이 막힌 브라우저 — 이유는 못 보여도 주문 화면으로는 간다
        }
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
    <div>
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
            className="mt-2 inline-flex text-[13px] text-clay-deep underline underline-offset-4"
          >
            장바구니에서 정리하기
          </Link>
        </div>
      )}

      <Section title="수령 방법">
        {/*
          배달 ↔ 픽업을 바꾸면 아래 섹션이 "배송지" ↔ "픽업 시간" 으로 통째로
          교체된다. 그런데 버튼의 aria-pressed 만 바뀌고 무엇이 달라졌는지는
          알리지 않았다. 눈으로 보는 손님은 바뀐 걸 보지만, 안 보이는 손님은
          다음에 무엇을 채워야 하는지 모른 채 아래로 내려가야 했다.
        */}
        <span role="status" className="sr-only">
          {isDelivery
            ? "배달로 바꿨어요. 배송지를 골라 주세요."
            : "픽업으로 바꿨어요. 픽업 시간을 골라 주세요."}
        </span>
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
                        <span className="mr-1.5 text-[12px] text-clay-deep">
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
              {/*
                이유를 반드시 붙인다. 영업 중인데도 슬롯이 빌 때가 있다 —
                마감까지 준비 시간이 안 남은 경우다 (마감 20시, 준비 30분이면
                19시 반부터 그렇다). 그때 "없어요" 만 뜨면 손님은 앱이 고장난
                줄 알고 나간다.
              */}
              {openState.reason
                ? ` ${CLOSED_TEXT[openState.reason]}.`
                : ` 오늘 픽업은 마감됐어요.${
                    settings.delivery_enabled
                      ? " 배달로는 주문하실 수 있어요."
                      : " 내일 다시 찾아 주세요."
                  }`}
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
                  className={`h-12 rounded-pill px-4 text-[14px] tabular-nums transition-colors duration-200 ${
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
          // 이름이 자리표시 글자뿐이라 스크린리더가 "문 앞에 놓아주세요" 로 읽었다.
          aria-label="요청사항"
          // 배달에만 예시를 둔다. 문 앞에 두는 것처럼 손님이 실제로 자주 부탁하는
          // 일이 있어서다. 픽업은 매장에서 직접 받아가므로 그런 부탁이 없고,
          // 없는 예시를 띄우면 오히려 뭘 써야 하나 헷갈린다.
          placeholder={
            isDelivery ? "문 앞에 놓아주세요" : "매장에 전할 말을 적어주세요"
          }
          className="w-full resize-none rounded-[12px] border border-line bg-canvas p-3 text-[14px] leading-relaxed outline-none transition-colors duration-200 placeholder:text-ink-faint focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
        />
      </Section>

      {coupons.length > 0 && (
        <Section title="쿠폰">
          <div className="space-y-2">
            {coupons.map((item) => {
              const short = cart.subtotal < item.coupon.min_order;
              const on = couponId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCouponId(on ? null : item.id)}
                  aria-pressed={on}
                  // 최소주문에 못 미쳐도 누를 수는 있게 둔다. 눌러 보고
                  // "얼마 더 담으면 된다" 를 읽는 편이 감춰 두는 것보다 낫다.
                  className={`tap-target flex w-full items-center justify-between gap-3 rounded-[12px] border px-4 text-left transition-colors duration-200 ${
                    on && !short
                      ? "border-olive bg-olive-soft"
                      : "border-line bg-canvas hover:border-ink-faint"
                  }`}
                >
                  <span className="py-2.5">
                    <span className="block text-[14.5px]">
                      {item.coupon.name} {formatPrice(item.coupon.discount)} 할인
                    </span>
                    <span className="block pt-0.5 text-[12px] text-ink-soft">
                      {short
                        ? `${formatPrice(item.coupon.min_order - cart.subtotal)} 더 담으면 쓸 수 있어요`
                        : `${formatOrderTime(item.expires_at)}까지`}
                    </span>
                  </span>
                  {on && !short && (
                    <span aria-hidden className="text-[15px] text-olive-deep">
                      &#10003;
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* 고를 것이 하나뿐이면 묻지 않는다. 어르신 손님에게 탭 하나를 더 요구하는
          것이고, 선택지가 하나인 선택지는 선택이 아니다. */}
      {paymentReady && methods.length > 1 && (
        <Section title="결제 수단">
          <div className="space-y-2">
            {methods.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMethodKey(option.key)}
                aria-pressed={method?.key === option.key}
                className={`tap-target flex w-full items-center justify-between gap-3 rounded-[12px] border px-4 text-left transition-colors duration-200 ${
                  method?.key === option.key
                    ? "border-olive bg-olive-soft"
                    : "border-line bg-canvas hover:border-ink-faint"
                }`}
              >
                <span className="py-2.5">
                  <span className="block text-[14.5px]">{option.label}</span>
                  <span className="block pt-0.5 text-[12px] text-ink-soft">
                    {option.hint}
                  </span>
                </span>
                {method?.key === option.key && (
                  <span aria-hidden className="text-[15px] text-olive-deep">
                    &#10003;
                  </span>
                )}
              </button>
            ))}
          </div>
        </Section>
      )}

      <section className="mb-2.5 rounded-card bg-white p-4 shadow-soft">
        <div className="flex items-baseline justify-between gap-3 pb-3">
          <h2 className="text-[13px] text-ink-faint">
            주문 상품 {cart.lines.length}개
          </h2>
          {/* 주문서에서 메뉴를 더 담고 싶을 때. 여기서 나가도 담아둔 것은 그대로 남는다. */}
          <Link
            href="/"
            className="inline-flex min-h-12 shrink-0 items-center text-[13px] text-clay-deep underline underline-offset-4"
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
          className="mt-1 inline-flex min-h-12 items-center text-[13px] text-ink-faint underline underline-offset-4"
        >
          수량 변경하기
        </Link>
      </section>

      {/* sticky — 바가 자기 높이만큼 자리를 차지해 마지막 줄이 가려지지 않는다 (CartBoard 참조). */}
      <div className="sticky bottom-0 z-40 -mx-5 mt-6 border-t border-line bg-white/95 px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 backdrop-blur-md">
        <div className="mx-auto max-w-[560px]">
          <dl className="space-y-1.5 pb-3 text-[13.5px]">
            <Row label="상품 금액" value={formatPrice(cart.subtotal)} />
            {isDelivery && (
              <Row label="배달비" value={fee === 0 ? "무료" : formatPrice(fee)} />
            )}
            {discount > 0 && (
              <Row
                label="쿠폰 할인"
                value={`-${formatPrice(discount)}`}
                tone="discount"
              />
            )}
            <div className="flex items-baseline justify-between border-t border-line pt-2.5">
              <dt className="text-[14px]">결제 금액</dt>
              <dd className="text-[20px] tabular-nums tracking-tight">
                {formatPrice(total)}
              </dd>
            </div>
          </dl>

          {/*
            막힌 이유는 반드시 읽혀야 한다. 예전에는 error 일 때만 role 을 줘서
            "픽업 시간을 선택해 주세요" 나 "3,000원 더 담으면 배달돼요" 같은
            **주문을 막고 있는 이유**가 스크린리더에 전혀 안내되지 않았다.
            오류는 alert(즉시), 안내는 status(하던 말이 끝난 뒤)로 나눈다.
          */}
          {(error || blocked) && (
            <p
              id="checkout-blocked"
              role={error ? "alert" : "status"}
              className={`pb-2.5 text-[13px] leading-relaxed ${
                error ? "text-danger" : "text-clay-deep"
              }`}
            >
              {error ?? blocked}
            </p>
          )}

          {/*
            disabled 를 쓰지 않는다. disabled 버튼은 탭 순서에서 빠져서,
            키보드로 훑는 손님은 결제 버튼이 있다는 것조차 모른 채 페이지
            끝에 닿는다. 주문을 못 한다는 것만 알고 이유는 모른 채 나가게 된다.
            aria-disabled 로 "지금은 못 누른다" 를 알리되 찾을 수는 있게 하고,
            describedby 로 이유를 버튼에 묶는다. 실제 방어는 핸들러에서 한다.
          */}
          <button
            type="button"
            aria-disabled={pending || blocked !== null}
            aria-describedby={blocked ? "checkout-blocked" : undefined}
            onClick={() => {
              if (pending || blocked !== null) return;
              submit();
            }}
            className={`tap-target w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 ${
              pending || blocked !== null
                ? "cursor-not-allowed opacity-40"
                : "hover:bg-olive-deep"
            }`}
          >
            {pending
              ? "주문 확인 중…"
              : `${formatPrice(total)} ${paymentReady ? "결제하기" : "주문하기"}`}
          </button>

          {!paymentReady && (
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
  return orderNameFrom(cart.lines.map((line) => line.product.name));
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
        className="mt-2 inline-flex text-[13px] text-clay-deep underline underline-offset-4"
      >
        {action}
      </Link>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "discount";
}) {
  // 깎이는 금액은 색으로 구분한다. 숫자만 보면 더해지는지 빼지는지 헷갈린다.
  const color = tone === "discount" ? "text-clay-deep" : "";
  return (
    <div className="flex items-baseline justify-between">
      <dt className={`text-ink-soft ${color}`}>{label}</dt>
      <dd className={`tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}
