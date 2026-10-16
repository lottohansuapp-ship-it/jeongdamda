"use server";

import { redirect, RedirectType } from "next/navigation";
import { headers } from "next/headers";
import { serverClient } from "./supabase/server";
import { normalizePhone } from "./format";
import { PHONE_TAKEN_MESSAGE, STORE_INFO } from "./store-info";
import { signUpError } from "./auth-errors";
import { safeNextPath } from "./safe-next";
import { isPhoneAccountEmail, loginEmailFor, phoneLoginEmail } from "./phone-login";

export interface AuthState {
  error: string | null;
  notice: string | null;
}

function safeNext(value: FormDataEntryValue | null): string {
  return safeNextPath(value ?? "/");
}

async function origin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured;

  const host = (await headers()).get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  // 한 칸에 이메일도 휴대폰 번호도 받는다 (phone-login.ts)
  const id = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  const email = loginEmailFor(id);
  if (!email || !password) {
    return { error: "휴대폰 번호(또는 이메일)와 비밀번호를 입력해 주세요.", notice: null };
  }

  const db = await serverClient();
  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    return {
      error: "휴대폰 번호(또는 이메일)나 비밀번호가 맞지 않아요.",
      notice: null,
    };
  }

  // replace — 로그인 화면이 기록에 남으면 뒤로가기가 로그인 화면으로 갔다가 다시 튕겨 나온다.
  redirect(next, RedirectType.replace);
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const next = safeNext(formData.get("next"));

  // 동의 없이 이름·연락처를 받으면 개인정보보호법 위반이다.
  // 화면의 checkbox required 는 UX 이고 요청은 위조된다. 여기가 방어선이다.
  if (formData.get("agree") !== "on") {
    return {
      error: "이용약관과 개인정보 수집·이용에 동의해 주세요.",
      notice: null,
    };
  }

  if (!name) return { error: "이름을 입력해 주세요.", notice: null };

  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return { error: "휴대폰 번호를 다시 확인해 주세요.", notice: null };
  }
  // 휴대폰으로 가입하면 이메일 칸이 없다. 번호가 곧 로그인 아이디다.
  const byPhone = formData.get("method") === "phone";
  // 번호 손님의 로그인 아이디 모양을 이메일로 넣어 남의 번호 자리를 먼저 차지하지 못하게.
  if (!byPhone && isPhoneAccountEmail(email)) {
    return { error: "쓸 수 없는 이메일이에요. 다른 이메일을 넣어 주세요.", notice: null };
  }
  const loginEmail = byPhone ? phoneLoginEmail(phone) : email;
  if (!loginEmail || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요.", notice: null };
  }
  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상으로 정해 주세요.", notice: null };
  }

  const db = await serverClient();
  const { data, error } = await db.auth.signUp({
    email: loginEmail,
    password,
    options: {
      data: { name, phone },
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    const message = signUpError(error);
    // 번호 계정의 "이미 가입된 이메일" 은 손님이 넣은 적 없는 이메일 이야기다.
    return {
      error: byPhone && message.includes("이메일") ? PHONE_TAKEN_MESSAGE : message,
      notice: null,
    };
  }

  // 이메일 확인이 켜져 있으면 세션 없이 돌아온다
  if (!data.session) {
    return {
      error: null,
      notice: `${email} 으로 확인 메일을 보냈어요. 메일함에서 인증을 마쳐 주세요.`,
    };
  }

  // 이메일 확인이 꺼져 있으면 /auth/callback 을 지나지 않는다. 그 경로의
  // 손님도 쿠폰을 받게 여기서도 부른다 — 여러 번 불려도 안전하다.
  await db.rpc("claim_signup_coupon");
  // replace — 로그인 화면이 기록에 남으면 뒤로가기가 로그인 화면으로 갔다가 다시 튕겨 나온다.
  redirect(next, RedirectType.replace);
}

/**
 * 카카오 로그인. Supabase Provider 가 꺼져 있으면 에러를 돌려준다 (D16).
 * 켜는 날 고칠 코드가 없도록 지금 다 넣어둔다.
 */
export async function signInWithKakao(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const next = safeNext(formData.get("next"));
  const db = await serverClient();

  const { data, error } = await db.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    return {
      error: "카카오 로그인이 아직 준비되지 않았습니다. 이메일로 로그인해 주세요.",
      notice: null,
    };
  }

  redirect(data.url);
}

/**
 * 카카오 가입자용. 카카오는 휴대폰 번호를 주지 않으므로 콜백 직후 한 번 받는다 (D18).
 * 이름도 비어 있으면 함께 받는다.
 */
export async function savePhone(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) return { error: "로그인이 필요합니다.", notice: null };

  const name = String(formData.get("name") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const next = safeNext(formData.get("next"));

  // signUp 과 같은 이유 — 동의가 방어선이지 화면의 checkbox 가 아니다
  if (formData.get("agree") !== "on") {
    return {
      error: "이용약관과 개인정보 수집·이용에 동의해 주세요.",
      notice: null,
    };
  }

  if (!name) return { error: "이름을 입력해 주세요.", notice: null };
  if (!phone) return { error: "휴대폰 번호를 다시 확인해 주세요.", notice: null };

  const { error } = await db
    .from("profiles")
    .update({ name, phone })
    .eq("id", user.id);

  if (error) {
    // 같은 번호가 이미 다른 계정에 있다 (0024). 카카오로 들어온 손님이
    // 예전에 이메일로 가입한 적이 있으면 여기서 만난다.
    if (error.code === "23505") {
      return { error: PHONE_TAKEN_MESSAGE, notice: null };
    }
    return { error: "저장하지 못했습니다. 다시 시도해 주세요.", notice: null };
  }

  // 번호가 들어온 그 순간이 쿠폰을 줄 수 있는 첫 순간이다. 실패해도
  // 되돌리지 않는다 — 쿠폰은 덤이고, 못 받았다고 가입이 막히면 안 된다.
  await db.rpc("claim_signup_coupon");

  // replace — 로그인 화면이 기록에 남으면 뒤로가기가 로그인 화면으로 갔다가 다시 튕겨 나온다.
  redirect(next, RedirectType.replace);
}

/** 재설정 메일 발송. 계정이 없어도 성공처럼 답한다 — 가입 여부를 알려주면 안 된다. */
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "이메일을 입력해 주세요.", notice: null };
  // 번호 계정의 메일은 사장님 메일함으로 간다(phone-login.ts) — 보내지 않고 전화로 안내한다.
  if (!email.includes("@") || isPhoneAccountEmail(email)) {
    return {
      error: `휴대폰 번호로 가입하셨다면 매장(${STORE_INFO.phone})에 전화 주세요. 임시 비밀번호를 알려 드려요.`,
      notice: null,
    };
  }

  const db = await serverClient();
  await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origin()}/auth/callback?type=recovery`,
  });

  return {
    error: null,
    notice: `${email} 으로 재설정 메일을 보냈어요. 메일의 링크를 눌러 주세요.`,
  };
}

/** 메일 링크로 들어와 세션이 생긴 상태에서 새 비밀번호를 정한다. */
export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상으로 정해 주세요.", notice: null };
  }
  if (password !== confirm) {
    return { error: "두 비밀번호가 서로 달라요.", notice: null };
  }

  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) {
    return {
      error: "재설정 링크가 만료됐어요. 메일을 다시 요청해 주세요.",
      notice: null,
    };
  }

  const { error } = await db.auth.updateUser({ password });
  if (error) {
    return {
      error: "비밀번호를 바꾸지 못했어요. 다시 시도해 주세요.",
      notice: null,
    };
  }

  redirect("/account?changed=1");
}

/** 관리자가 아닌 계정으로 관리자 화면에 들어왔을 때 — 로그아웃하고 바로 로그인 화면으로. */
export async function switchToAdminLogin(): Promise<void> {
  const db = await serverClient();
  await db.auth.signOut();
  redirect("/login?next=%2Fadmin");
}

export async function signOut(): Promise<void> {
  const db = await serverClient();
  await db.auth.signOut();
  redirect("/");
}
