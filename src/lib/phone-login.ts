import { normalizePhone } from "./format.ts";

/**
 * 휴대폰 번호로 가입한 계정의 로그인 아이디.
 *
 * Supabase 로그인은 이메일이나 문자 인증이 필요하다. 문자 업체(솔라피) 계약 전이라
 * 번호를 이메일 모양으로 바꿔 이메일+비밀번호 계정으로 만든다 (2026-10-16 사용자 결정 ②).
 *
 * 왜 매장 메일의 + 주소인가: 지어낸 도메인(example.com, .invalid)은 Supabase 가
 * "잘못된 이메일" 로 거절할 수 있다. 매장 메일은 실제로 있는 주소라 형식 검사를
 * 통과하고, 혹시 메일이 나가더라도 남이 아니라 사장님 메일함으로 간다.
 *
 * 주의: Supabase 에서 「Confirm email」 을 켜면 이 계정들은 확인 메일이 사장님께 가고
 * 로그인이 막힌다. 켜지 말 것 — 켜야 하면 그때 문자 인증으로 옮긴다.
 */
// 절대 바꾸지 말 것. 이미 가입한 번호 손님의 로그인 아이디가 이 글자 그대로다 —
// 바꾸면 그 손님들은 전부 로그인이 안 된다. 매장 메일(STORE_INFO.email)이 바뀌어도 그대로 둔다.
const PREFIX = "jeongdamtta+p";
const MAIL_DOMAIN = "gmail.com";
const PHONE_ACCOUNT = /^jeongdamtta\+p01\d{8,9}@gmail\.com$/i;

export function phoneLoginEmail(rawPhone: string): string | null {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  return `${PREFIX}${phone.replace(/\D/g, "")}@${MAIL_DOMAIN}`;
}

/** 로그인 칸 하나에 이메일도 번호도 받는다. 둘 다 아니면 null. */
export function loginEmailFor(input: string): string | null {
  const value = input.trim();
  if (value.includes("@")) return value.toLowerCase();
  return phoneLoginEmail(value);
}

export function isPhoneAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return PHONE_ACCOUNT.test(email.trim());
}
