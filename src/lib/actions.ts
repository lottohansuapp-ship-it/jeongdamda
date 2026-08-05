"use server";

import { updateTag } from "next/cache";
import { currentUserId, serverClient } from "./supabase/server";
import { PRODUCTS_TAG } from "./queries";
import type { ActionResult, Product } from "@/types/database";

type ProductPatch = Partial<
  Pick<
    Product,
    | "category_id"
    | "name"
    | "description"
    | "price"
    | "origin"
    | "allergy"
    | "storage"
    | "pairing"
    | "photo_path"
    | "today_stock"
    | "today_available"
    | "badges"
    | "sort_order"
  >
>;

/** 로그인 여부만 본다. 관리자인지는 is_admin() RLS 정책이 판단한다 (앱 코드는 방어선이 아니다). */
async function authed() {
  return (await currentUserId()) ? await serverClient() : null;
}

export async function updateProduct(
  id: string,
  patch: ProductPatch,
): Promise<ActionResult> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  if (patch.today_stock !== undefined && patch.today_stock < 0) {
    return { ok: false, error: "재고는 0보다 작을 수 없습니다." };
  }
  if (patch.price !== undefined && patch.price < 0) {
    return { ok: false, error: "가격은 0보다 작을 수 없습니다." };
  }

  const { error } = await db.from("products").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  updateTag(PRODUCTS_TAG);
  return { ok: true, data: undefined };
}

export async function createProduct(
  input: ProductPatch & { name: string; price: number; category_id: string },
): Promise<ActionResult<{ id: string }>> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  if (!input.name.trim()) return { ok: false, error: "상품명을 입력하세요." };
  if (input.price < 0) return { ok: false, error: "가격은 0보다 작을 수 없습니다." };

  const { data, error } = await db
    .from("products")
    .insert(input)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  updateTag(PRODUCTS_TAG);
  return { ok: true, data: { id: data.id as string } };
}

/**
 * 여러 상품을 한 번에 고친다.
 *
 * 사장님이 실제로 하는 일은 "오늘 안 파는 것 다 숨기기", "품절된 것 다 숨기기"
 * 같은 묶음 작업인데, 지금까지는 한 줄씩 스위치를 눌러야 했다. 57개면 57번이다.
 *
 * 화면에서 "지금 보이는 것 전부"에 적용한다 — 필터로 추린 목록이 곧 대상이라
 * 체크박스를 따로 두지 않아도 무엇에 적용되는지 눈에 보인다.
 *
 * 상한을 둔다. 실수로 전체를 날리는 걸 막고, 한 번에 도는 쿼리도 묶어 둔다.
 * 권한은 그대로 is_admin() RLS 가 판단한다 — 0행이면 성공이 아니다 (0004).
 */
const BULK_LIMIT = 200;

export async function bulkUpdateProducts(
  ids: string[],
  patch: Pick<ProductPatch, "today_available" | "today_stock">,
): Promise<ActionResult<{ changed: number }>> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  if (ids.length === 0) return { ok: true, data: { changed: 0 } };
  if (ids.length > BULK_LIMIT) {
    return { ok: false, error: `한 번에 ${BULK_LIMIT}개까지만 바꿀 수 있어요.` };
  }

  const { data, error } = await db
    .from("products")
    .update(patch)
    .in("id", ids)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "권한이 없거나 대상이 없어요." };
  }

  updateTag(PRODUCTS_TAG);
  return { ok: true, data: { changed: data.length } };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await db.from("products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  updateTag(PRODUCTS_TAG);
  return { ok: true, data: undefined };
}

/**
 * 순서 변경 — 화면에 보이는 순서대로 id 배열을 받아 sort_order 를 다시 매긴다.
 * DB 함수 한 번으로 끝낸다. 상품마다 UPDATE 를 날리면 중간 실패 시 절반만 재번호된다.
 */
export async function reorderProducts(ids: string[]): Promise<ActionResult> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  const { error } = await db.rpc("reorder_products", { ids });
  if (error) return { ok: false, error: error.message };

  updateTag(PRODUCTS_TAG);
  return { ok: true, data: undefined };
}

const PHOTO_BUCKET = "product-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export async function uploadPhoto(
  productId: string,
  formData: FormData,
): Promise<ActionResult<{ path: string }>> {
  const db = await authed();
  if (!db) return { ok: false, error: "로그인이 필요합니다." };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "사진 파일을 선택하세요." };
  }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return { ok: false, error: "JPG, PNG, WEBP, AVIF 형식만 올릴 수 있습니다." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "사진은 5MB 이하만 올릴 수 있습니다." };
  }

  const extension = file.type.split("/")[1].replace("jpeg", "jpg");
  const path = `${productId}/${Date.now()}.${extension}`;

  // 바꾸기 전 사진을 미리 알아 둔다. 경로에 시각이 들어가 매번 새 파일이
  // 생기는데, photo_path 만 갈아 끼우면 예전 파일이 버킷에 영원히 남는다.
  // 메뉴 사진을 몇 번만 바꿔도 안 쓰는 파일이 계속 쌓인다.
  const { data: before } = await db
    .from("products")
    .select("photo_path")
    .eq("id", productId)
    .maybeSingle();

  const upload = await db.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (upload.error) return { ok: false, error: upload.error.message };

  const { error } = await db
    .from("products")
    .update({ photo_path: path })
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  // 새 사진이 확실히 자리를 잡은 뒤에 지운다. 먼저 지웠다가 업로드가 실패하면
  // 사진이 아예 없어진다. 지우기가 실패해도 알리지 않는다 — 손님에게도
  // 사장님에게도 보이지 않는 일이고, 새 사진은 이미 올라가 있다.
  const previous = before?.photo_path;
  if (previous && previous !== path) {
    await db.storage.from(PHOTO_BUCKET).remove([previous]);
  }

  updateTag(PRODUCTS_TAG);
  return { ok: true, data: { path } };
}
