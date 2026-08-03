import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "오늘의 반찬",
    template: "%s · 오늘의 반찬",
  },
  description:
    "오늘 만든 반찬을 지금 남은 수량까지 그대로 보여드립니다. 매장에서 QR을 찍고 바로 확인하세요.",
  applicationName: "오늘의 반찬",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "오늘의 반찬",
    title: "오늘의 반찬",
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
        {children}
      </body>
    </html>
  );
}
