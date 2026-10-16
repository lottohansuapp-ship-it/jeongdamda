"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readReturn } from "@/components/ui/CartBarLink";
import { AddressForm, FIELD } from "./AddressForm";
import { Toast } from "@/components/ui/Toast";
import {
  deleteAddress,
  saveAddress,
  setDefaultAddress,
  updateProfile,
} from "@/lib/account";
import { signOut } from "@/lib/auth";
import { Wordmark } from "@/components/ui/Wordmark";
import { formatPrice } from "@/lib/format";
import { formatOrderTime } from "@/lib/orders";
import type { Address, Profile, UserCoupon } from "@/types/database";

interface AccountBoardProps {
  profile: Profile;
  addresses: Address[];
  /** 지금 쓸 수 있는 쿠폰. 받은 줄 모르면 없는 것과 같다. */
  coupons: UserCoupon[];
}

interface Toast {
  tone: "error" | "notice";
  message: string;
}

export function AccountBoard({
  profile,
  addresses,
  coupons,
}: AccountBoardProps) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const [editing, setEditing] = useState<Address | "new" | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  const notice = (message: string) => setToast({ tone: "notice", message });
  const fail = (message: string) => setToast({ tone: "error", message });

  async function onProfileSubmit(formData: FormData) {
    const result = await updateProfile(formData);
    // 주문서의 「받는 분 변경」 으로 왔으면 저장하고 바로 주문서로 돌려보낸다.
    if (result.ok && readReturn()) router.push("/checkout");
    else if (result.ok) notice("내 정보를 저장했어요");
    else fail(result.error);
  }

  async function onAddressSubmit(formData: FormData) {
    const result = await saveAddress(formData);
    if (result.ok) {
      setEditing(null);
      notice("배송지를 저장했어요");
    } else {
      fail(result.error);
    }
  }

  return (
    <div>
      <header className="flex items-start justify-between gap-3 pb-6 pt-10">
        <div>
          <Wordmark size="sm" />
          <h1 className="pt-2 text-[26px] leading-tight">내 정보</h1>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="h-12 rounded-pill border border-line bg-white px-4 text-[13px] text-ink-soft transition-colors duration-200 hover:border-ink-faint"
          >
            로그아웃
          </button>
        </form>
      </header>

      <section
        className="rounded-card bg-white p-5 shadow-soft"
        aria-labelledby="profile-heading"
      >
        <h2 id="profile-heading" className="pb-4 text-[16px]">
          기본 정보
        </h2>
        <form action={onProfileSubmit} className="space-y-2.5">
          <label className="block">
            <span className="block pb-1 text-[13px] text-ink-soft">이름</span>
            <input
              name="name"
              required
              defaultValue={profile.name ?? ""}
              className={FIELD}
              autoComplete="name"
            />
          </label>
          <label className="block">
            <span className="block pb-1 text-[13px] text-ink-soft">
              휴대폰 번호
            </span>
            <input
              name="phone"
              type="tel"
              required
              inputMode="numeric"
              defaultValue={profile.phone ?? ""}
              placeholder="01012345678"
              className={FIELD}
              autoComplete="tel"
            />
          </label>
          <button
            type="submit"
            className="mt-3 h-12 w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep"
          >
            저장
          </button>
        </form>
      </section>

      <section
        aria-labelledby="coupon-heading"
        className="mt-2.5 rounded-card bg-white p-5 shadow-soft"
      >
        <h2 id="coupon-heading" className="flex items-center gap-2 pb-4 text-[16px]">
          쿠폰
          {coupons.length > 0 && (
            /* clay 위 흰 글씨는 3.77:1 로 12px 에 모자란다. 한 단계 진한 것을 쓴다. */
            <span className="rounded-pill bg-clay-deep px-2 py-0.5 text-[12px] leading-none text-white">
              {coupons.length}
            </span>
          )}
        </h2>

        {coupons.length === 0 ? (
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            지금 쓸 수 있는 쿠폰이 없어요.
          </p>
        ) : (
          <ul className="space-y-2">
            {coupons.map((item) => (
              /*
                clay(주황)를 쿠폰 전용으로 쓴다. 토큰에 Accent 로 정의돼 있는데
                거의 안 쓰고 있어서 이 화면에서 유일한 색이 된다 —
                olive 는 버튼과 정상 안내가, danger 는 품절이, brand 빨강은
                상호가 이미 쓰고 있다.

                왼쪽 띠와 금액 크기로 위계를 만든다. 굵게 쓰지 않는다
                (위계는 크기·색·여백으로).
              */
              <li
                key={item.id}
                className="overflow-hidden rounded-[12px] border border-clay/25 border-l-[5px] border-l-clay bg-cream px-4 py-3.5"
              >
                <p className="flex items-baseline gap-1.5">
                  <span className="text-[22px] leading-none tabular-nums tracking-tight text-clay-deep">
                    {formatPrice(item.coupon.discount)}
                  </span>
                  <span className="text-[13px] text-clay-deep">할인</span>
                </p>
                <p className="pt-1.5 text-[13.5px] text-ink">
                  {item.coupon.name}
                </p>
                <p className="pt-0.5 text-[12.5px] leading-relaxed text-ink-soft">
                  {item.coupon.min_order > 0
                    ? `${formatPrice(item.coupon.min_order)} 이상 주문에 쓸 수 있어요 · `
                    : ""}
                  {formatOrderTime(item.expires_at)}까지
                </p>
              </li>
            ))}
          </ul>
        )}

        <p className="pt-3 text-[12px] leading-relaxed text-ink-faint">
          주문서에서 고르시면 결제 금액에서 빠집니다.
        </p>
      </section>

      <section className="pt-4" aria-labelledby="address-heading">
        <div className="flex items-center justify-between pb-3">
          <h2 id="address-heading" className="text-[16px]">
            배송지
          </h2>
          {editing === null && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="h-12 rounded-pill border border-line bg-white px-3.5 text-[13px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
            >
              + 추가
            </button>
          )}
        </div>

        {editing !== null && (
          <AddressForm
            address={editing === "new" ? null : editing}
            onSubmit={onAddressSubmit}
            onCancel={() => setEditing(null)}
            onError={fail}
          />
        )}

        {addresses.length === 0 && editing === null ? (
          <p className="rounded-card bg-white px-6 py-12 text-center text-[14px] leading-relaxed text-ink-soft shadow-soft">
            등록된 배송지가 없어요.
            <br />
            배달 주문하려면 주소를 추가해 주세요.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {addresses.map((address) => (
              <li
                key={address.id}
                className="rounded-card bg-white p-4 shadow-soft"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {address.label && (
                      <span className="text-[13px] text-ink">
                        {address.label}
                      </span>
                    )}
                    {address.is_default && (
                      <span className="rounded-pill bg-olive-soft px-2 py-0.5 text-[11px] leading-none text-olive-deep">
                        기본
                      </span>
                    )}
                  </div>
                  <p className="pt-1 text-[14px] leading-relaxed">
                    {address.address1}
                    {address.address2 ? ` ${address.address2}` : ""}
                  </p>
                  {address.postcode && (
                    <p className="pt-0.5 text-[12px] text-ink-faint">
                      ({address.postcode})
                    </p>
                  )}
                </div>

                <div className="flex gap-2 pt-3">
                  {!address.is_default && (
                    <SmallButton
                      onClick={async () => {
                        const result = await setDefaultAddress(address.id);
                        if (result.ok) notice("기본 배송지로 설정했어요");
                        else fail(result.error);
                      }}
                    >
                      기본으로
                    </SmallButton>
                  )}
                  <SmallButton onClick={() => setEditing(address)}>
                    수정
                  </SmallButton>
                  <SmallButton
                    tone="danger"
                    onClick={async () => {
                      if (!confirm("이 배송지를 삭제할까요?")) return;
                      const result = await deleteAddress(address.id);
                      if (result.ok) notice("배송지를 삭제했어요");
                      else fail(result.error);
                    }}
                  >
                    삭제
                  </SmallButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
}

function SmallButton({
  onClick,
  tone = "default",
  children,
}: {
  onClick: () => void;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-12 rounded-pill border border-line px-3 text-[13px] transition-colors duration-200 ${
        tone === "danger"
          ? "text-ink-faint hover:border-danger hover:text-danger"
          : "text-ink-soft hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}
