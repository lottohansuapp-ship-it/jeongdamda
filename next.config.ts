import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "yzwsmzharmwgzktmgobj.supabase.co";

const nextConfig: NextConfig = {
  // 상위 폴더의 package-lock.json 때문에 워크스페이스 루트가 잘못 잡히는 것을 막는다
  turbopack: { root: __dirname },
  // 재고 실시간성 + 성능을 태그 무효화로 양립시킨다 (docs/PLAN.md D3)
  cacheComponents: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
