"use client";

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
