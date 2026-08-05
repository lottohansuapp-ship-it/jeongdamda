import Link from "next/link";
import { Suspense } from "react";
import { CartBadge } from "./CartBadge";

/**
 * 서버 컴포넌트다. 클라이언트 컴포넌트로 만들고 usePathname 으로 활성 탭을 고르면
 * 안쪽의 CartBadge(쿠키를 읽는 비동기 서버 컴포넌트)가 Suspense 경계 밖으로 새어나가
 * 프리렌더가 깨진다. 그래서 활성 탭은 각 페이지가 prop 으로 알려준다.
 *
 * 상세 페이지에는 붙이지 않는다 — 하단에 담기 바가 이미 고정돼 있다.
 */
export type NavTab = "home" | "cart" | "orders" | "account";

const TABS = [
  { key: "home", href: "/", label: "홈", Icon: HomeIcon },
  { key: "cart", href: "/cart", label: "장바구니", Icon: BagIcon },
  { key: "orders", href: "/orders", label: "주문내역", Icon: ReceiptIcon },
  { key: "account", href: "/account", label: "내 정보", Icon: UserIcon },
] as const;

export function BottomNav({ active }: { active: NavTab }) {
  return (
    <nav
      aria-label="주요 메뉴"
      className="sticky bottom-0 z-30 mt-auto border-t border-line bg-white/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
      <ul className="mx-auto flex max-w-[560px]">
        {TABS.map(({ key, href, label, Icon }) => {
          const on = key === active;

          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[12.5px] transition-colors duration-200 ${
                  on ? "text-olive-deep" : "text-ink-faint"
                }`}
              >
                <span className="relative">
                  <Icon active={on} />
                  {key === "cart" && (
                    <Suspense fallback={null}>
                      <CartBadge />
                    </Suspense>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function HomeIcon({ active }: { active: boolean }) {
  const d = "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z";
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" {...STROKE}>
      <path d={d} />
      {active && <path d={d} fill="currentColor" opacity=".12" />}
    </svg>
  );
}

function BagIcon({ active }: { active: boolean }) {
  const d = "M6 8h12l-1 11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z";
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" {...STROKE}>
      <path d={d} />
      <path d="M9.5 8V6.5a2.5 2.5 0 0 1 5 0V8" />
      {active && <path d={d} fill="currentColor" opacity=".12" />}
    </svg>
  );
}

function ReceiptIcon({ active }: { active: boolean }) {
  const d = "M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6L6 20.5z";
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" {...STROKE}>
      <path d={d} />
      <path d="M9.5 8.5h5M9.5 12h5" />
      {active && <path d={d} fill="currentColor" opacity=".12" />}
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" {...STROKE}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
      {active && (
        <circle cx="12" cy="8.5" r="3.5" fill="currentColor" opacity=".12" />
      )}
    </svg>
  );
}
