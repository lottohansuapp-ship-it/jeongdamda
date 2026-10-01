import { PHONE_TAKEN_MESSAGE } from "./store-info.ts";

/** supabase-js 의 AuthError 중 우리가 보는 부분만. 테스트에서 만들기 쉽게 좁게 둔다. */
export interface SignUpFailure {
  message: string;
  status?: number;
  code?: string;
}

/**
 * 가입 실패 사유를 손님이 읽을 말로 바꾼다.
 *
 * 원문은 영어이고 뭘 해야 하는지 알려주지 않는다. 그렇다고 전부 한 문장으로
 * 뭉개면 안 된다 — **다시 시도하면 되는 일과 영원히 안 되는 일을 구분해 줘야**
 * 손님이 갇히지 않는다. 이 구분을 틀린 적이 있어서 테스트를 남긴다.
 */
export function signUpError(error: SignUpFailure): string {
  if (error.code === "user_already_exists" || error.code === "email_exists") {
    return "이미 가입된 이메일입니다. 로그인해 주세요.";
  }

  // 메일 발송·요청 한도. Supabase 기본 SMTP 는 시간당 몇 통이라 손님이 몰리면 난다.
  // 여기서는 "잠시 후 다시" 가 **맞는 말**이다.
  if (error.status === 429 || error.code?.startsWith("over_") === true) {
    return "가입 요청이 많아요. 1분쯤 뒤에 다시 시도해 주세요.";
  }

  /*
    프로필을 만드는 트리거(handle_new_user)가 전화번호 유니크 인덱스(0024)에
    걸리면 auth.users 삽입까지 같은 트랜잭션에서 되돌아간다 — 계정은 아예
    생기지 않는다. Supabase 는 원인을 감춘 채 500 "Database error saving new
    user" 만 돌려주므로 코드로는 번호 탓인지 알 수 없다. 다만 그 트리거에서
    깨질 수 있는 제약이 전화번호 하나뿐이라 500 은 번호로 본다.

    500 만 본다. 한때 "already 아니면 전부 번호 탓" 으로 뭉갰더니 메일 한도나
    형식 오류까지 "이미 가입된 번호" 라고 하게 됐다 — 가입한 적 없는 손님에게.
  */
  if (error.status === 500 || error.code === "unexpected_failure") {
    return PHONE_TAKEN_MESSAGE;
  }

  return "가입에 실패했습니다. 입력한 내용을 확인해 주세요.";
}
