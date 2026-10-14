/**
 * 로그인 뒤 돌아갈 주소. 우리 사이트 안의 경로만 통과시킨다 (오픈 리다이렉트 방지).
 *
 * "/" 로 시작하고 "//" 가 아니면 된다고 봤는데 그걸로는 모자랐다.
 * 브라우저는 "\" 를 "/" 로 바꿔 읽어서 "/\evil.com" 이 "//evil.com" — 남의 사이트가 된다.
 * 줄바꿈·탭 같은 제어 문자도 브라우저가 지우고 읽으므로 같이 막는다.
 */
export function safeNextPath(value: unknown): string {
  const next = typeof value === "string" ? value : "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}
