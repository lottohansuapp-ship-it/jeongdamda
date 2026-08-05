import Link from "next/link";
import { Wordmark } from "./Wordmark";
import { storeInfoRows, STORE_INFO } from "@/lib/store-info";

/**
 * 사업자 정보 푸터.
 *
 * 전자상거래법은 이 항목들을 **초기화면**에 표시하라고 정한다.
 * 포트원·PG 심사도 신청 시점에 이 화면이 이미 있어야 통과한다.
 *
 * 안 채운 값은 감추지 않고 "미등록"으로 남긴다. 감추면 다 갖춰진 것처럼 보여
 * 그대로 심사를 넣게 된다.
 */
const POLICIES = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/refund", label: "취소·환불 정책" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line pt-8 text-[12px] leading-relaxed text-ink-faint">
      <Wordmark size="sm" />

      {/* 글자만 두면 높이가 20px 라 어르신 손가락으로 맞추기 어렵다.
          위아래 여백으로 누르는 자리를 44px 로 넓힌다 — 글자 크기와 줄 배치는
          그대로다. 법으로 걸어 둔 링크일수록 닿을 수 있어야 한다. */}
      <nav aria-label="약관" className="flex flex-wrap gap-x-4 pt-2">
        {POLICIES.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-[44px] items-center text-[12.5px] text-ink-soft underline underline-offset-4"
          >
            {label}
          </Link>
        ))}
      </nav>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pt-4">
        {storeInfoRows().map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="whitespace-nowrap">{label}</dt>
            <dd className={value ? "" : "text-danger"}>{value || "미등록"}</dd>
          </div>
        ))}
      </dl>

      {/* "전화로 주세요" 라고 안내하면서 정작 그 번호가 19px 이었다.
          어르신이 가장 자주 누를 링크라 글자도 키우고 자리도 넓힌다. */}
      <p className="pt-2">
        <a
          href={`tel:${STORE_INFO.phone}`}
          className="inline-flex min-h-[44px] items-center pr-2 text-[14px] text-ink-soft underline underline-offset-4"
        >
          {STORE_INFO.phone}
        </a>
        <span className="block">문의는 영업시간 안에 전화로 주세요</span>
      </p>

      <p className="pt-3">
        {STORE_INFO.name}은(는) 통신판매중개자가 아닌 통신판매당사자로서, 판매하는
        상품과 거래에 대한 책임을 집니다.
      </p>

      <p>
        <Link
          href="/admin"
          className="inline-flex min-h-[44px] items-center pr-2 underline underline-offset-4"
        >
          사장님 로그인
        </Link>
      </p>
    </footer>
  );
}
