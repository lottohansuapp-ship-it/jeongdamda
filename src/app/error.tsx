"use client";

import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";

/**
 * 화면을 그리다 실패했을 때. 예전엔 이 파일이 없어서 Next 기본 영문 오류
 * 화면이 떴고, 장바구니·주문내역은 실패를 "비어 있음" 으로 보여 줬다.
 *
 * 오류 원문은 보여 주지 않는다. 운영에서는 Next 가 서버 오류를 일련번호로만
 * 넘기고(digest), 원문은 서버 로그에 남는다. 전화 주신 손님에게 그 번호를 받으면
 * Vercel 로그에서 찾을 수 있다.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-5 py-24 text-center">
      <Wordmark size="sm" className="justify-center" />
      <h1 className="pt-3 text-[24px] leading-tight">잠시 불러오지 못했어요</h1>
      <p className="pt-3 text-[14px] leading-relaxed text-ink-soft">
        담아 두신 반찬과 주문은 그대로 있어요. 잠깐 뒤 다시 시도해 주세요.
      </p>
      <div className="flex flex-col gap-2.5 pt-8">
        <button
          type="button"
          onClick={() => retry()}
          className="h-12 rounded-pill bg-olive px-6 text-[14px] text-white transition-colors duration-200 hover:bg-olive-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-pill border border-line bg-white px-6 text-[14px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
        >
          오늘 반찬 보러가기
        </Link>
      </div>
      {error.digest && (
        <p className="pt-6 text-[11.5px] text-ink-faint">오류 번호 {error.digest}</p>
      )}
    </main>
  );
}
