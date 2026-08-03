const KRW = new Intl.NumberFormat("ko-KR");

/** 원화는 소수점이 없다. price는 항상 정수. */
export function formatPrice(price: number): string {
  return `${KRW.format(Math.round(price))}원`;
}

/** 검색 매칭용 정규화 — 공백 제거 + 소문자 */
export function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

/**
 * 휴대폰 번호를 010-1234-5678 로 통일한다. 형식이 아니면 null.
 * 알림톡과 주문 연락이 이 형식을 기대하므로 저장 전에 반드시 통과시킨다.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11) return null;
  if (!digits.startsWith("01")) return null;

  return digits.length === 10
    ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    : `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
