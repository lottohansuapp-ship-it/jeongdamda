"use client";

import { useRouter } from "next/navigation";

/**
 * 반찬 목록으로 돌아가기.
 *
 * 예전엔 <Link href="/"> 였다. 새 화면으로 넘어가는 것이라 서른 번째 반찬을 보던
 * 손님이 목록 맨 위로 떨어졌고, 기록이 하나 더 쌓여 휴대폰 뒤로가기는 다시
 * 이 상세로 돌아왔다. 목록에서 왔다면 진짜 뒤로가기를 한다 — 위치와 카테고리가 남는다.
 *
 * 목록에서 왔는지는 sessionStorage 표시로 안다(ShopBrowser 가 남긴다).
 * document.referrer 는 앱 안에서 화면을 바꿔도 처음 들어온 곳 그대로라 쓸 수 없다.
 * 검색에서 바로 들어온 손님에게 뒤로가기를 하면 검색 화면으로 나가 버린다 — 그땐 홈으로.
 */
const FROM_LIST_KEY = "jeongdamda-from-list";

export function markFromList() {
  try {
    sessionStorage.setItem(FROM_LIST_KEY, "1");
  } catch {
    // 사생활 보호 모드 등에서 막힐 수 있다. 그러면 홈으로 보내면 된다.
  }
}

function cameFromList(): boolean {
  try {
    return sessionStorage.getItem(FROM_LIST_KEY) === "1" && window.history.length > 1;
  } catch {
    return false;
  }
}

export function BackToList({ variant }: { variant: "pill" | "icon" }) {
  const router = useRouter();

  function goBack() {
    if (cameFromList()) router.back();
    else router.push("/");
  }

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={goBack}
        aria-label="반찬 목록으로 돌아가기"
        className="tap-target grid place-items-center rounded-full bg-white/90 text-ink shadow-soft backdrop-blur-sm transition-transform duration-200 active:scale-95"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex h-12 items-center rounded-pill border border-line bg-white px-6 text-[14px] text-ink-soft transition-colors duration-200 hover:border-ink-faint"
    >
      다른 반찬 더 보기
    </button>
  );
}
