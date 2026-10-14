import { normalizePhone } from "./format.ts";

/**
 * 휴대폰 본인인증 결과를 받아도 되는지 판단한다.
 *
 * 순수 함수로 둔 이유: KCP 본인확인 계약이 끝나기 전에는 실제 인증을 해 볼 수가
 * 없다. 그동안 이 판단이 맞는지 확인할 길은 테스트뿐이고, 여기가 틀리면
 * 쿠폰이 새거나(남의 인증을 가져다 씀) 손님이 갇힌다(멀쩡한 인증을 거절함).
 *
 * 포트원 응답은 PG 사마다 채워 주는 칸이 다르다. 번호·CI·DI 모두 "선택" 이다.
 * KCP 가 무엇을 주는지는 계약 때 확인한다. 그래서 있는 것으로 판단하고,
 * 판단할 수 없으면 받지 않는다.
 */
export interface IdentityVerificationRaw {
  status?: string;
  customData?: string;
  verifiedCustomer?: {
    name?: string;
    phoneNumber?: string;
    ci?: string;
    di?: string;
  };
}

export type IdentityCheck =
  | { ok: true; key: string; phone: string; name: string }
  | {
      ok: false;
      reason: "not_verified" | "wrong_user" | "no_key" | "no_phone";
    };

export function checkVerification(
  raw: IdentityVerificationRaw | null,
  userId: string,
): IdentityCheck {
  if (raw?.status !== "VERIFIED") return { ok: false, reason: "not_verified" };

  /*
    인증 건 아이디는 브라우저에서 온다. 남이 인증한 아이디를 알아내 들고 오면
    그 사람 명의로 이 계정이 인증된다. 인증을 시작할 때 customData 에 이 계정
    아이디를 실어 보내고, 포트원이 돌려준 값과 맞춰 본다.
  */
  if (raw.customData !== userId) return { ok: false, reason: "wrong_user" };

  const customer = raw.verifiedCustomer ?? {};

  /*
    "같은 사람" 을 가리는 값. CI 는 어느 사이트에서나 같고, DI 는 이 사이트
    안에서만 같다 — 중복 가입을 막는 데는 둘 다 충분하다.
    둘 다 없으면 받지 않는다. 번호로 대신하면 지금(0024)과 다를 게 없다.
  */
  const key = (customer.ci ?? customer.di ?? "").trim();
  if (!key) return { ok: false, reason: "no_key" };

  const phone = normalizePhone(customer.phoneNumber ?? "");
  if (!phone) return { ok: false, reason: "no_phone" };

  return { ok: true, key, phone, name: (customer.name ?? "").trim() };
}

/**
 * 본인인증을 요구하는가.
 *
 * DB 스위치(store_settings.require_identity)와 채널 키가 **둘 다** 있어야 켠다.
 * 스위치만 켜지고 키가 없으면 인증 창을 띄울 수 없는데, 그렇다고 주문까지
 * 막으면 장사가 멈춘다. 그때는 여기서 꺼진 것으로 보고 주문은 받는다 —
 * 쿠폰은 DB 가 따로 막고 있어서 새지 않는다 (0027).
 */
export function identityEnabled(
  required: boolean | null | undefined,
  channelKey: string,
): boolean {
  return required === true && channelKey.trim() !== "";
}
