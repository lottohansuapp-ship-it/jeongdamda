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
  made_today: boolean;
  recommended: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProductWithCategory extends Product {
  category: Pick<Category, "id" | "name" | "slug">;
}

export const PRODUCT_COLUMNS =
  "id, category_id, name, description, price, origin, allergy, storage, pairing, photo_path, today_stock, today_available, made_today, recommended, sort_order, created_at, updated_at";

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

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };
