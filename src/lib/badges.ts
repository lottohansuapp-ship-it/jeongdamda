/**
 * 뱃지 카탈로그. 여기가 단일 진실이다.
 *
 * label 은 관리자 화면과 손님 화면에서 **똑같이** 쓴다.
 * 사장님이 "추천"을 켰는데 손님 화면에 "BEST"가 뜨면 뭘 켠 건지 알 수 없다.
 *
 * DB(products.badges)는 key 문자열만 담는다. 뱃지를 늘릴 때 마이그레이션이
 * 필요 없도록 check 제약을 걸지 않았다 — 모르는 key 는 화면에서 그냥 무시된다.
 */
export const BADGES = [
  { key: "today", label: "오늘", tone: "olive" },
  { key: "recommend", label: "추천", tone: "clay" },
  { key: "best", label: "인기", tone: "clay" },
  { key: "new", label: "신메뉴", tone: "olive" },
  { key: "deal", label: "특가", tone: "danger" },
] as const;

export type BadgeTone = (typeof BADGES)[number]["tone"];

export interface Badge {
  key: string;
  label: string;
  tone: BadgeTone;
}

/**
 * 뱃지 색. 캐러셀·목록·상세·관리자가 같은 표를 본다.
 *
 * 컴포넌트가 아니라 여기 두는 이유: 화면 형태는 바뀌어도 뱃지의 뜻과 색은 그대로다.
 * 특정 컴포넌트에 두면 그 컴포넌트를 지울 때 다른 화면이 따라 깨진다.
 */
export const BADGE_STYLE: Record<BadgeTone, string> = {
  olive: "bg-olive text-white",
  clay: "bg-white/95 text-clay",
  danger: "bg-danger text-white",
};

/** 사진 위가 아니라 흰 배경 위에 놓을 때. 대비를 다르게 준다. */
export const BADGE_STYLE_INLINE: Record<BadgeTone, string> = {
  olive: "bg-olive-soft text-olive-deep",
  clay: "bg-clay-soft text-clay",
  danger: "bg-danger/10 text-danger",
};

/** 추천 캐러셀이 고르는 기준 */
export const RECOMMEND_KEY = "recommend";

/**
 * 한 상품에 붙일 수 있는 최대 개수.
 * 3개부터는 카드 사진 위에서 겹치고, 무엇을 강조하려는 건지도 흐려진다.
 */
export const MAX_BADGES = 2;

export function canAddBadge(keys: readonly string[] | null): boolean {
  return (keys?.length ?? 0) < MAX_BADGES;
}

/** DB 에 담긴 key 배열을 화면에 쓸 뱃지로 바꾼다. 모르는 key 는 버린다. */
export function resolveBadges(keys: readonly string[] | null): Badge[] {
  if (!keys) return [];

  // BADGES 순서를 따른다. 저장 순서에 따라 화면 순서가 달라지면 안 된다.
  return BADGES.filter((badge) => keys.includes(badge.key)).map((badge) => ({
    ...badge,
  }));
}

export function hasBadge(keys: readonly string[] | null, key: string): boolean {
  return Boolean(keys?.includes(key));
}

/** 켜고 끄기. 불변으로 새 배열을 만든다. */
export function toggleBadge(
  keys: readonly string[] | null,
  key: string,
): string[] {
  const current = keys ?? [];
  return current.includes(key)
    ? current.filter((item) => item !== key)
    : [...current, key];
}
