"use client";

import { useEffect, useRef, useState } from "react";
import type { Address } from "@/types/database";

/*
  배송지 입력 폼. 내 정보와 주문서가 같이 쓴다 — 예전엔 주문서에서 배송지가 없으면
  내 정보로 나가 등록하고 다시 장바구니부터 주문서로 돌아와야 했다.
*/

const POSTCODE_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

export const FIELD =
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

interface AddressFormProps {
  /** 바깥 카드 모양. 이미 흰 카드 안에 들어갈 땐 그림자를 뺀다. */
  className?: string;
  address: Address | null;
  onSubmit: (formData: FormData) => void | Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}

export function AddressForm({
  address,
  onSubmit,
  onCancel,
  onError,
  className = "mb-3 rounded-card bg-white p-4 shadow-soft",
}: AddressFormProps) {
  const [postcode, setPostcode] = useState(address?.postcode ?? "");
  const [address1, setAddress1] = useState(address?.address1 ?? "");
  const detailRef = useRef<HTMLInputElement>(null);

  function openPostcode(Postcode: NonNullable<typeof window.daum>["Postcode"]) {
    new Postcode({
      oncomplete: (data) => {
        const base = data.roadAddress || data.jibunAddress;
        setPostcode(data.zonecode);
        setAddress1(data.buildingName ? `${base} (${data.buildingName})` : base);
        detailRef.current?.focus();
      },
    }).open();
  }

  /**
   * 폼이 열리는 순간 스크립트를 미리 받아 둔다.
   *
   * 다음 우편번호의 open() 은 새 창을 띄운다. 그런데 iOS Safari 는 사용자가
   * 누른 **직후**가 아닌 창을 막는다. 예전에는 클릭 핸들러에서 await 로
   * 스크립트를 받고 그 뒤에 열어서, 아직 안 받아 둔 첫 방문에는 아이폰에서
   * 아무 일도 일어나지 않을 수 있었다. 저장 버튼은 주소가 없으면 막혀 있으니
   * 그 손님은 **배달 주문을 영영 못 한다.**
   *
   * 미리 받아 두면 아래 search() 가 await 없이 바로 열 수 있다.
   */
  useEffect(() => {
    loadPostcodeScript().catch(() => {
      // 여기서 알리지 않는다. 아직 누르지도 않은 손님에게 띄울 말이 아니다.
      // 실제로 누르면 search() 가 다시 시도하고 그때 안내한다.
    });
  }, []);

  function search() {
    const ready = window.daum?.Postcode;
    if (ready) {
      // 미리 받아 뒀으면 여기서 끝. await 가 없어야 아이폰이 창을 막지 않는다.
      openPostcode(ready);
      return;
    }

    loadPostcodeScript()
      .then(() => {
        const Postcode = window.daum?.Postcode;
        if (!Postcode) throw new Error("not ready");
        openPostcode(Postcode);
      })
      .catch(() => {
        onError("주소 검색을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      });
  }

  return (
    <form
      action={onSubmit}
      className={`space-y-2.5 ${className}`}
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
