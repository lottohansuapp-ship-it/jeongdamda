"use client";

import { useState, useTransition } from "react";
import { resetCustomerPassword } from "@/lib/admin-customer-actions";

/**
 * 비밀번호를 잊은 손님 돕기. 휴대폰 번호로 가입한 손님은 메일로 재설정할 수 없어서
 * 매장에 전화한다 (0031). 임시 비밀번호는 화면에만 한 번 보이고 어디에도 남지 않는다.
 */
export function PasswordResetCard() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{ name: string | null; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    if (!confirm(`${phone} 손님의 비밀번호를 임시 비밀번호로 바꿀까요?\n지금 쓰던 비밀번호로는 더 이상 로그인되지 않아요.`)) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await resetCustomerPassword(phone).catch(() => ({
        ok: false as const,
        error: "연결이 끊겼어요. 다시 눌러 주세요.",
      }));
      if (response.ok) setResult(response.data);
      else setError(response.error);
    });
  }

  return (
    <section className="mt-6 rounded-card bg-white p-5 shadow-soft" aria-labelledby="pw-reset-heading">
      <h2 id="pw-reset-heading" className="text-[16px]">
        손님 비밀번호 찾아 주기
      </h2>
      <p className="pt-1.5 text-[14px] leading-relaxed text-ink-soft">
        휴대폰 번호로 가입한 손님이 비밀번호를 잊었을 때 써요. 전화한 분이 번호 주인인지
        <strong className="font-normal text-ink"> 그 번호로 다시 걸어</strong> 확인한 뒤 눌러 주세요.
      </p>

      <div className="mt-3 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">손님 휴대폰 번호</span>
          <input
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setResult(null);
            }}
            type="tel"
            inputMode="numeric"
            placeholder="손님 번호 01012345678"
            className="h-12 w-full rounded-card border border-line bg-canvas px-4 text-[16px] focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
          />
        </label>
        <button
          type="button"
          onClick={reset}
          disabled={pending || phone.trim().length < 10}
          className="h-12 shrink-0 rounded-card bg-olive px-4 text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-40"
        >
          {pending ? "바꾸는 중…" : "임시 비밀번호 만들기"}
        </button>
      </div>

      {error && (
        <p role="alert" className="pt-3 text-[14px] text-danger">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="mt-3 rounded-[12px] bg-cream p-4">
          <p className="text-[14px] text-ink-soft">
            {result.name ?? "손님"}님 임시 비밀번호 — 불러 드리세요
          </p>
          <p className="select-all pt-1 text-[28px] tabular-nums tracking-[0.15em] text-ink">
            {result.password}
          </p>
          <p className="pt-1 text-[13.5px] leading-relaxed text-ink-soft">
            로그인한 뒤 「내 정보 → 비밀번호 바꾸기」에서 바꾸시라고 안내해 주세요.
          </p>
        </div>
      )}
    </section>
  );
}
