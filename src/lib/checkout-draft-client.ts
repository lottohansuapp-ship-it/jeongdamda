import { DRAFT_COOKIE, encodeDraft, type CheckoutDraft } from "./checkout-draft";

export type { CheckoutDraft };

/**
 * 브라우저에서 쿠키를 쓰는 쪽. 순수 로직(checkout-draft.ts)과 나눠 둔다 —
 * 서버가 읽는 모듈에 document 접근이 섞이면 안 된다.
 *
 * path 를 /checkout 으로 묶는 게 핵심이다. 이러면 이 쿠키는 주문서를 열 때만
 * 실려 나가고, 홈·상세·이미지 요청은 한 글자도 무거워지지 않는다.
 */
const ONE_HOUR = 3600;

function write(value: string, maxAge: number) {
  document.cookie = `${DRAFT_COOKIE}=${value}; path=/checkout; max-age=${maxAge}; samesite=lax`;
}

export function saveDraft(draft: CheckoutDraft): void {
  write(encodeDraft(draft), ONE_HOUR);
}

/** 주문이 만들어졌으면 지운다. 다음 주문까지 들고 있을 이유가 없다. */
export function clearDraft(): void {
  write("", 0);
}
