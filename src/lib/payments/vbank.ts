import { formatClockTime, parseClockTime } from "../store.ts";

/**
 * 가상계좌 입금 (2026-10-15 사용자 결정: 실시간 계좌이체 대신, 입금 기한 30분,
 * 입금된 주문의 환불은 사장님이 손님 계좌로 직접 이체).
 *
 * 브라우저와 서버가 같이 쓰는 순수 함수만 둔다.
 */

/** 입금 기한. 오늘 만든 반찬이라 오래 묶어 두면 다른 손님이 못 산다. */
export const VBANK_MINUTES = 30;

/**
 * 가상계좌로 고를 수 있는 픽업 시간.
 *
 * 사장님은 입금이 확인돼야 주문을 본다. 그런데 예전엔 15분 뒤 픽업을 고르고 30분 기한의
 * 계좌를 받을 수 있었다 — 입금이 늦으면 손님은 왔는데 반찬은 준비 전이다.
 * 그래서 평소 가장 이른 시간(지금 + 준비 시간)에서 입금 기한만큼 미룬다.
 *
 * ponytail: 지금 시각 대신 첫 슬롯을 기준으로 잰다(브라우저 시계를 믿지 않으려고).
 * 슬롯 간격(30분)이 기한과 같아서 정확하다. 개점 전 주문은 한 칸 더 보수적이다.
 */
export function vbankPickupSlots(slots: readonly string[]): string[] {
  if (slots.length === 0) return [];
  const cutoff = formatClockTime(parseClockTime(slots[0]) + VBANK_MINUTES);
  // "HH:MM" 은 두 자리라 글자 비교가 곧 시각 비교다
  return slots.filter((value) => value >= cutoff);
}

/**
 * 결제창에 넘길 입금 기한 — 지금부터 30분 뒤, 시간대가 붙은 ISO8601(한국 시간).
 * 예: 2026-10-15T12:30:00+09:00
 *
 * SDK 타입 설명은 `YYYYMMDDHHmmss` 도 된다고 적혀 있지만 실제 포트원 서버는 거절했다
 * ("유효한 ISO8601 형식(…Z 또는 …±hh:mm)만 허용", 2026-10-15). 그 메시지를 따른다.
 * KCP 가 실제로 정한 기한은 발급 뒤 포트원 조회(expiredAt)로 다시 받아 그 값을 믿는다(confirm.ts).
 */
export function vbankDueDate(now: Date): string {
  const due = new Date(now.getTime() + VBANK_MINUTES * 60_000);
  // 한국은 서머타임이 없어 +9시간 고정이다. 더해서 UTC 로 읽으면 한국 시각이 나온다.
  const kst = new Date(due.getTime() + 9 * 3600_000).toISOString();
  return `${kst.slice(0, 19)}+09:00`;
}

/**
 * KCP 가 가상계좌를 내 주는 은행(포트원 KCP V2 문서)과 흔한 은행만 적는다.
 * 모르는 코드는 그대로 보여 준다 — 비워 두면 손님이 어느 은행인지 모른다.
 */
const BANKS: Record<string, string> = {
  INDUSTRIAL_BANK_OF_KOREA: "IBK기업은행",
  KOOKMIN_BANK: "국민은행",
  SUHYUP_BANK: "수협은행",
  NH_NONGHYUP_BANK: "NH농협은행",
  LOCAL_NONGHYUP: "지역농협",
  WOORI_BANK: "우리은행",
  SC_BANK_KOREA: "SC제일은행",
  CITI_BANK_KOREA: "씨티은행",
  DAEGU_BANK: "iM뱅크(대구)",
  BUSAN_BANK: "부산은행",
  GWANGJU_BANK: "광주은행",
  JEJU_BANK: "제주은행",
  JEONBUK_BANK: "전북은행",
  KYONGNAM_BANK: "경남은행",
  KFCC: "새마을금고",
  EPOST: "우체국",
  HANA_BANK: "하나은행",
  SHINHAN_BANK: "신한은행",
  KAKAO_BANK: "카카오뱅크",
  K_BANK: "케이뱅크",
  TOSS_BANK: "토스뱅크",
};

export function bankLabel(code: string | null | undefined): string {
  if (!code) return "";
  return BANKS[code] ?? code;
}
