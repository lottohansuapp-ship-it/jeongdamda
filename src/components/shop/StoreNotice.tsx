/**
 * 사장님이 매장 설정에 적은 공지 한 줄.
 *
 * "오늘은 김치가 일찍 나갔어요", "설 연휴 3일 쉽니다" 같은, 그날그날 손님이
 * 알아야 하는 말이다. 상품 목록보다 위에 둔다 — 반찬을 다 고르고 나서 알면 늦다.
 *
 * 비어 있으면 아무것도 그리지 않는다. 빈 상자가 자리를 차지하면 안 된다.
 */
export function StoreNotice({ notice }: { notice: string | null }) {
  const text = notice?.trim();
  if (!text) return null;

  // role="status" 였는데 이건 페이지가 열릴 때부터 있는 정적 공지다.
  // 주문 상세·관리자는 15~60초마다 화면을 다시 그리는데, 그때마다
  // 바뀌지도 않은 공지를 다시 읽을 수 있다. aside 가 뜻에 맞다.
  return (
    <aside
      aria-label="매장 공지"
      className="flex gap-2.5 rounded-card bg-cream px-4 py-3.5"
    >
      <SpeakerIcon />
      <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed">{text}</p>
    </aside>
  );
}

function SpeakerIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="mt-px h-[18px] w-[18px] shrink-0 text-clay"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10v4a1 1 0 0 0 1 1h3l5 4V5L8 9H5a1 1 0 0 0-1 1Z" />
      <path d="M17 9.5a3.5 3.5 0 0 1 0 5" />
    </svg>
  );
}
