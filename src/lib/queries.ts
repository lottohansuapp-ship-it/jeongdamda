import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { envError, publicClient } from "./supabase/public";
import { serverClient } from "./supabase/server";
import { EMPTY_CART, summarizeCart, type CartSummary } from "./cart";
import {
  PRODUCT_COLUMNS,
  type Address,
  type Category,
  type DeliveryArea,
  type ProductWithCategory,
  type Profile,
  type StoreSettings,
} from "@/types/database";

export const PRODUCTS_TAG = "products";
export const STORE_TAG = "store";

const STORE_COLUMNS =
  "id, is_open, open_time, close_time, closed_weekdays, pickup_enabled, delivery_enabled, min_order_amount, pickup_lead_minutes, notice, updated_at";

const AREA_COLUMNS =
  "id, name, fee, min_amount, is_active, sort_order, created_at";

export interface ShopData {
  categories: Category[];
  products: ProductWithCategory[];
}

export type ShopResult =
  | { ok: true; data: ShopData }
  | { ok: false; error: string };

const SELECT = `${PRODUCT_COLUMNS}, category:categories!inner(id, name, slug)`;

/**
 * 캐시되는 안쪽 레이어. 실패하면 던진다 — 실패를 캐시하면 장애가 영구화된다.
 * 재고는 관리자 수정으로만 바뀌므로 cacheLife('max') + updateTag 조합이 성립한다.
 */
async function fetchShopData(): Promise<ShopData> {
  "use cache";
  cacheTag(PRODUCTS_TAG);
  cacheLife("max");

  const db = publicClient();
  const [categories, products] = await Promise.all([
    db.from("categories").select("id, name, slug, sort_order").order("sort_order"),
    db
      .from("products")
      .select(SELECT)
      .eq("today_available", true)
      .order("sort_order"),
  ]);

  if (categories.error) throw new Error(categories.error.message);
  if (products.error) throw new Error(products.error.message);

  return {
    categories: (categories.data ?? []) as Category[],
    products: (products.data ?? []) as unknown as ProductWithCategory[],
  };
}

/**
 * 캐시 바깥 레이어. 에러를 결과로 바꿔 UI가 안내 화면을 그릴 수 있게 한다.
 * 환경변수 검사는 캐시에 들어가기 전에 끝낸다 — 캐시 안에서 던지면 프리렌더가 깨진다.
 */
export async function getShopData(): Promise<ShopResult> {
  const missing = envError();
  if (missing) return { ok: false, error: missing };

  try {
    return { ok: true, data: await fetchShopData() };
  } catch (error: unknown) {
    return { ok: false, error: toMessage(error) };
  }
}

async function fetchProduct(id: string): Promise<ProductWithCategory | null> {
  "use cache";
  cacheTag(PRODUCTS_TAG);
  cacheLife("max");

  const { data, error } = await publicClient()
    .from("products")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as unknown as ProductWithCategory) ?? null;
}

export async function getProduct(
  id: string,
): Promise<
  { ok: true; data: ProductWithCategory | null } | { ok: false; error: string }
> {
  const missing = envError();
  if (missing) return { ok: false, error: missing };

  try {
    return { ok: true, data: await fetchProduct(id) };
  } catch (error: unknown) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * 관리자용 — today_available 이 false 인 상품까지 전부.
 * anon 정책이 today_available = true 로 막혀 있으므로 로그인 세션이 필요하다.
 * cookies()를 읽으니 'use cache' 를 붙일 수 없다. 관리자는 한 명이라 캐시 이득도 없다.
 */
async function fetchAllProducts(): Promise<ShopData> {
  const db = await serverClient();
  const [categories, products] = await Promise.all([
    db.from("categories").select("id, name, slug, sort_order").order("sort_order"),
    db.from("products").select(SELECT).order("sort_order"),
  ]);

  if (categories.error) throw new Error(categories.error.message);
  if (products.error) throw new Error(products.error.message);

  return {
    categories: (categories.data ?? []) as Category[],
    products: (products.data ?? []) as unknown as ProductWithCategory[],
  };
}

export async function getAdminData(): Promise<ShopResult> {
  const missing = envError();
  if (missing) return { ok: false, error: missing };

  try {
    return { ok: true, data: await fetchAllProducts() };
  } catch (error: unknown) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * 로그인한 손님의 프로필. 캐시하지 않는다 — 사용자별 데이터이고 cookies() 를 읽는다.
 * 로그인 전이면 null.
 */
export async function getProfile(): Promise<Profile | null> {
  if (envError()) return null;

  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return null;

  const { data } = await db
    .from("profiles")
    .select("id, name, phone, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile) ?? null;
}

export async function getAddresses(): Promise<Address[]> {
  if (envError()) return [];

  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return [];

  const { data } = await db
    .from("addresses")
    .select(
      "id, user_id, label, postcode, address1, address2, is_default, created_at",
    )
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return (data as Address[]) ?? [];
}

/**
 * 장바구니. 캐시하지 않는다 — 사용자별 데이터이고 cookies() 를 읽는다.
 *
 * 상품 조인을 inner 로 걸면 안 된다. 사장님이 판매를 끄는 순간 RLS 가 그 상품을
 * 손님에게서 감추고, inner join 이면 장바구니 줄이 통째로 사라진다.
 * 손님은 뭐가 왜 없어졌는지 모른다. left join 으로 남기고 orphan 으로 표시한다.
 */
export async function getCart(): Promise<CartSummary> {
  if (envError()) return EMPTY_CART;

  const db = await serverClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return EMPTY_CART;

  const { data, error } = await db
    .from("cart_items")
    .select(`product_id, quantity, product:products(${SELECT})`)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error || !data) return EMPTY_CART;

  const rows = data as unknown as {
    product_id: string;
    quantity: number;
    product: ProductWithCategory | null;
  }[];

  const valid = rows
    .filter((row) => row.product !== null)
    .map((row) => ({
      product: row.product as ProductWithCategory,
      quantity: row.quantity,
    }));

  const orphanIds = rows
    .filter((row) => row.product === null)
    .map((row) => row.product_id);

  return summarizeCart(valid, orphanIds);
}

/**
 * 매장 설정. 손님도 읽어야 하므로 쿠키 없는 클라이언트를 쓰고 캐시한다.
 * 사장님이 바꾸면 updateTag(STORE_TAG) 로 즉시 만료된다.
 */
async function fetchStore(): Promise<{
  settings: StoreSettings | null;
  areas: DeliveryArea[];
}> {
  "use cache";
  cacheTag(STORE_TAG);
  cacheLife("minutes");

  const db = publicClient();
  const [settings, areas] = await Promise.all([
    db.from("store_settings").select(STORE_COLUMNS).eq("id", 1).maybeSingle(),
    db.from("delivery_areas").select(AREA_COLUMNS).order("sort_order"),
  ]);

  if (settings.error) throw new Error(settings.error.message);
  if (areas.error) throw new Error(areas.error.message);

  return {
    settings: (settings.data as StoreSettings) ?? null,
    areas: (areas.data ?? []) as DeliveryArea[],
  };
}

export async function getStore(): Promise<{
  settings: StoreSettings | null;
  areas: DeliveryArea[];
}> {
  if (envError()) return { settings: null, areas: [] };

  try {
    return await fetchStore();
  } catch {
    return { settings: null, areas: [] };
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
