/**
 * 반찬 사진을 한 번에 올린다.
 *
 * 관리자 화면에서 39번 고르고 기다리는 대신 한 번에 끝낸다.
 * 0020 마이그레이션으로 상품이 들어간 뒤에 돌린다 — 이름으로 짝을 찾기 때문이다.
 *
 *   node scripts/upload-photos.mjs
 *
 * 비밀번호는 실행할 때 직접 입력받고 어디에도 저장하지 않는다. 화면에도 안 찍힌다.
 * service_role 키를 쓰지 않는 이유이기도 하다 — 그 키는 RLS 를 통째로 우회해서
 * 한 번 새면 손님 정보까지 열린다. 관리자로 로그인하면 is_admin() 정책이
 * 그대로 걸려서 권한이 딱 필요한 만큼이다.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";

const PHOTO_DIR = "menu-import/photos";
const BUCKET = "product-photos";

/** 브라우저 업로드와 같은 기준 (src/lib/image.ts). 상세 화면이 720px 이라 이 이상은 눈에 안 보인다. */
const MAX_EDGE = 1280;
const QUALITY = 82;

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 가 없습니다. .env.local 을 확인해 주세요.`);
  return value;
}

/** 화면에 안 보이게 입력받는다. 어깨너머로 보이는 것도 유출이다. */
async function askHidden(question) {
  process.stdout.write(question);
  const wasRaw = Boolean(process.stdin.isRaw);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();

  const value = await new Promise((resolve) => {
    let buffer = "";
    const onData = (chunk) => {
      const char = chunk.toString("utf8");
      if (char === "\r" || char === "\n") {
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(buffer);
      } else if (char === "") {
        process.exit(1);
      } else if (char === "" || char === "\b") {
        buffer = buffer.slice(0, -1);
      } else {
        buffer += char;
      }
    };
    process.stdin.on("data", onData);
  });

  process.stdin.setRawMode?.(wasRaw);
  process.stdin.pause();
  return value;
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = await rl.question("관리자 이메일: ");
  rl.close();
  const password = await askHidden("비밀번호(안 보입니다): ");

  const db = createClient(url, anonKey);
  const { error: signInError } = await db.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (signInError) throw new Error(`로그인 실패: ${signInError.message}`);

  // 관리자가 맞는지 먼저 본다. 아니면 아래 쓰기가 0행으로 조용히 지나간다 (0004 에서 배운 것).
  const { data: isAdmin } = await db.rpc("is_admin");
  if (!isAdmin) throw new Error("이 계정은 관리자가 아닙니다.");

  const { data: products, error: readError } = await db
    .from("products")
    .select("id, name, photo_path");
  if (readError) throw new Error(`상품을 읽지 못했습니다: ${readError.message}`);

  const byName = new Map(products.map((p) => [p.name.normalize("NFC"), p]));
  const files = (await readdir(PHOTO_DIR)).filter((f) =>
    /\.(png|jpe?g|webp)$/i.test(f),
  );

  console.log(`\n상품 ${products.length}개, 사진 ${files.length}장`);

  const orphans = files.filter(
    (f) => !byName.has(basename(f, extname(f)).normalize("NFC")),
  );
  if (orphans.length > 0) {
    console.log(`\n짝을 못 찾은 사진 ${orphans.length}장 (건너뜁니다):`);
    for (const f of orphans) console.log(`  ${f}`);
    console.log("");
  }

  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  let done = 0;
  let saved = 0;

  for (const file of files) {
    const name = basename(file, extname(file)).normalize("NFC");
    const product = byName.get(name);
    if (!product) continue;

    const original = await readFile(join(PHOTO_DIR, file));
    // 휴대폰 사진은 장당 2~5MB 다. 그대로 올리면 39장에 100MB 가 쌓이고,
    // 손님이 처음 볼 때 Vercel 이 원본을 받아 변환하느라 사진이 늦게 뜬다.
    const shrunk = await sharp(original)
      .rotate() // EXIF 방향을 픽셀에 반영한다. 빼면 사진이 눕거나 뒤집힌다.
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: QUALITY })
      .toBuffer();

    const path = `${product.id}/${Date.now()}.webp`;
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(path, shrunk, { contentType: "image/webp", upsert: true });
    if (uploadError) {
      console.log(`  x ${name}: ${uploadError.message}`);
      continue;
    }

    const { error: updateError } = await db
      .from("products")
      .update({ photo_path: path })
      .eq("id", product.id);
    if (updateError) {
      console.log(`  x ${name}: ${updateError.message}`);
      continue;
    }

    // 바꾸기 전 사진이 있으면 지운다. 안 그러면 버킷에 안 쓰는 파일이 쌓인다.
    if (product.photo_path && product.photo_path !== path) {
      await db.storage.from(BUCKET).remove([product.photo_path]);
    }

    done += 1;
    saved += original.length - shrunk.length;
    console.log(
      `  ${String(done).padStart(2)}/${files.length}  ${name}  ` +
        `${mb(original.length)}MB -> ${mb(shrunk.length)}MB`,
    );
  }

  console.log(`\n올린 사진 ${done}장, 아낀 용량 약 ${mb(saved)}MB`);

  /*
   * 여기서 끝내면 안 된다.
   *
   * 목록·상세는 'use cache' + cacheLife('max') 라 시간으로는 만료되지 않는다.
   * 캐시를 깨는 건 앱을 거친 변경이 부르는 updateTag(PRODUCTS_TAG) 뿐인데,
   * 이 스크립트는 DB 에 직접 쓰기 때문에 그걸 부르지 못한다.
   *
   * 그래서 사진이 다 올라갔는데도 손님 화면에는 회색 자리만 계속 보인다.
   * 오류가 안 나서 아무도 눈치채지 못하는 종류다 — 실제로 한 번 겪었다.
   */
  console.log("\n" + "-".repeat(52));
  console.log("아직 손님 화면에는 안 보입니다. 한 가지가 남았습니다.");
  console.log("");
  console.log("  관리자 화면(/admin)에서 아무 반찬의 재고를 한 번 바꿔 주세요.");
  console.log("  그 순간 목록 캐시가 갱신되면서 사진이 전부 나타납니다.");
  console.log("");
  console.log("  이 스크립트는 DB 에 직접 써서 앱의 캐시를 깨지 못합니다.");
  console.log("  목록 캐시는 시간이 지나도 스스로 만료되지 않습니다.");
  console.log("-".repeat(52));
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exit(1);
});
