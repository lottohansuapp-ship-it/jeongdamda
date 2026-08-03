import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-24 text-center">
      <p className="text-[14px] text-ink-faint">오늘의 반찬</p>
      <h1 className="pt-2 text-[24px] leading-tight">찾으시는 반찬이 없어요</h1>
      <p className="pt-3 text-[14px] leading-relaxed text-ink-soft">
        오늘 판매가 끝났거나 메뉴에서 내려간 반찬일 수 있어요.
      </p>
      <div className="pt-8">
        <Link
          href="/"
          className="inline-flex h-12 items-center rounded-pill bg-olive px-6 text-[14px] text-white transition-colors duration-200 hover:bg-olive-deep"
        >
          오늘의 반찬 보러가기
        </Link>
      </div>
    </main>
  );
}
