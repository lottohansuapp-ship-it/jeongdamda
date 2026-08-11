import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { signOut } from "@/lib/auth";

/**
 * 관리자 화면 공통 머리.
 *
 * 예전에는 네 화면이 각자 다르게 이동했다. 재고에는 링크 셋이 오른쪽에
 * 한 줄로 붙어 있었고(390px 에서는 들어가지 않는다), 주문·매출에는
 * "재고 관리" 하나뿐, 매장 설정에는 아무것도 없었다.
 * 매출을 보다가 주문으로 가려면 재고를 거쳐야 했다.
 *
 * 넷을 한 줄에 나란히 두고 지금 있는 곳만 진하게 칠한다.
 * 손님 화면 아래 탭과 같은 방식이라 오갈 때 헷갈리지 않는다.
 *
 * 사장님은 매장에서 한 손으로 쓰신다. 그래서
 *   · 상호와 로그아웃은 맨 위 한 줄에 작게 — 매일 누를 것이 아니다
 *   · 화면 이름은 크게 — 지금 어디인지가 먼저다
 *   · 이동 탭은 그 아래, 엄지가 닿는 자리에 44px 로
 */
const TABS = [
  { href: "/admin", label: "재고" },
  { href: "/admin/orders", label: "주문" },
  { href: "/admin/sales", label: "매출" },
  { href: "/admin/store", label: "매장 설정" },
] as const;

interface AdminNavProps {
  /** 지금 화면의 경로. 이 탭만 진하게 칠한다. */
  current: (typeof TABS)[number]["href"];
  /** 화면 이름. h1 으로 그린다 — 한 화면에 하나여야 한다. */
  title: string;
}

export function AdminNav({ current, title }: AdminNavProps) {
  return (
    <header className="pb-4 pt-6">
      <div className="flex items-center justify-between gap-3">
        <Wordmark size="sm" />
        <form action={signOut}>
          <button
            type="submit"
            className="flex min-h-[44px] items-center px-2 text-[13px] text-ink-faint underline underline-offset-4 transition-colors duration-200 hover:text-ink"
          >
            로그아웃
          </button>
        </form>
      </div>

      <h1 className="pt-2 text-[24px] leading-tight">{title}</h1>

      {/*
        넷이 390px 에 한 줄로 들어간다. 좁은 화면에서는 밀어서 본다 —
        접히면 아래 내용이 통째로 움직여서 누르려던 것이 손가락 아래에서
        사라진다. 손님 화면 카테고리에서 겪은 것과 같은 문제다.
      */}
      <nav
        aria-label="관리자 메뉴"
        className="no-scrollbar -mx-5 mt-3 flex flex-nowrap gap-1.5 overflow-x-auto px-5"
      >
        {TABS.map(({ href, label }) => {
          const on = href === current;
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`flex min-h-[44px] shrink-0 items-center rounded-pill px-4 text-[14px] leading-none transition-colors duration-200 ${
                on
                  ? "bg-ink text-white"
                  : "border border-line bg-white text-ink-soft hover:border-olive hover:text-olive-deep"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
