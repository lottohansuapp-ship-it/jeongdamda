"use client";

import Link from "next/link";
import { useActionState } from "react";
import { savePhone, type AuthState } from "@/lib/auth";

const EMPTY: AuthState = { error: null, notice: null };

const FIELD =
  "h-12 w-full rounded-card border border-line bg-white px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus:outline-none";

interface PhoneFormProps {
  next: string;
  defaultName: string;
  defaultPhone: string;
}

export function PhoneForm({ next, defaultName, defaultPhone }: PhoneFormProps) {
  const [state, action, pending] = useActionState(savePhone, EMPTY);

  return (
    <form action={action} className="space-y-2.5 pt-8">
      <input type="hidden" name="next" value={next} />

      <label className="block">
        <span className="sr-only">이름</span>
        <input
          name="name"
          required
          defaultValue={defaultName}
          placeholder="이름"
          autoComplete="name"
          className={FIELD}
        />
      </label>

      <label className="block">
        <span className="sr-only">휴대폰 번호</span>
        <input
          name="phone"
          required
          type="tel"
          inputMode="numeric"
          defaultValue={defaultPhone}
          placeholder="휴대폰 번호 (010-1234-5678)"
          autoComplete="tel"
          className={FIELD}
        />
      </label>

      {/* 카카오로 오신 분이 이름·연락처를 처음 남기는 자리다. 동의를 여기서 받는다. */}
      <label className="flex cursor-pointer gap-2.5 px-1 pt-3">
        <input
          type="checkbox"
          name="agree"
          required
          className="mt-0.5 h-4 w-4 shrink-0 accent-olive"
        />
        <span className="text-[13px] leading-relaxed text-ink-soft">
          <Link
            href="/terms"
            target="_blank"
            className="text-ink underline underline-offset-4"
          >
            이용약관
          </Link>
          과{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="text-ink underline underline-offset-4"
          >
            개인정보 수집·이용
          </Link>
          에 동의합니다 <span className="text-clay-deep">(필수)</span>
        </span>
      </label>

      {state.error && (
        <p role="alert" className="px-1 pt-1 text-[13px] text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 h-12 w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-50"
      >
        {pending ? "저장 중…" : "시작하기"}
      </button>
    </form>
  );
}
