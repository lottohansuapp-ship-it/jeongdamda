"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  requestPasswordReset,
  signIn,
  signInWithKakao,
  signUp,
  type AuthState,
} from "@/lib/auth";

const EMPTY: AuthState = { error: null, notice: null };

const FIELD =
  "h-12 w-full rounded-card border border-line bg-white px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive";

/**
 * 라벨을 눈에도 보이게 둔다.
 *
 * 예전에는 sr-only 라 화면에 보이는 이름이 플레이스홀더뿐이었다.
 * 칸을 채우고 나면 그게 무슨 칸이었는지 사라진다. 이름·휴대폰·이메일·비밀번호
 * 넷을 채우고 확인하려는 어르신은 세 번째가 뭐였는지 알 방법이 없었고,
 * 비밀번호 칸은 점으로만 보여 아예 구분이 안 됐다.
 * 내 정보 화면(AccountBoard)은 이미 보이는 라벨을 쓰고 있었다 — 그쪽에 맞춘다.
 */
const LABEL = "block pb-1 text-[13px] text-ink-soft";

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

  /**
   * 모드를 바꾸면 key={mode} 때문에 폼이 통째로 다시 그려진다.
   * 회원가입을 누르면 위쪽에 이름·휴대폰 칸과 동의 체크박스가 새로 생기는데,
   * 포커스는 방금 누른 버튼(폼 아래)에 그대로 남아 아무 안내가 없었다.
   * 눈으로 보는 손님은 위가 바뀐 걸 보지만, 안 보이는 손님은 위로 올라가
   * 처음부터 다시 훑어야 무엇이 생겼는지 알 수 있었다.
   *
   * 바꾼 뒤 첫 입력칸으로 포커스를 옮긴다. 스크린리더가 그 칸 이름을 읽어 주니
   * 화면이 바뀐 것과 지금 무엇을 채워야 하는지가 한 번에 전해진다.
   */
  const formRef = useRef<HTMLFormElement>(null);
  const mounted = useRef(false);

  useEffect(() => {
    // 처음 열릴 때는 옮기지 않는다. 손님이 바꿨을 때만 따라간다.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    formRef.current
      ?.querySelector<HTMLInputElement>("input:not([type=hidden])")
      ?.focus();
  }, [mode]);

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
        ref={formRef}
        key={mode}
        action={forgot ? resetAction : signingUp ? signupAction : loginAction}
        className="space-y-2.5"
      >
        <input type="hidden" name="next" value={next} />

        {signingUp && (
          <>
            <label className="block">
              <span className={LABEL}>이름</span>
              <input
                name="name"
                required
                placeholder="홍길동"
                autoComplete="name"
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className={LABEL}>휴대폰 번호</span>
              <input
                name="phone"
                required
                type="tel"
                inputMode="numeric"
                placeholder="01012345678"
                autoComplete="tel"
                className={FIELD}
              />
            </label>
          </>
        )}

        <label className="block">
          <span className={LABEL}>이메일</span>
          <input
            name="email"
            required
            type="email"
            placeholder="name@example.com"
            autoComplete={signingUp ? "email" : "username"}
            className={FIELD}
          />
        </label>

        {!forgot && (
          <label className="block">
            <span className={LABEL}>비밀번호</span>
            <input
              name="password"
              required
              type="password"
              placeholder={signingUp ? "8자 이상" : ""}
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
        /* 카카오가 정한 색이라 토큰으로 올리지 않는다. 노란색 #FEE500 과
           글자색 #191600 은 카카오 로그인 버튼 규정에 박혀 있어서, 우리 팔레트가
           바뀌어도 따라 바뀌면 안 된다. 규정 위반이면 심사에서 걸린다. */
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
