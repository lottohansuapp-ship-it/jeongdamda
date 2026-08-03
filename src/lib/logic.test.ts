import assert from "node:assert/strict";
import { test } from "node:test";
import { filterProducts, EMPTY_FILTERS } from "./filter.ts";
import { clampQuantity, lineIssue, summarizeCart } from "./cart.ts";
import {
  checkDelivery,
  findDeliveryArea,
  formatClockTime,
  minimumFor,
  parseClockTime,
  pickupSlots,
  storeOpenState,
  toSeoulClock,
} from "./store.ts";
import type { DeliveryArea, StoreSettings } from "../types/database.ts";
import { formatPrice, normalize, normalizePhone } from "./format.ts";
import { LOW_STOCK_THRESHOLD, stockStatus } from "./stock.ts";
import type { ProductWithCategory } from "../types/database.ts";

function make(
  overrides: Partial<ProductWithCategory> & {
    name: string;
    category: ProductWithCategory["category"];
  },
): ProductWithCategory {
  return {
    id: overrides.name,
    category_id: overrides.category.id,
    description: null,
    price: 5000,
    origin: null,
    allergy: null,
    storage: null,
    pairing: null,
    photo_path: null,
    today_stock: 10,
    today_available: true,
    made_today: false,
    recommended: false,
    sort_order: 0,
    created_at: "2026-08-03T00:00:00+00:00",
    updated_at: "2026-08-03T00:00:00+00:00",
    ...overrides,
  };
}

const stew = { id: "c-stew", name: "찌개", slug: "stew" };
const namul = { id: "c-namul", name: "나물", slug: "namul" };

const CATALOG: ProductWithCategory[] = [
  make({
    name: "김치찌개",
    category: stew,
    description: "푹 익은 김치와 돼지고기",
    today_stock: 3,
    recommended: true,
  }),
  make({ name: "된장찌개", category: stew, today_stock: 0 }),
  make({ name: "시금치나물", category: namul, today_stock: 12 }),
];

test("stockStatus: 0개는 품절", () => {
  const status = stockStatus(0);
  assert.equal(status.level, "out");
  assert.equal(status.urgent, false);
});

test("stockStatus: 임계값 이하는 마감 임박", () => {
  assert.equal(stockStatus(1).level, "low");
  assert.equal(stockStatus(LOW_STOCK_THRESHOLD).level, "low");
  assert.equal(stockStatus(LOW_STOCK_THRESHOLD).urgent, true);
});

test("stockStatus: 임계값을 넘으면 충분", () => {
  assert.equal(stockStatus(LOW_STOCK_THRESHOLD + 1).level, "plenty");
});

test("stockStatus: 음수 재고도 품절로 다룬다", () => {
  assert.equal(stockStatus(-3).level, "out");
});

test("formatPrice: 천 단위 구분과 원 표기", () => {
  assert.equal(formatPrice(0), "0원");
  assert.equal(formatPrice(8000), "8,000원");
  assert.equal(formatPrice(16000), "16,000원");
});

test("normalize: 공백을 지우고 소문자로", () => {
  assert.equal(normalize(" 김치 찌개 "), "김치찌개");
  assert.equal(normalize("Kimchi Stew"), "kimchistew");
});

test("normalizePhone: 구분자와 무관하게 같은 형태로 만든다", () => {
  assert.equal(normalizePhone("01012345678"), "010-1234-5678");
  assert.equal(normalizePhone("010-1234-5678"), "010-1234-5678");
  assert.equal(normalizePhone("010 1234 5678"), "010-1234-5678");
  assert.equal(normalizePhone(" 010.1234.5678 "), "010-1234-5678");
});

test("normalizePhone: 10자리 구형 번호도 받는다", () => {
  assert.equal(normalizePhone("0111234567"), "011-123-4567");
});

test("normalizePhone: 휴대폰이 아니면 null", () => {
  assert.equal(normalizePhone("021234567"), null); // 지역번호
  assert.equal(normalizePhone("0212345678"), null); // 02 로 시작
  assert.equal(normalizePhone("010123456"), null); // 너무 짧음
  assert.equal(normalizePhone("0101234567890"), null); // 너무 김
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("없음"), null);
});

test("filterProducts: 필터가 없으면 전부 통과", () => {
  assert.equal(filterProducts(CATALOG, EMPTY_FILTERS).length, 3);
});

test("filterProducts: 상품명 검색", () => {
  const result = filterProducts(CATALOG, { ...EMPTY_FILTERS, query: "김치" });
  assert.deepEqual(
    result.map((p) => p.name),
    ["김치찌개"],
  );
});

test("filterProducts: 검색어의 공백은 무시한다", () => {
  const result = filterProducts(CATALOG, {
    ...EMPTY_FILTERS,
    query: "김치 찌개",
  });
  assert.equal(result.length, 1);
});

test("filterProducts: 설명과 카테고리명으로도 찾는다", () => {
  assert.equal(
    filterProducts(CATALOG, { ...EMPTY_FILTERS, query: "돼지고기" }).length,
    1,
  );
  assert.equal(
    filterProducts(CATALOG, { ...EMPTY_FILTERS, query: "나물" }).length,
    1,
  );
});

test("filterProducts: 카테고리 필터", () => {
  const result = filterProducts(CATALOG, {
    ...EMPTY_FILTERS,
    categorySlug: "stew",
  });
  assert.equal(result.length, 2);
});

test("filterProducts: 추천만 보기", () => {
  const result = filterProducts(CATALOG, {
    ...EMPTY_FILTERS,
    recommendedOnly: true,
  });
  assert.deepEqual(
    result.map((p) => p.name),
    ["김치찌개"],
  );
});

test("filterProducts: 품절 제외", () => {
  const result = filterProducts(CATALOG, {
    ...EMPTY_FILTERS,
    hideSoldOut: true,
  });
  assert.equal(result.length, 2);
  assert.equal(
    result.some((p) => p.name === "된장찌개"),
    false,
  );
});

test("filterProducts: 조건은 함께 적용된다", () => {
  const result = filterProducts(CATALOG, {
    query: "찌개",
    categorySlug: "stew",
    recommendedOnly: false,
    hideSoldOut: true,
  });
  assert.deepEqual(
    result.map((p) => p.name),
    ["김치찌개"],
  );
});

test("filterProducts: 원본 배열을 건드리지 않는다", () => {
  const before = CATALOG.map((p) => p.name);
  filterProducts(CATALOG, { ...EMPTY_FILTERS, hideSoldOut: true });
  assert.deepEqual(
    CATALOG.map((p) => p.name),
    before,
  );
});

// ---- 장바구니 ----

const inStock = make({ name: "제육볶음", category: stew, price: 9000, today_stock: 10 });
const lowStock = make({ name: "미역국", category: stew, price: 6000, today_stock: 2 });
const outOfStock = make({ name: "계란찜", category: stew, price: 5000, today_stock: 0 });
const hidden = make({
  name: "메밀전병",
  category: stew,
  price: 8000,
  today_stock: 5,
  today_available: false,
});

test("lineIssue: 재고가 넉넉하면 문제 없음", () => {
  assert.equal(lineIssue(inStock, 3), null);
});

test("lineIssue: 재고와 같은 수량까지는 허용", () => {
  assert.equal(lineIssue(lowStock, 2), null);
  assert.equal(lineIssue(lowStock, 3), "insufficient");
});

test("lineIssue: 품절과 판매중지를 구분한다", () => {
  assert.equal(lineIssue(outOfStock, 1), "sold_out");
  assert.equal(lineIssue(hidden, 1), "unavailable");
});

test("summarizeCart: 소계는 단가 × 수량의 합", () => {
  const cart = summarizeCart([
    { product: inStock, quantity: 2 },
    { product: lowStock, quantity: 1 },
  ]);
  assert.equal(cart.subtotal, 9000 * 2 + 6000);
  assert.equal(cart.itemCount, 3);
  assert.equal(cart.blockingIssues, 0);
});

test("summarizeCart: 살 수 없는 줄은 금액에서 뺀다", () => {
  const cart = summarizeCart([
    { product: inStock, quantity: 1 },
    { product: outOfStock, quantity: 2 },
  ]);
  // 품절 상품 값이 섞이면 손님이 낼 금액을 잘못 안다
  assert.equal(cart.subtotal, 9000);
  assert.equal(cart.blockingIssues, 1);
  assert.equal(cart.lines[1].lineTotal, 0);
});

test("summarizeCart: 재고보다 많이 담은 줄도 금액에서 뺀다", () => {
  const cart = summarizeCart([{ product: lowStock, quantity: 5 }]);
  assert.equal(cart.subtotal, 0);
  assert.equal(cart.lines[0].issue, "insufficient");
  assert.equal(cart.lines[0].available, 2);
});

test("summarizeCart: itemCount 는 못 사는 줄도 센다", () => {
  const cart = summarizeCart([{ product: outOfStock, quantity: 4 }]);
  assert.equal(cart.itemCount, 4);
  assert.equal(cart.subtotal, 0);
});

test("summarizeCart: orphan 은 막힌 항목으로 센다", () => {
  const cart = summarizeCart([{ product: inStock, quantity: 1 }], ["gone-id"]);
  assert.equal(cart.blockingIssues, 1);
  assert.deepEqual(cart.orphanIds, ["gone-id"]);
});

test("summarizeCart: 빈 장바구니", () => {
  const cart = summarizeCart([]);
  assert.equal(cart.subtotal, 0);
  assert.equal(cart.itemCount, 0);
  assert.equal(cart.blockingIssues, 0);
});

test("clampQuantity: 재고를 넘지 않는다", () => {
  assert.equal(clampQuantity(5, 2), 2);
  assert.equal(clampQuantity(1, 10), 1);
  assert.equal(clampQuantity(0, 10), 1);
  assert.equal(clampQuantity(-3, 10), 1);
});

test("clampQuantity: 재고가 0이어도 1 아래로는 안 내려간다", () => {
  assert.equal(clampQuantity(3, 0), 1);
});

test("clampQuantity: 상한 99", () => {
  assert.equal(clampQuantity(500, 1000), 99);
});

// ---- 매장 설정 ----

function store(overrides: Partial<StoreSettings> = {}): StoreSettings {
  return {
    id: 1,
    is_open: true,
    open_time: "09:00:00",
    close_time: "20:00:00",
    closed_weekdays: [],
    pickup_enabled: true,
    delivery_enabled: true,
    min_order_amount: 0,
    pickup_lead_minutes: 30,
    notice: null,
    updated_at: "2026-08-03T00:00:00+00:00",
    ...overrides,
  };
}

function area(overrides: Partial<DeliveryArea> = {}): DeliveryArea {
  return {
    id: "a1",
    name: "정담동",
    fee: 3000,
    min_amount: null,
    is_active: true,
    sort_order: 0,
    created_at: "2026-08-03T00:00:00+00:00",
    ...overrides,
  };
}

test("parseClockTime / formatClockTime 왕복", () => {
  assert.equal(parseClockTime("09:00"), 540);
  assert.equal(parseClockTime("09:00:00"), 540);
  assert.equal(parseClockTime("00:00"), 0);
  assert.equal(parseClockTime("23:59"), 1439);
  assert.equal(formatClockTime(540), "09:00");
  assert.equal(formatClockTime(1439), "23:59");
});

// 서버가 UTC 로 돌아도 사장님이 입력한 한국 시간이 기준이어야 한다.
// 이게 틀리면 새벽에 열리고 낮에 닫힌다.
test("toSeoulClock: UTC 를 한국 시간으로 환산한다", () => {
  // 2026-08-03T00:30:00Z = 한국 시간 월요일 09:30
  const clock = toSeoulClock(new Date("2026-08-03T00:30:00Z"));
  assert.equal(clock.weekday, 1); // 월요일
  assert.equal(clock.minutes, 9 * 60 + 30);
});

test("toSeoulClock: 날짜가 넘어가는 경계", () => {
  // 2026-08-02T15:00:00Z = 한국 시간 월요일 00:00 (UTC 로는 아직 일요일)
  const clock = toSeoulClock(new Date("2026-08-02T15:00:00Z"));
  assert.equal(clock.weekday, 1);
  assert.equal(clock.minutes, 0);
});

test("storeOpenState: 영업시간 안이면 열림", () => {
  const state = storeOpenState(store(), { weekday: 1, minutes: 600 });
  assert.equal(state.open, true);
  assert.equal(state.reason, null);
});

test("storeOpenState: 개점 전 · 마감 후를 구분한다", () => {
  assert.deepEqual(storeOpenState(store(), { weekday: 1, minutes: 480 }), {
    open: false,
    reason: "before_open",
  });
  assert.deepEqual(storeOpenState(store(), { weekday: 1, minutes: 1200 }), {
    open: false,
    reason: "after_close",
  });
});

test("storeOpenState: 마감 시각 정각은 닫힘", () => {
  assert.equal(
    storeOpenState(store(), { weekday: 1, minutes: 1200 }).open,
    false,
  );
  // 개점 정각은 열림
  assert.equal(
    storeOpenState(store(), { weekday: 1, minutes: 540 }).open,
    true,
  );
});

test("storeOpenState: 임시 휴무와 정기 휴무", () => {
  assert.equal(
    storeOpenState(store({ is_open: false }), { weekday: 1, minutes: 600 })
      .reason,
    "holiday",
  );
  assert.equal(
    storeOpenState(store({ closed_weekdays: [0] }), {
      weekday: 0,
      minutes: 600,
    }).reason,
    "weekday_off",
  );
});

test("storeOpenState: 자정을 넘기는 영업", () => {
  const late = store({ open_time: "10:00", close_time: "02:00" });
  assert.equal(storeOpenState(late, { weekday: 1, minutes: 1400 }).open, true); // 23:20
  assert.equal(storeOpenState(late, { weekday: 1, minutes: 60 }).open, true); // 01:00
  assert.equal(storeOpenState(late, { weekday: 1, minutes: 300 }).open, false); // 05:00
});

test("findDeliveryArea: 주소에 지역명이 있으면 매칭", () => {
  const areas = [area()];
  assert.equal(findDeliveryArea(areas, "서울시 정담동 12-3")?.name, "정담동");
  assert.equal(findDeliveryArea(areas, "서울시 다른동 1"), null);
});

test("findDeliveryArea: 긴 이름이 먼저 걸린다", () => {
  const areas = [area(), area({ id: "a2", name: "정담동 1단지", fee: 1000 })];
  const hit = findDeliveryArea(areas, "서울시 정담동 1단지 101동");
  assert.equal(hit?.name, "정담동 1단지");
  assert.equal(hit?.fee, 1000);
});

test("findDeliveryArea: 중지된 지역은 매칭하지 않는다", () => {
  assert.equal(findDeliveryArea([area({ is_active: false })], "정담동 1"), null);
});

test("minimumFor: 지역별 값이 없으면 매장 기본값", () => {
  const settings = store({ min_order_amount: 15000 });
  assert.equal(minimumFor(settings, area()), 15000);
  assert.equal(minimumFor(settings, area({ min_amount: 20000 })), 20000);
  assert.equal(minimumFor(settings, area({ min_amount: 0 })), 0);
});

test("checkDelivery: 배달이 꺼져 있으면 막는다", () => {
  const result = checkDelivery(
    store({ delivery_enabled: false }),
    [area()],
    "정담동 1",
    50000,
  );
  assert.equal(result.ok, false);
});

test("checkDelivery: 배송지가 없으면 막는다", () => {
  assert.equal(checkDelivery(store(), [area()], null, 50000).ok, false);
});

test("checkDelivery: 배달 불가 지역", () => {
  assert.equal(checkDelivery(store(), [area()], "먼동네 1", 50000).ok, false);
});

test("checkDelivery: 최소주문 미달이면 부족한 금액을 알려준다", () => {
  const result = checkDelivery(
    store({ min_order_amount: 20000 }),
    [area()],
    "정담동 1",
    17000,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /3,000원/);
});

test("checkDelivery: 조건을 다 만족하면 통과", () => {
  assert.equal(
    checkDelivery(store({ min_order_amount: 20000 }), [area()], "정담동 1", 20000)
      .ok,
    true,
  );
});

test("pickupSlots: 영업 중이면 준비 시간 뒤 30분 단위부터", () => {
  // 10:10 + 준비 30분 = 10:40 → 다음 슬롯 11:00
  const slots = pickupSlots(store(), { weekday: 1, minutes: 610 });
  assert.equal(slots[0], "11:00");
  assert.equal(slots.at(-1), "19:30");
});

test("pickupSlots: 개점 전이면 개점 시각 기준으로 만든다", () => {
  const slots = pickupSlots(store(), { weekday: 1, minutes: 400 });
  assert.equal(slots[0], "09:30");
});

test("pickupSlots: 픽업이 꺼져 있거나 마감 후면 비어 있다", () => {
  assert.deepEqual(
    pickupSlots(store({ pickup_enabled: false }), { weekday: 1, minutes: 600 }),
    [],
  );
  assert.deepEqual(pickupSlots(store(), { weekday: 1, minutes: 1250 }), []);
});
