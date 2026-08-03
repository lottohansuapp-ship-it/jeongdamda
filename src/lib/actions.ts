"use server";

import { updateTag } from "next/cache";
import { serverClient } from "./supabase/server";
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

async function authed() {
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  return db;
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

  const upload = await db.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });

  if (upload.error) return { ok: false, error: upload.error.message };

  const { error } = await db
    .from("products")
    .update({ photo_path: path })
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  updateTag(PRODUCTS_TAG);
  return { ok: true, data: { path } };
}
