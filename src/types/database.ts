export interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  origin: string | null;
  allergy: string | null;
  storage: string | null;
  pairing: string | null;
  photo_path: string | null;
  today_stock: number;
  today_available: boolean;
  /** src/lib/badges.ts 의 key 목록. 모르는 key 는 화면에서 무시된다. */
  badges: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductWithCategory extends Product {
  category: Pick<Category, "id" | "name" | "slug">;
}

export const PRODUCT_COLUMNS =
  "id, category_id, name, description, price, origin, allergy, storage, pairing, photo_path, today_stock, today_available, badges, sort_order, created_at, updated_at";

export interface Profile {
  id: string;
  name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string | null;
  postcode: string | null;
  address1: string;
  address2: string | null;
  is_default: boolean;
  created_at: string;
}

/** 주문·연락에 쓸 수 있는 프로필인지. 카카오 가입자는 처음에 phone 이 비어 있다 (D18). */
export function isProfileComplete(profile: Profile | null): boolean {
  return Boolean(profile?.name?.trim() && profile?.phone?.trim());
}

export interface StoreSettings {
  id: number;
  is_open: boolean;
  /** 한국 시간 벽시계. "09:00:00" 형태 */
  open_time: string;
  close_time: string;
  /** 0=일 … 6=토 */
  closed_weekdays: number[];
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  min_order_amount: number;
  /** 지역 제한이 꺼져 있을 때 쓰는 기본 배달비 */
  delivery_fee: number;
  /** 켜면 delivery_areas 로만 배달. 끄면 어느 주소든 배달 (0010) */
  restrict_delivery_area: boolean;
  pickup_lead_minutes: number;
  notice: string | null;
  updated_at: string;
}

export interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  /** null 이면 store_settings.min_order_amount 를 쓴다 */
  min_amount: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/**
 * 주문. 이름·연락처·주소·상품명·단가는 전부 스냅샷이다 —
 * 손님이 주소를 지우거나 사장님이 가격을 바꿔도 지난 주문 내역은 그때 그대로여야 한다.
 */
export interface Order {
  id: string;
  order_no: string;
  user_id: string | null;
  status: string;
  fulfillment: string;
  receiver_name: string;
  receiver_phone: string;
  address_snapshot: string | null;
  pickup_at: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  memo: string | null;
  /** 미결제 주문이 재고를 잡아두는 기한 */
  reserved_until: string | null;
  paid_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  /** 상품이 삭제되면 null 이 된다. 이름·단가는 스냅샷이라 화면은 멀쩡하다. */
  product_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export const ORDER_COLUMNS =
  "id, order_no, user_id, status, fulfillment, receiver_name, receiver_phone, address_snapshot, pickup_at, subtotal, delivery_fee, total, memo, reserved_until, paid_at, canceled_at, cancel_reason, created_at, updated_at";

export const ORDER_ITEM_COLUMNS =
  "id, order_id, product_id, name, unit_price, quantity, line_total";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
