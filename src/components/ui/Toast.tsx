/**
 * 화면 아래 잠깐 뜨는 알림. 내 정보·관리자 반찬·매장 설정이 같이 쓴다.
 *
 * 세 군데가 각자 복사해 갖고 있었고 색을 hex 로 박아 두었다(#c9302c 등).
 * 하단 탭 위로 띄운다 — 예전엔 bottom-6 이라 내 정보 화면에서 탭을 덮었다.
 * 오류는 alert 로 알린다. status 는 스크린리더가 하던 말을 마친 뒤에야 읽는다.
 */
export function Toast({ message, tone }: { message: string; tone: "error" | "notice" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-[420px] rounded-card px-4 py-3.5 text-[13.5px] leading-relaxed text-white shadow-lift ${
        tone === "error" ? "bg-danger-deep" : "bg-ink"
      }`}
    >
      {message}
    </div>
  );
}
