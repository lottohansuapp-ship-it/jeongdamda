import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : "yzwsmzharmwgzktmgobj.supabase.co";

const nextConfig: NextConfig = {
  // 상위 폴더의 package-lock.json 때문에 워크스페이스 루트가 잘못 잡히는 것을 막는다
  turbopack: { root: __dirname },
  // 재고 실시간성 + 성능을 태그 무효화로 양립시킨다 (docs/PLAN.md D3)
  cacheComponents: true,
  experimental: {
    serverActions: {
      /*
        서버 액션 요청은 기본 1MB 까지다. 사진 올리기(uploadPhoto)는 5MB 까지
        받도록 만들어 놓고 그 앞에서 1MB 로 잘리고 있었다. 보통은 브라우저가
        먼저 줄여서 넘지 않지만, 줄이기에 실패하면 휴대폰 원본(3~5MB)이 그대로
        가서 오류가 났다. uploadPhoto 의 5MB 검사와 맞춘다.
      */
      bodySizeLimit: "6mb",
    },
  },
  /*
    이미지 최적화 한도를 아껴 쓴다 (2026-11-06 무료 한도가 차서 사진이 깨졌다 → ProductPhoto 가 원본으로 대신 보임).
      · webp 하나만 — 원본이 이미 webp 라 avif 를 더하면 같은 사진을 두 번 줄이게 된다
      · 31일 보관 — 사진을 바꾸면 주소가 바뀌므로(업로드 시각이 파일명) 오래 둬도 옛 사진이 안 남는다
      · 크기 종류를 줄인다 — 화면에서 쓰는 것만(목록 76·84px, 카드 200px, 상세 720px 의 1~2배)
  */
  images: {
    formats: ["image/webp"],
    minimumCacheTTL: 2678400,
    imageSizes: [96, 128, 256, 384],
    deviceSizes: [640, 828, 1080, 1440],
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
