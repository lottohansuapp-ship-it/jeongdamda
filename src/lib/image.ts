/**
 * 사진을 올리기 전에 브라우저에서 줄인다.
 *
 * 요즘 휴대폰 사진은 3~5MB 다. 그런데 이 앱이 사진을 가장 크게 쓰는 자리가
 * 상세 화면이고, 목록은 84px 썸네일이다. 원본을 그대로 올리면
 *
 *   · 반찬 60가지면 스토리지에 300MB 가 쌓인다 (줄이면 10MB 아래다)
 *   · 사장님이 매장에서 올릴 때 휴대폰 데이터를 그만큼 쓴다
 *   · 손님이 처음 볼 때 Vercel 이 원본을 받아 변환하느라 사진이 늦게 뜬다
 *
 * 긴 변 1280px 이면 상세 화면(최대 720px 폭, 2배 화면 기준 1440px)에
 * 충분하고 그 이상은 눈으로 구분되지 않는다.
 */
const MAX_EDGE = 1280;
const QUALITY = 0.82;

/** 이 크기 아래면 다시 인코딩하지 않는다. 손대면 오히려 나빠질 수 있다. */
const SKIP_UNDER_BYTES = 300 * 1024;

async function readImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("이미지를 열지 못했습니다."));
      image.src = url;
    });
    return image;
  } finally {
    // onload 가 끝나면 픽셀은 이미 메모리에 있다. 주소는 놓아 준다.
    URL.revokeObjectURL(url);
  }
}

/**
 * 줄인 파일을 돌려준다.
 *
 * 실패하면 **원본을 그대로 돌려준다.** 사진을 줄이지 못했다고 사장님이
 * 사진을 아예 못 올리게 되면 안 된다. 용량을 아끼는 것보다 올라가는 것이 먼저다.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (file.size <= SKIP_UNDER_BYTES) return file;

  try {
    const image = await readImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    if (scale === 1 && file.type === "image/webp") return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);

    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file; // 줄지 않았으면 의미가 없다

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
      type: "image/webp",
    });
  } catch {
    return file;
  }
}
