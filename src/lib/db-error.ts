/**
 * 관리자 쓰기 실패를 사장님이 읽을 말로 바꾼다.
 *
 * 관리자 화면은 로그인만 하면 열리고, 실제로 바꿀 권한은 DB 의 RLS
 * (is_admin) 가 판단한다. 관리자가 아닌 계정으로 들어와 반찬을 추가하면
 * Postgres 원문 "new row violates row-level security policy for table
 * products" 가 그대로 떴다. 휴대폰에서 사장님이 보고 무슨 뜻인지 알 수 없었다.
 *
 * 권한 오류만 바꾼다. 나머지는 원문을 둔다 — 감추면 고칠 단서가 사라진다.
 */
export interface DbErrorLike {
  code?: string;
  message: string;
}

export const NOT_ADMIN_MESSAGE =
  "관리자 계정이 아니라서 바꿀 수 없어요. 로그아웃한 뒤 관리자 계정으로 다시 로그인해 주세요.";

export function friendlyDbError(error: DbErrorLike): string {
  // 42501 = 권한 없음. Storage 는 코드 없이 같은 문장을 준다.
  if (error.code === "42501" || /row-level security/i.test(error.message)) {
    return NOT_ADMIN_MESSAGE;
  }
  return error.message;
}
