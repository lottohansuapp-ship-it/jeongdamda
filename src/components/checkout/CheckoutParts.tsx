"use client";

/*
  주문서(CheckoutBoard)의 화면 조각들. 상태는 갖지 않고 받은 대로 그린다.
  주문서가 800줄에 닿아 떼어 냈다 — 상태·주문·결제 흐름은 CheckoutBoard 에 남는다.
*/

import { STORE_INFO } from "@/lib/store-info";
import { formatPrice } from "@/lib/format";
import { formatOrderTime } from "@/lib/orders";
import type { PaymentMethod, PaymentMethodKey } from "@/lib/payments/methods";
import type { Address, UserCoupon } from "@/types/database";

export const CLOSED_TEXT: Record<string, string> = {
  holiday: "오늘은 쉬는 날이에요",
  weekday_off: "오늘은 정기 휴무일이에요",
  before_open: "아직 영업 시작 전이에요",
  after_close: "오늘 영업이 끝났어요",
};

export function fullAddress(address: Address): string {
  return [address.address1, address.address2].filter(Boolean).join(" ");
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-2.5 rounded-card bg-white p-4 shadow-soft">
      <h2 className="pb-3 text-[14px] text-ink-soft">{title}</h2>
      {children}
    </section>
  );
}

export function Choice({
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
      <span className="block pt-0.5 text-[13px] text-ink-soft">{hint}</span>
    </button>
  );
}

export function AddAddressButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex h-12 items-center text-[13.5px] text-clay-deep underline underline-offset-4"
    >
      + 새 배송지 추가
    </button>
  );
}

export function Row({
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

/** 쿠폰·결제 수단처럼 하나를 고르는 큰 버튼. 고른 것은 올리브 테두리와 ✓. */
function OptionButton({
  on,
  onClick,
  label,
  hint,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`tap-target flex w-full items-center justify-between gap-3 rounded-[12px] border px-4 text-left transition-colors duration-200 ${
        on ? "border-olive bg-olive-soft" : "border-line bg-canvas hover:border-ink-faint"
      }`}
    >
      <span className="py-2.5">
        <span className="block text-[14.5px]">{label}</span>
        <span className="block pt-0.5 text-[13.5px] text-ink-soft">{hint}</span>
      </span>
      {on && (
        <span aria-hidden className="text-[15px] text-olive-deep">
          &#10003;
        </span>
      )}
    </button>
  );
}

export function CouponList({
  coupons,
  subtotal,
  pickedId,
  onPick,
}: {
  coupons: UserCoupon[];
  subtotal: number;
  pickedId: string | null;
  onPick: (id: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      {coupons.map((item) => {
        const short = subtotal < item.coupon.min_order;
        const on = pickedId === item.id;
        return (
          // 최소주문에 못 미쳐도 누를 수는 있게 둔다. 눌러 보고
          // "얼마 더 담으면 된다" 를 읽는 편이 감춰 두는 것보다 낫다.
          <OptionButton
            key={item.id}
            on={on && !short}
            onClick={() => onPick(on ? null : item.id)}
            label={`${item.coupon.name} ${formatPrice(item.coupon.discount)} 할인`}
            hint={
              short
                ? `${formatPrice(item.coupon.min_order - subtotal)} 더 담으면 쓸 수 있어요`
                : `${formatOrderTime(item.expires_at)}까지`
            }
          />
        );
      })}
    </div>
  );
}

export function MethodList({
  methods,
  pickedKey,
  onPick,
}: {
  methods: PaymentMethod[];
  pickedKey: PaymentMethodKey | undefined;
  onPick: (key: PaymentMethodKey) => void;
}) {
  return (
    <div className="space-y-2">
      {methods.map((option) => (
        <OptionButton
          key={option.key}
          on={pickedKey === option.key}
          onClick={() => onPick(option.key)}
          label={option.label}
          hint={option.hint}
        />
      ))}
    </div>
  );
}

export function PickupSlots({
  slots,
  slot,
  onPick,
  closedReason,
  deliveryEnabled,
  notice,
}: {
  slots: string[];
  slot: string;
  onPick: (value: string) => void;
  closedReason: string | null;
  deliveryEnabled: boolean;
  /** 고를 수 있는 시간이 줄어든 이유 (가상계좌 입금 기한 등). 있으면 위에 보인다. */
  notice?: string | null;
}) {
  return (
    <>
      {notice && (
        <p className="pb-3 text-[14px] leading-relaxed text-clay-deep">{notice}</p>
      )}
      {/* 안내가 이미 이유를 말했으면(가상계좌) 「오늘 픽업은 마감」 같은 틀린 말을 덧붙이지 않는다 */}
      {slots.length === 0 && notice ? null : slots.length === 0 ? (
        <p className="text-[13.5px] leading-relaxed text-ink-soft">
          지금은 고를 수 있는 픽업 시간이 없어요.
          {/*
            이유를 반드시 붙인다. 영업 중인데도 슬롯이 빌 때가 있다 —
            마감까지 준비 시간이 안 남은 경우다 (마감 20시, 준비 30분이면
            19시 반부터 그렇다). 그때 "없어요" 만 뜨면 손님은 앱이 고장난
            줄 알고 나간다.
          */}
          {closedReason
            ? ` ${CLOSED_TEXT[closedReason]}.`
            : ` 오늘 픽업은 마감됐어요.${
                deliveryEnabled ? " 배달로는 주문하실 수 있어요." : " 내일 다시 찾아 주세요."
              }`}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onPick(value)}
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
      {/* 찾으러 와야 하는데 가게 주소가 어디에도 없었다 */}
      <p className="pt-3.5 text-[14px] leading-relaxed text-ink-soft">
        찾으러 오실 곳 · {STORE_INFO.address}
      </p>
      <a
        href={`https://map.naver.com/p/search/${encodeURIComponent(STORE_INFO.address)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-12 items-center text-[14px] text-olive-deep underline underline-offset-4"
      >
        지도에서 보기
      </a>
    </>
  );
}
