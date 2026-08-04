"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { serverClient } from "./supabase/server";
import { normalizePhone } from "./format";

export interface AuthState {
  error: string | null;
  notice: string | null;
}

function safeNext(value: FormDataEntryValue | null): string {
  const next = String(value ?? "/");
  // 오픈 리다이렉트 방지 — 외부 URL 이나 //evil.com 형태를 막는다
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
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
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요.", notice: null };
  }

  const db = await serverClient();
  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다.", notice: null };
  }

  redirect(next);
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
  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요.", notice: null };
  }
  if (password.length < 8) {
    return { error: "비밀번호는 8자 이상으로 정해 주세요.", notice: null };
  }

  const db = await serverClient();
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: {
      data: { name, phone },
      emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    const duplicate = error.message.toLowerCase().includes("already");
    return {
      error: duplicate
        ? "이미 가입된 이메일입니다. 로그인해 주세요."
        : "가입에 실패했습니다. 잠시 후 다시 시도해 주세요.",
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

  redirect(next);
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

  if (error) return { error: "저장하지 못했습니다. 다시 시도해 주세요.", notice: null };

  redirect(next);
}

/** 재설정 메일 발송. 계정이 없어도 성공처럼 답한다 — 가입 여부를 알려주면 안 된다. */
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "이메일을 입력해 주세요.", notice: null };

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

export async function signOut(): Promise<void> {
  const db = await serverClient();
  await db.auth.signOut();
  redirect("/");
}
