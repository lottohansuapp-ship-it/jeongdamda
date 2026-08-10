import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { envError, publicClient } from "./supabase/public";
import { currentUserId, serverClient } from "./supabase/server";
import { seoulDate } from "./store";
import { EMPTY_CART, summarizeCart, type CartSummary } from "./cart";
import {
  ORDER_COLUMNS,
  ORDER_ITEM_COLUMNS,
  PRODUCT_COLUMNS,
  type Address,
  type Category,
  type DeliveryArea,
  type OrderWithItems,
  type ProductWithCategory,
  type Profile,
  type StoreSettings,
} from "@/types/database";

export const PRODUCTS_TAG = "products";
export const STORE_TAG = "store";

const STORE_COLUMNS =
  "id, is_open, open_time, close_time, closed_weekdays, pickup_enabled, delivery_enabled, min_order_amount, delivery_fee, restrict_delivery_area, pickup_lead_minutes, notice, updated_at";

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
 *
 * cacheLife('max') 라 시간으로는 만료되지 않는다. 재고를 움직이는 경로가 하나라도
 * updateTag(PRODUCTS_TAG) 를 빠뜨리면 목록의 재고가 영영 낡은 채로 남는다.
 * 지금 그 경로는 셋이다 — 관리자 수정(actions.ts), 주문 생성, 주문 취소(order-actions.ts).
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

  const userId = await currentUserId();
  if (!userId) return null;

  const db = await serverClient();
  const { data } = await db
    .from("profiles")
    .select("id, name, phone, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  return (data as Profile) ?? null;
}

export async function getAddresses(): Promise<Address[]> {
  if (envError()) return [];

  const userId = await currentUserId();
  if (!userId) return [];

  const db = await serverClient();
  const { data } = await db
    .from("addresses")
    .select(
      "id, user_id, label, postcode, address1, address2, is_default, created_at",
    )
    .eq("user_id", userId)
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

  const userId = await currentUserId();
  if (!userId) return EMPTY_CART;

  const db = await serverClient();
  const { data, error } = await db
    .from("cart_items")
    .select(`product_id, quantity, product:products(${SELECT})`)
    .eq("user_id", userId)
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

/**
 * 주문 조회. 캐시하지 않는다 — 사용자별 데이터이고 cookies() 를 읽는다.
 * 어느 줄을 볼 수 있는지는 RLS 가 정한다 (손님은 자기 것, 관리자는 전부).
 */
const ORDER_SELECT = `${ORDER_COLUMNS}, items:order_items(${ORDER_ITEM_COLUMNS})`;

/** 한 번에 보여줄 주문 수. 넘으면 "이전 주문 더 보기" 가 붙는다. */
export const ORDER_PAGE_SIZE = 30;

export interface CustomerOrders {
  orders: OrderWithItems[];
  /** 이 시각보다 예전 주문이 더 있으면 그 커서. 없으면 null. */
  nextCursor: string | null;
}

/**
 * 손님 주문내역.
 *
 * 예전에는 최근 50건만 가져오고 그게 끝이었다. 반찬가게는 같은 걸 또 시키는
 * 단골이 핵심인데, 주 1회만 시켜도 1년이면 52건이라 오래된 주문이 목록에서
 * 조용히 사라졌다. 재주문하려고 찾으면 없다.
 *
 * 번호(offset) 대신 시각(cursor)으로 넘긴다. 보는 중에 새 주문이 생겨도
 * 경계가 밀리지 않고, orders_user_idx (user_id, created_at desc) 를 그대로 탄다.
 */
export async function getOrders(before?: string): Promise<CustomerOrders> {
  if (envError()) return { orders: [], nextCursor: null };

  const userId = await currentUserId();
  if (!userId) return { orders: [], nextCursor: null };

  const db = await serverClient();
  let query = db
    .from("orders")
    .select(ORDER_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    // 한 건 더 받아서 "다음이 있는지" 를 센다. 개수를 따로 세면 조회가 하나 는다.
    .limit(ORDER_PAGE_SIZE + 1);

  if (before) query = query.lt("created_at", before);

  const rows = ((await query).data ?? []) as unknown as OrderWithItems[];
  const hasMore = rows.length > ORDER_PAGE_SIZE;
  const orders = rows.slice(0, ORDER_PAGE_SIZE);

  return {
    orders,
    nextCursor: hasMore ? orders[orders.length - 1].created_at : null,
  };
}

export async function getOrder(id: string): Promise<OrderWithItems | null> {
  if (envError()) return null;

  const db = await serverClient();
  const { data } = await db
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle();

  return (data as unknown as OrderWithItems) ?? null;
}

/** 한 번에 가져올 주문 수. 넘으면 잘렸다고 알린다. */
export const ADMIN_ORDER_LIMIT = 200;

export interface AdminOrders {
  orders: OrderWithItems[];
  /** 상한에 걸려 잘렸는지. 조용히 자르면 사장님이 주문을 놓친다. */
  truncated: boolean;
}

/**
 * 관리자용 주문 목록. orders_admin_all 정책을 통과해야 보인다.
 *
 * **기간으로 자른다.** 예전에는 status <> 'pending_payment' 로 걸러 최근 100건을
 * 가져왔는데, 그 조건은 (status, created_at) 인덱스를 못 타서 주문이 쌓일수록
 * 전체를 훑고 정렬하게 된다. 사장님이 매일 여는 화면이라 제일 먼저 느려진다.
 *
 * 기간 시작은 한국 날짜 자정이다. UTC 로 자르면 자정 근처 주문이 어제로 넘어간다.
 *
 * 페이지 나누기는 넣지 않았다. 하루 100건 규모에서 30일이면 3천 건인데,
 * 그건 기간을 좁히면 될 일이지 페이지로 풀 일이 아니다. 대신 상한에 걸리면
 * 잘렸다고 알려 사장님이 기간을 줄이도록 안내한다.
 */
export async function getAdminOrders(days: number): Promise<AdminOrders> {
  if (envError()) return { orders: [], truncated: false };

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - Math.max(0, days - 1));
  const from = `${seoulDate(since)}T00:00:00+09:00`;

  const db = await serverClient();
  const { data } = await db
    .from("orders")
    .select(ORDER_SELECT)
    .gte("created_at", from)
    // 결제 전 주문은 뺀다. 재고만 잡아둔 상태라 매장이 할 일이 없고
    // 10분 뒤 알아서 사라진다.
    .neq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(ADMIN_ORDER_LIMIT + 1);

  const rows = (data ?? []) as unknown as OrderWithItems[];

  return {
    orders: rows.slice(0, ADMIN_ORDER_LIMIT),
    truncated: rows.length > ADMIN_ORDER_LIMIT,
  };
}

export interface SalesSummary {
  orders: number;
  revenue: number;
  delivery: number;
  pickup: number;
  canceled: number;
  refunded: number;
}

export interface SalesItem {
  name: string;
  quantity: number;
  revenue: number;
}

/**
 * 기간 매출. 합산은 DB 안에서 끝난다 — 주문을 전부 앱으로 옮겨 더하면
 * 한 해가 지났을 때 수천 건을 나른다. 사장님이 매일 여는 화면이라 바로 체감된다.
 *
 * 날짜는 한국 기준 "YYYY-MM-DD". 서버는 UTC 라 그냥 비교하면 자정 근처 주문이
 * 엉뚱한 날로 넘어간다.
 */
export async function getSales(
  from: string,
  to: string,
): Promise<{ summary: SalesSummary; items: SalesItem[] } | null> {
  if (envError()) return null;

  const db = await serverClient();
  const [summary, items] = await Promise.all([
    db.rpc("sales_summary", { p_from: from, p_to: to }),
    db.rpc("sales_top_items", { p_from: from, p_to: to, p_limit: 10 }),
  ]);

  // 권한이 없으면 함수가 던진다. 화면이 안내를 띄운다.
  if (summary.error || !summary.data) return null;

  return {
    summary: summary.data as SalesSummary,
    items: (items.data ?? []) as SalesItem[],
  };
}

export interface ErrorLog {
  id: string;
  scope: string;
  message: string;
  detail: string | null;
  created_at: string;
}

/**
 * 최근 오류. 관리자 화면 맨 위에 띄운다 — 기록만 하고 아무도 안 보면 없는 것과 같다.
 * is_admin() 이 아니면 RLS 가 0행을 준다.
 */
export async function getRecentErrors(hours = 24): Promise<ErrorLog[]> {
  if (envError()) return [];

  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const db = await serverClient();
  const { data } = await db
    .from("error_logs")
    .select("id, scope, message, detail, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []) as ErrorLog[];
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
