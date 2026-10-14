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
    // 화면 배경(--color-canvas)과 같은 색. 상태바와 화면이 한 장으로 이어져 앱처럼 보인다.
    theme_color: "#FAFAF8",
    lang: "ko",
    // PNG 를 같이 둔다. SVG 만 있으면 일부 안드로이드 런처가 아이콘을 못 그리고,
    // 마스크용에 같은 SVG 를 쓰면 원형으로 깎일 때 아래 받침이 잘린다.
    // PNG 는 icon.svg 에서 뽑았다 — 그림을 바꾸면 PNG 도 다시 뽑는다.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
