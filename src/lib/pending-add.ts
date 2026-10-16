/**
 * 로그인 전에 누른 「담기」 를 로그인 뒤 이어서 처리한다.
 *
 * 예전엔 로그인 안 한 손님이 + 를 누르면 로그인으로 넘어갔다가, 돌아와 보면 누른
 * 반찬이 안 담겨 있어서 한 번 더 눌러야 했다. 처음 담는 순간에 흐름이 두 번 끊겼다.
 * 그래서 넘어가기 전에 무엇을 담으려 했는지(와 목록의 어디쯤이었는지) 적어 둔다.
 *
 * sessionStorage 다 — 이 탭에서만, 10분 동안만. 로그인을 포기하고 한참 뒤 돌아온
 * 손님에게 엉뚱한 반찬이 담기면 안 된다. 재고는 여기서 잡지 않는다(담기만 한다).
 */
export interface PendingAdd {
  productId: string;
  quantity: number;
  /** 목록에서 눌렀으면 그때의 스크롤 위치. 돌아와서 그 자리로 간다. */
  scrollY?: number;
  savedAt: number;
}

const KEY = "jeongdamda-pending-add";
export const PENDING_TTL_MS = 10 * 60_000;

/** 저장된 값을 읽는다. 형식이 틀렸거나 10분이 지났으면 null. */
export function parsePendingAdd(raw: string | null, now: number): PendingAdd | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingAdd>;
    if (typeof value.productId !== "string" || !value.productId) return null;
    if (typeof value.quantity !== "number" || value.quantity < 1) return null;
    if (typeof value.savedAt !== "number" || now - value.savedAt > PENDING_TTL_MS) return null;
    return {
      productId: value.productId,
      quantity: Math.floor(value.quantity),
      ...(typeof value.scrollY === "number" ? { scrollY: value.scrollY } : {}),
      savedAt: value.savedAt,
    };
  } catch {
    return null;
  }
}

export function savePendingAdd(pending: Omit<PendingAdd, "savedAt">) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...pending, savedAt: Date.now() }));
  } catch {
    // 막힌 브라우저면 예전처럼 돌아와서 한 번 더 누르게 된다.
  }
}

/**
 * 꺼내면서 지운다 — 두 번 담기지 않게. accept 가 아니라고 하면 그대로 둔다
 * (상세 화면은 자기 반찬일 때만 가져간다).
 */
export function takePendingAdd(
  accept: (pending: PendingAdd) => boolean = () => true,
): PendingAdd | null {
  try {
    const pending = parsePendingAdd(sessionStorage.getItem(KEY), Date.now());
    if (!pending) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    if (!accept(pending)) return null;
    sessionStorage.removeItem(KEY);
    return pending;
  } catch {
    return null;
  }
}
