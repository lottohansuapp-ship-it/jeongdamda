import Image from "next/image";

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
  if (photoPath && BASE) {
    return (
      <Image
        src={`${BASE}/storage/v1/object/public/product-photos/${photoPath}`}
        alt={name}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "lazy"}
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
