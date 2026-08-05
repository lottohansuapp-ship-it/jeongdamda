import type { MetadataRoute } from "next";
import { missingStoreInfo } from "@/lib/store-info";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * 개업 전에는 검색에 걸리지 않게 한다.
 *
 * 사이트는 이미 공개돼 있는데 아직 임시 반찬이 올라가 있고 사업자정보가 비어 있다.
 * 이 상태로 색인되면 두 가지가 곤란하다. 손님이 검색으로 들어와 없는 반찬을
 * 주문하려 하고, 사업자정보 없는 판매 페이지가 검색 결과에 남는다.
 *
 * 스위치를 따로 두지 않고 사업자정보가 채워졌는지로 판단한다.
 * 환경변수를 하나 더 두면 나중에 "그거 풀어야 하는데" 를 기억하고 있어야 한다.
 * 어차피 사업자정보는 개업 전에 반드시 채워야 하는 것이라, 그걸 채우는 순간
 * 검색이 저절로 열리는 편이 잊어버릴 자리가 없다.
 */
export default function robots(): MetadataRoute.Robots {
  const ready = missingStoreInfo().length === 0;

  if (!ready) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/admin",
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
