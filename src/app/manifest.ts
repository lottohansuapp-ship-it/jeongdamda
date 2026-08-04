import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "정, 담따 반찬가게",
    // 홈 화면 아이콘 아래 뜨는 이름. 길면 잘리므로 상호만 남긴다.
    short_name: "정,담따",
    description: "오늘 준비된 반찬과 남은 수량을 실시간으로 확인하세요.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAFAF8",
    theme_color: "#6B8E23",
    lang: "ko",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
