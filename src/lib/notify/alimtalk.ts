import "server-only";

/**
 * 알림톡 발송. **대행사가 정해지면 고칠 파일은 여기 하나다.**
 *
 * 솔라피·알리고·NHN 등 대행사마다 요청 형태가 다르다. 아직 어디와 계약할지
 * 정해지지 않았으므로 그럴듯한 규격을 지어내지 않았다 — 지어낸 규격은 켜는 날
 * 어차피 다시 쓰게 되고, 그때 "되는 줄 알았던 코드"가 더 위험하다.
 *
 * 대신 어댑터 경계를 확정해 두었다. 이 파일이 지켜야 할 약속은 둘뿐이다.
 *   · isAlimtalkReady() — 설정이 다 있는지
 *   · sendAlimtalk(phone, text) — 보내고 성공 여부를 돌려준다. 던지지 않는다
 * 이 둘만 지키면 부르는 쪽(notify/index.ts)은 손댈 필요가 없다.
 *
 * 지금 구현은 "엔드포인트에 JSON 을 POST" 하는 가장 흔한 형태다.
 * 대행사 규격에 맞춰 body 만 바꾸면 된다.
 */
const ENDPOINT = process.env.ALIMTALK_ENDPOINT ?? "";
const API_KEY = process.env.ALIMTALK_API_KEY ?? "";
/** 카카오 비즈니스 채널 식별자 (대행사마다 이름이 다르다) */
const SENDER_KEY = process.env.ALIMTALK_SENDER_KEY ?? "";
/** 사전 승인받은 템플릿 코드 */
const TEMPLATE_CODE = process.env.ALIMTALK_TEMPLATE_CODE ?? "";

export function isAlimtalkReady(): boolean {
  return Boolean(ENDPOINT && API_KEY && SENDER_KEY && TEMPLATE_CODE);
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendAlimtalk(
  phone: string,
  text: string,
): Promise<SendResult> {
  if (!isAlimtalkReady()) {
    return { ok: false, error: "알림톡 설정이 아직 없습니다." };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        senderKey: SENDER_KEY,
        templateCode: TEMPLATE_CODE,
        // 하이픈 없는 번호를 요구하는 대행사가 많다
        to: phone.replace(/\D/g, ""),
        text,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      // 대행사 메시지를 그대로 쓰되 우리 키는 섞이지 않는다
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        error: body.slice(0, 200) || `발송 실패 (${response.status})`,
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "알림 서버에 연결하지 못했습니다." };
  }
}
