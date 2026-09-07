import { NextResponse } from "next/server";

/**
 * 지금 배포된 코드가 어느 커밋인지.
 *
 * 배포가 실제로 반영됐는지 확인할 방법이 없어 여러 번 헤맸다. 고친 곳이
 * 대부분 로그인 뒤 화면이라 밖에서는 보이지 않고, Vercel 의 Redeploy 버튼은
 * **그 시점 커밋을 다시 빌드**해서 최신 코드가 안 올라간다. 그래서
 * "고쳤는데 그대로다" 가 코드 문제인지 배포 문제인지 가릴 수가 없었다.
 *
 * 커밋 해시와 제목만 내보낸다. 비밀이 아니고, 이걸로 5초 만에 가려진다.
 */
export async function GET() {
  return NextResponse.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE?.split("\n")[0] ?? null,
  });
}
