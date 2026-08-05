import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "정, 담따 반찬가게",
    template: "%s · 정, 담따",
  },
  description:
    "오늘 아침에 만든 반찬을 남은 수량까지 그대로 보여드립니다. 픽업과 배달 모두 됩니다.",
  applicationName: "정, 담따",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "정, 담따 반찬가게",
    title: "정, 담따 반찬가게",
    description: "오늘 준비된 반찬과 남은 수량을 실시간으로 확인하세요.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#6B8E23",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        {/*
          홈에서 하단 탭까지 가려면 반찬 60줄 × (이름 링크 + 담기 버튼) 을
          지나야 한다 — 탭을 120번 눌러야 주문내역으로 갈 수 있었다.
          스크린리더는 랜드마크로 건너뛸 수 있지만, 스크린리더를 안 쓰는
          키보드·스위치 사용자에게는 이 링크가 유일한 지름길이다.
          평소엔 안 보이고 탭으로 닿았을 때만 나타난다.
        */}
        <a
          href="#main-nav"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-card focus:bg-ink focus:px-4 focus:py-3 focus:text-[14px] focus:text-white"
        >
          메뉴로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
