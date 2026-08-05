"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteAddress,
  saveAddress,
  setDefaultAddress,
  updateProfile,
} from "@/lib/account";
import { signOut } from "@/lib/auth";
import { Wordmark } from "@/components/ui/Wordmark";
import type { Address, Profile } from "@/types/database";

const POSTCODE_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

const FIELD =
  "h-12 w-full rounded-card border border-line bg-canvas px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive";

interface DaumPostcodeResult {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName: string;
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: DaumPostcodeResult) => void;
      }) => { open: () => void };
    };
  }
}

/** 클릭할 때만 불러온다. 주소를 안 만지는 손님에게 스크립트를 물릴 이유가 없다. */
function loadPostcodeScript(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${POSTCODE_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load failed")));
      return;
    }

    const script = document.createElement("script");
    script.src = POSTCODE_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("load failed"));
    document.head.appendChild(script);
  });
}

interface AccountBoardProps {
  profile: Profile;
  addresses: Address[];
}

interface Toast {
  tone: "error" | "notice";
  message: string;
}

export function AccountBoard({ profile, addresses }: AccountBoardProps) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [editing, setEditing] = useState<Address | "new" | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const notice = (message: string) => setToast({ tone: "notice", message });
  const fail = (message: string) => setToast({ tone: "error", message });

  async function onProfileSubmit(formData: FormData) {
    const result = await updateProfile(formData);
    if (result.ok) notice("내 정보를 저장했어요");
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
            className="h-11 rounded-pill border border-line bg-white px-4 text-[13px] text-ink-soft transition-colors duration-200 hover:border-ink-faint"
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

      <section className="pt-4" aria-labelledby="address-heading">
        <div className="flex items-center justify-between pb-3">
          <h2 id="address-heading" className="text-[16px]">
            배송지
          </h2>
          {editing === null && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="h-10 rounded-pill border border-line bg-white px-3.5 text-[13px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
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

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-[420px] rounded-card px-4 py-3.5 text-[13.5px] leading-relaxed text-white shadow-lift"
          style={{ background: toast.tone === "error" ? "#c9302c" : "#2f3330" }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

interface AddressFormProps {
  address: Address | null;
  onSubmit: (formData: FormData) => void | Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}

function AddressForm({
  address,
  onSubmit,
  onCancel,
  onError,
}: AddressFormProps) {
  const [postcode, setPostcode] = useState(address?.postcode ?? "");
  const [address1, setAddress1] = useState(address?.address1 ?? "");
  const detailRef = useRef<HTMLInputElement>(null);

  async function search() {
    try {
      await loadPostcodeScript();
    } catch {
      onError("주소 검색을 불러오지 못했어요. 네트워크를 확인해 주세요.");
      return;
    }

    const Postcode = window.daum?.Postcode;
    if (!Postcode) {
      onError("주소 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }

    new Postcode({
      oncomplete: (data) => {
        const base = data.roadAddress || data.jibunAddress;
        setPostcode(data.zonecode);
        setAddress1(data.buildingName ? `${base} (${data.buildingName})` : base);
        detailRef.current?.focus();
      },
    }).open();
  }

  return (
    <form
      action={onSubmit}
      className="mb-3 space-y-2.5 rounded-card bg-white p-4 shadow-soft"
    >
      {address && <input type="hidden" name="id" value={address.id} />}
      <input type="hidden" name="postcode" value={postcode} />
      <input type="hidden" name="address1" value={address1} />

      <p className="text-[15px]">{address ? "배송지 수정" : "새 배송지"}</p>

      <div>
        <span className="block pb-1 text-[13px] text-ink-soft">
          주소 <span className="text-danger">*</span> 검색으로만 입력할 수 있어요
        </span>
        <button
          type="button"
          onClick={search}
          className={`flex h-12 w-full items-center justify-between rounded-card border bg-canvas px-4 text-left text-[14px] transition-colors duration-200 hover:border-olive ${
            address1 ? "border-line" : "border-clay/40"
          }`}
        >
          <span className={address1 ? "text-ink" : "text-ink-faint"}>
            {address1 || "주소 검색하기"}
          </span>
          <span className="shrink-0 text-[13px] text-olive-deep">
            {address1 ? "다시 찾기" : "검색"}
          </span>
        </button>
      </div>

      <label className="block">
        <span className="sr-only">상세주소</span>
        <input
          ref={detailRef}
          name="address2"
          defaultValue={address?.address2 ?? ""}
          placeholder="상세주소 (동/호수)"
          disabled={!address1}
          className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-45`}
        />
      </label>

      <label className="block">
        <span className="sr-only">별칭</span>
        <input
          name="label"
          defaultValue={address?.label ?? ""}
          placeholder="별칭 (집, 회사)"
          className={FIELD}
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2.5 py-1">
        <input
          type="checkbox"
          name="is_default"
          defaultChecked={address?.is_default ?? false}
          className="h-5 w-5 accent-olive"
        />
        <span className="text-[14px] text-ink-soft">기본 배송지로 설정</span>
      </label>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!address1}
          className="h-12 flex-1 rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          {address1 ? "저장" : "주소를 먼저 검색해 주세요"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-12 rounded-card border border-line px-5 text-[14px] text-ink-soft"
        >
          취소
        </button>
      </div>
    </form>
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
      className={`h-9 rounded-pill border border-line px-3 text-[13px] transition-colors duration-200 ${
        tone === "danger"
          ? "text-ink-faint hover:border-danger hover:text-danger"
          : "text-ink-soft hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}
