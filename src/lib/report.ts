import "server-only";
import { publicClient } from "./supabase/public";

/**
 * 오류를 남긴다. 남기지 못해도 앱은 계속 돈다.
 *
 * 지금까지는 console.error 뿐이라 Vercel 로그를 뒤져야 했고, 사실상 아무도 안 봤다.
 * 사장님이 관리자 화면에서 "무엇이 몇 번 실패했나"를 볼 수 있어야
 * 손님이 전화하기 전에 안다.
 *
 * **개인정보를 넘기지 않는다.** 주소·연락처가 오류 메시지에 섞이면 그게 곧 유출이다.
 * detail 에는 주문번호 정도만 넣는다.
 *
 * 던지지 않는다. "오류를 남기다 오류가 나서 주문이 실패했다"는 최악이다.
 */
export async function reportError(
  scope: string,
  message: string,
  detail?: string,
): Promise<void> {
  // 콘솔에도 남긴다. Vercel 로그와 대조할 일이 생긴다.
  console.error(`[${scope}]`, detail ?? "", message);

  try {
    await publicClient().rpc("log_error", {
      p_scope: scope,
      p_message: message,
      p_detail: detail ?? null,
    });
  } catch {
    // 기록조차 실패했다. 여기서 더 할 수 있는 일이 없다.
  }
}
