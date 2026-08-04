import { statusMeta } from "@/lib/orders";

const TONE: Record<string, string> = {
  wait: "bg-cream text-clay",
  live: "bg-olive-soft text-olive-deep",
  done: "bg-canvas text-ink-faint",
  dead: "bg-canvas text-ink-faint",
};

/** 상태 뱃지. 손님 화면과 관리자 화면이 같은 말, 같은 색을 쓴다. */
export function StatusPill({ status }: { status: string }) {
  const meta = statusMeta(status);

  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center rounded-pill px-2.5 text-[12.5px] ${TONE[meta.tone]}`}
    >
      {meta.label}
    </span>
  );
}
