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
  "h-12 w-full rounded-card border border-line bg-white px-4 text-[16px] placeholder:text-ink-faint focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive";

/**
 * 라벨을 눈에도 보이게 둔다.
 *
 * 예전에는 sr-only 라 화면에 보이는 이름이 플레이스홀더뿐이었다.
 * 칸을 채우고 나면 그게 무슨 칸이었는지 사라진다. 이름·휴대폰·이메일·비밀번호
 * 넷을 채우고 확인하려는 어르신은 세 번째가 뭐였는지 알 방법이 없었고,
 * 비밀번호 칸은 점으로만 보여 아예 구분이 안 됐다.
 * 내 정보 화면(AccountBoard)은 이미 보이는 라벨을 쓰고 있었다 — 그쪽에 맞춘다.
 */
const LABEL = "block pb-1 text-[14px] text-ink-soft";

type Mode = "login" | "signup" | "forgot";
/** 가입 방법. 휴대폰이 기본 — 어르신은 이메일이 없거나 비밀번호를 잊는다. */
type Method = "phone" | "email";

interface LoginFormProps {
  next: string;
  initialMode: Mode;
  kakaoEnabled: boolean;
  /** 메일 인증·카카오에서 돌아왔는데 실패했을 때 먼저 보여 줄 말 (page.tsx 가 정한다) */
  notice?: string | null;
}

export function LoginForm({ next, initialMode, kakaoEnabled, notice }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [method, setMethod] = useState<Method>("phone");
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
  const withEmail = signingUp && method === "email";

  /**
   * 모드를 바꾸면 key 때문에 폼이 통째로 다시 그려진다.
   * 회원가입을 누르면 위쪽에 이름·휴대폰 칸과 동의 체크박스가 새로 생기는데,
   * 포커스는 방금 누른 버튼(폼 아래)에 그대로 남아 아무 안내가 없었다.
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
      {notice && !state.error && !state.notice && (
        <p role="status" className="mb-4 rounded-card bg-cream px-4 py-3 text-[14px] leading-relaxed">
          {notice}
        </p>
      )}

      {kakaoEnabled && (
        <>
          <KakaoButton next={next} />
          <div className="flex items-center gap-3 py-6">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[13px] text-ink-soft">또는</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      {signingUp && (
        <div
          role="radiogroup"
          aria-label="가입 방법"
          className="mb-4 grid grid-cols-2 gap-1 rounded-card bg-canvas p-1"
        >
          <MethodTab on={method === "phone"} onClick={() => setMethod("phone")}>
            휴대폰 번호로
          </MethodTab>
          <MethodTab on={method === "email"} onClick={() => setMethod("email")}>
            이메일로
          </MethodTab>
        </div>
      )}

      <form
        ref={formRef}
        key={`${mode}-${method}`}
        action={forgot ? resetAction : signingUp ? signupAction : loginAction}
        className="space-y-3"
      >
        <input type="hidden" name="next" value={next} />
        {signingUp && <input type="hidden" name="method" value={method} />}

        {signingUp && (
          <>
            <label className="block">
              <span className={LABEL}>이름</span>
              <input
                name="name"
                required
                placeholder="예: 홍길동"
                autoComplete="name"
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className={LABEL}>
                휴대폰 번호{method === "phone" && " (로그인할 때 써요)"}
              </span>
              <input
                name="phone"
                required
                type="tel"
                inputMode="numeric"
                placeholder="예: 01012345678"
                autoComplete={method === "phone" ? "username" : "tel"}
                className={FIELD}
              />
            </label>
          </>
        )}

        {(!signingUp || withEmail) && (
          <label className="block">
            <span className={LABEL}>
              {forgot ? "가입한 이메일" : signingUp ? "이메일" : "휴대폰 번호 또는 이메일"}
            </span>
            <input
              name="email"
              required
              type={signingUp || forgot ? "email" : "text"}
              placeholder={signingUp || forgot ? "예: name@example.com" : "예: 01012345678"}
              autoComplete={signingUp ? "email" : "username"}
              autoCapitalize="none"
              className={FIELD}
            />
          </label>
        )}

        {!forgot && <PasswordField signingUp={signingUp} />}

        {/* 개인정보보호법상 동의 없이 이름·연락처를 받을 수 없다.
            required 라 체크하지 않으면 제출이 막히고, 서버도 다시 확인한다. */}
        {signingUp && (
          <label className="flex min-h-12 cursor-pointer items-start gap-3 px-1 pt-3">
            <input
              type="checkbox"
              name="agree"
              required
              className="mt-0.5 h-6 w-6 shrink-0 accent-olive"
            />
            <span className="text-[14px] leading-relaxed text-ink-soft">
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

        {forgot && (
          <p className="px-1 text-[14px] leading-relaxed text-ink-soft">
            휴대폰 번호로 가입하셨다면 매장에 전화 주세요. 사장님이 임시 비밀번호를 알려 드려요.
          </p>
        )}

        {state.error && (
          <p role="alert" className="px-1 pt-1 text-[14px] text-danger">
            {state.error}
          </p>
        )}
        {state.notice && (
          <p
            role="status"
            className="px-1 pt-1 text-[14px] leading-relaxed text-olive-deep"
          >
            {state.notice}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 h-12 w-full rounded-card bg-olive text-[16px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-50"
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

      {/* 「담기」 를 누르고 온 손님은 대부분 처음이다. 예전엔 가입이 작은 밑줄 글씨라
          로그인 칸만 보고 막혔다. 로그인 버튼 바로 아래에 같은 크기로 둔다. */}
      {mode === "login" && (
        <button
          type="button"
          onClick={() => setMode("signup")}
          className="mt-2.5 h-12 w-full rounded-card border border-olive bg-white text-[16px] text-olive-deep transition-colors duration-200 hover:bg-olive-soft"
        >
          처음이세요? 휴대폰 번호로 가입하기
        </button>
      )}

      {!signingUp && (
        <p className="pt-3 text-center text-[14px] text-ink-soft">
          <button
            type="button"
            onClick={() => setMode(forgot ? "login" : "forgot")}
            className="inline-flex min-h-12 items-center underline underline-offset-4"
          >
            {forgot ? "로그인으로 돌아가기" : "비밀번호를 잊으셨나요?"}
          </button>
        </p>
      )}

      {signingUp && (
        <p className="pt-5 text-center text-[14px] text-ink-soft">
          이미 계정이 있으신가요?{" "}
          <button
            type="button"
            onClick={() => setMode("login")}
            className="inline-flex min-h-12 items-center text-ink underline underline-offset-4"
          >
            로그인
          </button>
        </p>
      )}

      <p className="pt-6 text-center text-[14px] text-ink-soft">
        <Link href="/" className="inline-flex min-h-12 items-center underline underline-offset-4">
          그냥 둘러보기
        </Link>
      </p>
    </div>
  );
}

/** 비밀번호를 한 번만 받으니 보이게 할 수 있어야 한다 — 오타가 나면 바로 막힌다. */
function PasswordField({ signingUp }: { signingUp: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="block">
      <span className={LABEL}>비밀번호</span>
      <span className="relative block">
        <input
          name="password"
          required
          type={shown ? "text" : "password"}
          placeholder={signingUp ? "8자 이상" : ""}
          autoComplete={signingUp ? "new-password" : "current-password"}
          className={`${FIELD} pr-20`}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-pressed={shown}
          aria-label={shown ? "비밀번호 숨기기" : "비밀번호 보기"}
          className="absolute inset-y-0 right-0 min-w-16 px-3 text-[14px] text-ink-soft"
        >
          {shown ? "숨기기" : "보기"}
        </button>
      </span>
    </label>
  );
}

function MethodTab({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`h-12 rounded-[12px] text-[15px] transition-colors duration-200 ${
        on ? "bg-white text-ink shadow-soft" : "text-ink-soft"
      }`}
    >
      {children}
    </button>
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
