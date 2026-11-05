"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** 사진이 아직 없는 반찬은 이름에서 만든 고정 색조의 면으로 채운다. 회색 박스는 쓰지 않는다. */
const TONES = [
  ["#f3ede1", "#e4d8c3"],
  ["#eef2e3", "#dbe4c8"],
  ["#f8ece1", "#efd8c2"],
  ["#eceef1", "#dbe0e6"],
  ["#f6ece9", "#e8d3cd"],
  ["#f0f1e8", "#dfe1cf"],
] as const;

function toneFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  return TONES[hash % TONES.length];
}

interface ProductPhotoProps {
  name: string;
  photoPath: string | null;
  priority?: boolean;
  sizes: string;
  className?: string;
}

export function ProductPhoto({
  name,
  photoPath,
  priority = false,
  sizes,
  className = "",
}: ProductPhotoProps) {
  /*
    사진 줄이기(Vercel 이미지 최적화)가 실패하면 원본 사진을 그대로 보여 준다.

    2026-11-06 실제로 깨졌다: Vercel 무료 요금제의 이미지 최적화 한도가 차서, 아직 줄여 둔 적 없는
    크기(관리자 목록 76px 등)는 402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED 를 받았다. 파일은 멀쩡한데
    화면에는 깨진 그림이 떴다. 원본은 조금 무겁지만(평균 150KB) 깨진 그림보다 낫다.

    화면이 준비되기 전에 이미 실패한 사진은 onError 가 오지 않는다 — 처음 그릴 때 한 번 더 본다.
  */
  const ref = useRef<HTMLImageElement>(null);
  const [direct, setDirect] = useState(false);

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setDirect(true);
  }, []);

  if (photoPath && BASE) {
    return (
      <Image
        ref={ref}
        src={`${BASE}/storage/v1/object/public/product-photos/${photoPath}`}
        alt={name}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        unoptimized={direct}
        onError={() => setDirect(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  const [from, to] = toneFor(name);

  return (
    <div
      aria-hidden
      className={`absolute inset-0 grid place-items-center ${className}`}
      style={{ background: `linear-gradient(145deg, ${from}, ${to})` }}
    >
      <span className="px-3 text-center text-[13px] leading-tight tracking-tight text-ink/35">
        {name}
      </span>
    </div>
  );
}
