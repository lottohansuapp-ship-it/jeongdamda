import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * 상품 상세는 넣지 않는다. 매일 바뀌는 URL을 색인시켜 봐야 죽은 링크만 남고,
 * QR이 가리키는 진입점은 어차피 메인 하나다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // lastModified 는 넣지 않는다. new Date() 는 비결정적이라 라우트가 매 요청 렌더로 떨어진다.
    { url: siteUrl, changeFrequency: "daily", priority: 1 },
    // 약관은 PG 심사에서 직접 열어보는 문서다. 색인에도 남겨 둔다.
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/refund`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
