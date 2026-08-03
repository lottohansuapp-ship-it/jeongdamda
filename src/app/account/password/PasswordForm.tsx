"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/lib/auth";

const EMPTY: AuthState = { error: null, notice: null };

const FIELD =
  "h-12 w-full rounded-card border border-line bg-white px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus:outline-none";

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, EMPTY);

  return (
    <form action={action} className="space-y-2.5 pt-8">
      <label className="block">
        <span className="sr-only">새 비밀번호</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          placeholder="새 비밀번호 (8자 이상)"
          autoComplete="new-password"
          className={FIELD}
        />
      </label>

      <label className="block">
        <span className="sr-only">새 비밀번호 확인</span>
        <input
          type="password"
          name="confirm"
          required
          minLength={8}
          placeholder="한 번 더 입력"
          autoComplete="new-password"
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
        {pending ? "바꾸는 중…" : "비밀번호 바꾸기"}
      </button>
    </form>
  );
}
