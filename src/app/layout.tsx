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
  // --color-canvas. 메타데이터는 CSS 변수를 못 읽어 값을 적는다 (manifest.ts 와 같은 값).
  themeColor: "#FAFAF8",
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
        {children}
      </body>
    </html>
  );
}
