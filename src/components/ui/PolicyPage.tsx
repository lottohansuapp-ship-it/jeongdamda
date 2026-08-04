import Link from "next/link";
import { SiteFooter } from "./SiteFooter";

/**
 * 약관·정책 문서의 공통 껍데기.
 * PG 심사에서 실제로 열어보는 화면이라 링크가 끊기거나 형식이 제각각이면 안 된다.
 */
export function PolicyPage({
  title,
  effectiveFrom,
  children,
}: {
  title: string;
  /** 시행일. 심사에서 확인하는 항목이다. */
  effectiveFrom: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-5 pb-16">
      <header className="pb-6 pt-10">
        <Link href="/" className="text-[13px] text-ink-soft">
          ← 반찬 보러가기
        </Link>
        <h1 className="pt-3 text-[26px] leading-tight">{title}</h1>
        <p className="pt-2 text-[13px] text-ink-faint">시행일 {effectiveFrom}</p>
      </header>

      <div className="space-y-7 text-[14px] leading-[1.85] text-ink-soft">
        {children}
      </div>

      <SiteFooter />
    </main>
  );
}

/** 조항 하나. 제목과 본문 간격을 문서 전체가 같게 유지한다. */
export function Article({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="pb-2 text-[16px] leading-snug text-ink">{heading}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5 pl-5">
      {items.map((item, index) => (
        <li key={index} className="list-disc">
          {item}
        </li>
      ))}
    </ul>
  );
}
