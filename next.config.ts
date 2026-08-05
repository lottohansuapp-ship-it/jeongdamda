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

  /**
   * 보안 헤더.
   *
   * 가장 실질적인 것은 X-Frame-Options 다. 이게 없으면 남이 우리 주문서를
   * 자기 페이지 안에 투명하게 얹어 놓고, 손님이 다른 걸 누르는 줄 알면서
   * 결제 버튼을 누르게 만들 수 있다(클릭재킹). 포트원은 자체 SDK 로 창을
   * 열기 때문에 우리 페이지가 프레임에 들어갈 일이 없어 막아도 안전하다.
   *
   * **스크립트 CSP 는 아직 넣지 않는다.** 포트원 결제창과 다음 우편번호가
   * 외부 스크립트를 불러온다. 결제를 켜고 실기기로 확인하기 전에 걸면
   * 결제가 막히는데, 그건 클릭재킹보다 훨씬 큰 사고다.
   * 결제 스위치를 켜는 날 실제 요청 목록을 보고 함께 넣는다.
   *
   * HSTS 는 Vercel 이 이미 보내고 있어 여기서 중복으로 넣지 않는다.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            // 이 앱은 카메라·마이크·위치를 쓰지 않는다. 쓸 일이 없으면 꺼 둔다.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
