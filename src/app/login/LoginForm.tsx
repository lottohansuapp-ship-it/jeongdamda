"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  requestPasswordReset,
  signIn,
  signInWithKakao,
  signUp,
  type AuthState,
} from "@/lib/auth";

const EMPTY: AuthState = { error: null, notice: null };

const FIELD =
  "h-12 w-full rounded-card border border-line bg-white px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus:outline-none";

type Mode = "login" | "signup" | "forgot";

interface LoginFormProps {
  next: string;
  initialMode: Mode;
  kakaoEnabled: boolean;
}

export function LoginForm({ next, initialMode, kakaoEnabled }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loginState, loginAction, loginPending] = useActionState(signIn, EMPTY);
  const [signupState, signupAction, signupPending] = useActionState(
    signUp,
    EMPTY,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    requestPasswordReset,
    EMPTY,
  );

  const signingUp = mode === "signup";
  const forgot = mode === "forgot";

  const state = forgot ? resetState : signingUp ? signupState : loginState;
  const pending = forgot
    ? resetPending
    : signingUp
      ? signupPending
      : loginPending;

  return (
    <div className="pt-8">
      {kakaoEnabled && (
        <>
          <KakaoButton next={next} />
          <div className="flex items-center gap-3 py-6">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[12px] text-ink-faint">또는 이메일로</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form
        key={mode}
        action={forgot ? resetAction : signingUp ? signupAction : loginAction}
        className="space-y-2.5"
      >
        <input type="hidden" name="next" value={next} />

        {signingUp && (
          <>
            <label className="block">
              <span className="sr-only">이름</span>
              <input
                name="name"
                required
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
                placeholder="휴대폰 번호 (010-1234-5678)"
                autoComplete="tel"
                className={FIELD}
              />
            </label>
          </>
        )}

        <label className="block">
          <span className="sr-only">이메일</span>
          <input
            name="email"
            required
            type="email"
            placeholder="이메일"
            autoComplete={signingUp ? "email" : "username"}
            className={FIELD}
          />
        </label>

        {!forgot && (
          <label className="block">
            <span className="sr-only">비밀번호</span>
            <input
              name="password"
              required
              type="password"
              placeholder={signingUp ? "비밀번호 (8자 이상)" : "비밀번호"}
              autoComplete={signingUp ? "new-password" : "current-password"}
              className={FIELD}
            />
          </label>
        )}

        {/* 개인정보보호법상 동의 없이 이름·연락처를 받을 수 없다.
            required 라 체크하지 않으면 제출이 막히고, 서버도 다시 확인한다. */}
        {signingUp && (
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
        )}

        {state.error && (
          <p role="alert" className="px-1 pt-1 text-[13px] text-danger">
            {state.error}
          </p>
        )}
        {state.notice && (
          <p
            role="status"
            className="px-1 pt-1 text-[13px] leading-relaxed text-olive-deep"
          >
            {state.notice}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 h-12 w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-50"
        >
          {pending
            ? "잠시만요…"
            : forgot
              ? "재설정 메일 받기"
              : signingUp
                ? "가입하고 시작하기"
                : "로그인"}
        </button>
      </form>

      {!signingUp && (
        <p className="pt-4 text-center text-[13px] text-ink-soft">
          <button
            type="button"
            onClick={() => setMode(forgot ? "login" : "forgot")}
            className="underline underline-offset-4"
          >
            {forgot ? "로그인으로 돌아가기" : "비밀번호를 잊으셨나요?"}
          </button>
        </p>
      )}

      <p className="pt-5 text-center text-[13px] text-ink-soft">
        {signingUp ? "이미 계정이 있으신가요?" : "처음이신가요?"}{" "}
        <button
          type="button"
          onClick={() => setMode(signingUp ? "login" : "signup")}
          className="text-ink underline underline-offset-4"
        >
          {signingUp ? "로그인" : "회원가입"}
        </button>
      </p>

      <p className="pt-8 text-center text-[12.5px] text-ink-faint">
        <Link href="/" className="underline underline-offset-4">
          그냥 둘러보기
        </Link>
      </p>
    </div>
  );
}

function KakaoButton({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInWithKakao, EMPTY);

  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <button
        type="submit"
        disabled={pending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-card bg-[#FEE500] text-[15px] text-[#191600] transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
      >
        <KakaoMark />
        카카오로 3초 만에 시작하기
      </button>
      {state.error && (
        <p role="alert" className="px-1 pt-2 text-[13px] text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

function KakaoMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M12 3C6.9 3 2.8 6.3 2.8 10.3c0 2.6 1.7 4.9 4.3 6.2-.2.7-.7 2.5-.8 2.9-.1.5.2.5.4.4.2-.1 2.7-1.8 3.8-2.6.5.1 1 .1 1.5.1 5.1 0 9.2-3.3 9.2-7.3S17.1 3 12 3Z" />
    </svg>
  );
}
