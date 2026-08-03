import type { DeliveryArea, StoreSettings } from "@/types/database";
import { normalize } from "./format.ts";

export const SEOUL_TZ = "Asia/Seoul";
export const SLOT_MINUTES = 30;

/** 한국 시간 기준 요일과 자정으로부터의 분. 서버가 UTC 로 돌아도 흔들리지 않는다. */
export interface SeoulClock {
  weekday: number; // 0=일 … 6=토
  minutes: number; // 0 ~ 1439
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const seoulFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: SEOUL_TZ,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function toSeoulClock(date: Date): SeoulClock {
  const parts = seoulFormat.formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  // Intl 은 자정을 "24" 로 줄 때가 있다
  const hour = Number(get("hour")) % 24;

  return {
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minutes: hour * 60 + Number(get("minute")),
  };
}

/** "09:00" / "09:00:00" → 540 */
export function parseClockTime(value: string): number {
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute ?? 0);
}

export function formatClockTime(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export type ClosedReason =
  | "holiday"
  | "weekday_off"
  | "before_open"
  | "after_close";

export interface OpenState {
  open: boolean;
  reason: ClosedReason | null;
}

/**
 * 지금 주문을 받을 수 있는지. 마감 시각이 개점 시각보다 이르면 자정을 넘긴 영업으로 본다.
 */
export function storeOpenState(
  settings: StoreSettings,
  clock: SeoulClock,
): OpenState {
  if (!settings.is_open) return { open: false, reason: "holiday" };
  if (settings.closed_weekdays.includes(clock.weekday)) {
    return { open: false, reason: "weekday_off" };
  }

  const open = parseClockTime(settings.open_time);
  const close = parseClockTime(settings.close_time);

  if (open === close) return { open: true, reason: null }; // 24시간

  if (close > open) {
    if (clock.minutes < open) return { open: false, reason: "before_open" };
    if (clock.minutes >= close) return { open: false, reason: "after_close" };
    return { open: true, reason: null };
  }

  // 자정을 넘기는 영업 (예: 10:00 ~ 02:00)
  const inside = clock.minutes >= open || clock.minutes < close;
  return inside
    ? { open: true, reason: null }
    : { open: false, reason: "before_open" };
}

/**
 * 주소 문자열에서 배달 가능 지역을 찾는다.
 * 사장님이 '정담동' 을 등록하면 그 글자가 들어간 주소를 매칭한다.
 * 긴 이름을 먼저 확인해야 '○○동' 보다 '○○동 1단지' 가 우선한다.
 */
export function findDeliveryArea(
  areas: readonly DeliveryArea[],
  address: string,
): DeliveryArea | null {
  const target = normalize(address);

  const candidates = areas
    .filter((area) => area.is_active)
    .slice()
    .sort((a, b) => b.name.length - a.name.length);

  return (
    candidates.find((area) => target.includes(normalize(area.name))) ?? null
  );
}

export function minimumFor(
  settings: StoreSettings,
  area: DeliveryArea | null,
): number {
  return area?.min_amount ?? settings.min_order_amount;
}

export type FulfillmentBlock = { ok: true } | { ok: false; reason: string };

/** 배달 주문이 지금 가능한지. 화면 문구까지 여기서 정한다 — 페이지마다 문장이 갈리면 안 된다. */
export function checkDelivery(
  settings: StoreSettings,
  areas: readonly DeliveryArea[],
  address: string | null,
  subtotal: number,
): FulfillmentBlock {
  if (!settings.delivery_enabled) {
    return { ok: false, reason: "지금은 배달 주문을 받지 않아요." };
  }
  if (!address) {
    return { ok: false, reason: "배송지를 먼저 등록해 주세요." };
  }

  const area = findDeliveryArea(areas, address);
  if (!area) {
    return { ok: false, reason: "아직 이 지역은 배달이 어려워요." };
  }

  const minimum = minimumFor(settings, area);
  if (subtotal < minimum) {
    const short = minimum - subtotal;
    return {
      ok: false,
      reason: `${short.toLocaleString("ko-KR")}원 더 담으면 배달돼요.`,
    };
  }

  return { ok: true };
}

/**
 * 픽업 가능 시간대. 준비 시간이 지난 다음 30분 단위부터 마감까지.
 * 자정을 넘기는 영업은 슬롯을 만들지 않는다 — 반찬가게에 필요 없고, 날짜 계산만 복잡해진다.
 */
export function pickupSlots(
  settings: StoreSettings,
  clock: SeoulClock,
): string[] {
  if (!settings.pickup_enabled) return [];

  const state = storeOpenState(settings, clock);
  if (!state.open && state.reason !== "before_open") return [];

  const open = parseClockTime(settings.open_time);
  const close = parseClockTime(settings.close_time);
  if (close <= open) return [];

  // 아직 열기 전이면 개점 시각부터, 영업 중이면 지금부터 준비 시간을 더한다
  const earliest =
    state.reason === "before_open"
      ? open + settings.pickup_lead_minutes
      : clock.minutes + settings.pickup_lead_minutes;

  const first = Math.ceil(earliest / SLOT_MINUTES) * SLOT_MINUTES;
  const slots: string[] = [];

  for (
    let at = Math.max(first, open);
    at <= close - SLOT_MINUTES;
    at += SLOT_MINUTES
  ) {
    slots.push(formatClockTime(at));
  }

  return slots;
}
