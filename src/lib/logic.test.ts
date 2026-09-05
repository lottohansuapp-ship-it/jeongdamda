import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareProducts,
  filterProducts,
  isFiltering,
  EMPTY_FILTERS,
} from "./filter.ts";
import { checkNewOrders } from "./alarm.ts";
import {
  isPaymentReady,
  missingPaymentKeys,
  type PaymentKeys,
} from "./payments/config.ts";
import {
  availableMethods,
  pickMethod,
  type PaymentChannels,
} from "./payments/methods.ts";
import { clampQuantity, lineIssue, summarizeCart } from "./cart.ts";
import {
  decodeDraft,
  encodeDraft,
  reconcileDraft,
} from "./checkout-draft.ts";
import {
  MAX_AGE_SECONDS,
  signBody,
  verifyWebhookSignature,
} from "./payments/signature.ts";
import {
  customerMessage,
  shouldNotifyCustomer,
  storeMessage,
  summarizeItems,
} from "./notify/messages.ts";
import {
  checkDelivery,
  findDeliveryArea,
  formatClockTime,
  minimumFor,
  parseClockTime,
  pickupSlots,
  pickupTimestamp,
  seoulDate,
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
    badges: [],
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
    badges: ["recommend"],
  }),
  make({ name: "된장찌개", category: stew, today_stock: 0 }),
  make({ name: "시금치나물", category: namul, today_stock: 12 }),
];

test("stockStatus: 0개는 품절", () => {
  const status = stockStatus(0);
  assert.equal(status.level, "out");
  assert.equal(status.label, "품절");
});

// 라벨은 한 단어여야 한다. 카드가 좁아서 긴 문장은 줄바꿈되거나 잘린다.
test("stockStatus: 임계값 이하는 소량", () => {
  assert.equal(stockStatus(1).level, "low");
  assert.equal(stockStatus(LOW_STOCK_THRESHOLD).level, "low");
  assert.equal(stockStatus(LOW_STOCK_THRESHOLD).label, "소량");
});

test("stockStatus: 라벨은 전부 한 단어", () => {
  for (const stock of [0, 3, 50]) {
    const { label } = stockStatus(stock);
    assert.ok(label.length <= 3, `"${label}" 이 너무 길다`);
    assert.ok(!label.includes(" "), `"${label}" 에 공백이 있다`);
  }
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

// 손님의 "추천만"과 관리자의 뱃지 필터가 같은 길을 쓴다.
// 두 벌로 두면 사장님이 관리자에서 본 목록과 손님 화면이 달라진다.
test("filterProducts: 뱃지로 거르기", () => {
  const result = filterProducts(CATALOG, {
    ...EMPTY_FILTERS,
    badgeKey: "recommend",
  });
  assert.deepEqual(
    result.map((p) => p.name),
    ["김치찌개"],
  );
  // 아무도 안 붙인 뱃지로 거르면 빈 목록
  assert.equal(
    filterProducts(CATALOG, { ...EMPTY_FILTERS, badgeKey: "deal" }).length,
    0,
  );
});

// 관리자 전용 — 사장님이 "품절 몇 개지?"를 누르면 그 목록으로 가야 한다
test("filterProducts: 재고 상태로 거르기", () => {
  assert.deepEqual(
    filterProducts(CATALOG, { ...EMPTY_FILTERS, stockLevel: "out" }).map(
      (p) => p.name,
    ),
    ["된장찌개"],
  );
  assert.deepEqual(
    filterProducts(CATALOG, { ...EMPTY_FILTERS, stockLevel: "low" }).map(
      (p) => p.name,
    ),
    ["김치찌개"],
  );
});

test("filterProducts: 숨긴 상품만 보기", () => {
  const withHidden = [
    ...CATALOG,
    make({ name: "숨긴반찬", category: stew, today_available: false }),
  ];
  assert.deepEqual(
    filterProducts(withHidden, { ...EMPTY_FILTERS, hiddenOnly: true }).map(
      (p) => p.name,
    ),
    ["숨긴반찬"],
  );
});

test("isFiltering: 하나라도 걸려 있으면 true", () => {
  assert.equal(isFiltering(EMPTY_FILTERS), false);
  assert.equal(isFiltering({ ...EMPTY_FILTERS, query: "  " }), false);
  assert.equal(isFiltering({ ...EMPTY_FILTERS, query: "김치" }), true);
  assert.equal(isFiltering({ ...EMPTY_FILTERS, badgeKey: "today" }), true);
  assert.equal(isFiltering({ ...EMPTY_FILTERS, stockLevel: "out" }), true);
  assert.equal(isFiltering({ ...EMPTY_FILTERS, hiddenOnly: true }), true);
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
    ...EMPTY_FILTERS,
    query: "찌개",
    categorySlug: "stew",
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
    delivery_fee: 0,
    restrict_delivery_area: false, // DB 기본값과 같게 (0010)
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

test("checkDelivery: 지역 제한을 켰을 때만 배달 불가 지역이 있다", () => {
  const restricted = store({ restrict_delivery_area: true });
  assert.equal(checkDelivery(restricted, [area()], "먼동네 1", 50000).ok, false);
});

/**
 * 지역 제한이 꺼져 있으면(현재 기본값) 주소를 따지지 않는다 — 0010 의 place_order 와 같아야 한다.
 * 이게 어긋나면 화면은 "배달이 어려워요"로 막는데 DB 는 주문을 받는다. 손님은 이유를 알 수 없다.
 * 도로명 주소('길음로 12')에는 '길음동'이라는 글자가 없어서 실제로 자주 빗나간다.
 */
test("checkDelivery: 지역 제한이 꺼져 있으면 매칭되지 않는 주소도 통과", () => {
  const result = checkDelivery(store(), [area()], "서울 성북구 길음로 12", 50000);
  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
});

test("checkDelivery: 지역 제한이 꺼져 있으면 매장 기본 배달비를 쓴다", () => {
  const settings = store({ delivery_fee: 2000 });
  // 지역(3,000원)이 아니라 매장 기본값이 나와야 한다
  assert.equal(checkDelivery(settings, [area()], "정담동 1", 50000).fee, 2000);
  // 켜면 지역 값으로 덮인다
  assert.equal(
    checkDelivery(
      store({ delivery_fee: 2000, restrict_delivery_area: true }),
      [area()],
      "정담동 1",
      50000,
    ).fee,
    3000,
  );
});

test("checkDelivery: 최소주문 미달이면 부족한 금액을 알려준다", () => {
  const result = checkDelivery(
    store({ min_order_amount: 20000 }),
    [area()],
    "정담동 1",
    17000,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason ?? "", /3,000원/);
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

// 픽업 시각은 DB 에 timestamptz 로 들어간다. 여기가 틀리면 손님이 고른 시간과
// 매장이 보는 시간이 9시간 어긋나거나 하루 전날로 잡힌다.
test("seoulDate: UTC 날짜가 아니라 한국 날짜를 준다", () => {
  // 2026-08-03T15:30:00Z = 한국 시간 8월 4일 00:30
  assert.equal(seoulDate(new Date("2026-08-03T15:30:00Z")), "2026-08-04");
  assert.equal(seoulDate(new Date("2026-08-03T00:30:00Z")), "2026-08-03");
});

test("pickupTimestamp: 한국 벽시계를 +09:00 으로 붙인다", () => {
  const at = pickupTimestamp(new Date("2026-08-03T02:00:00Z"), "18:30");
  assert.equal(at, "2026-08-03T18:30:00+09:00");
  // 실제로 그 순간을 가리키는지 — 한국 18:30 = UTC 09:30
  assert.equal(new Date(at).toISOString(), "2026-08-03T09:30:00.000Z");
});

// ---- 알림 문안 ----

const NOTIFY_ORDER = {
  order_no: "20260804-0001",
  fulfillment: "delivery",
  total: 32000,
  address_snapshot: "(02745) 서울 성북구 길음로 12 101동 1001호",
  pickup_at: null,
  created_at: "2026-08-04T09:30:00+00:00",
  items: [
    { name: "김치찌개", quantity: 2 },
    { name: "시금치나물", quantity: 1 },
  ],
};

test("summarizeItems: 개수까지 붙여 요약한다", () => {
  assert.equal(
    summarizeItems(NOTIFY_ORDER.items),
    "김치찌개 2개, 시금치나물 1개",
  );
  assert.equal(summarizeItems([]), "주문 상품");
});

test("summarizeItems: 많으면 줄인다", () => {
  const many = [1, 2, 3, 4, 5].map((n) => ({ name: `반찬${n}`, quantity: 1 }));
  assert.match(summarizeItems(many, 3), /외 2가지$/);
});

test("storeMessage: 사장님이 배달 갈 주소가 들어간다", () => {
  const text = storeMessage(NOTIFY_ORDER);
  assert.match(text, /20260804-0001/);
  assert.match(text, /배달/);
  assert.match(text, /32,000원/);
  assert.match(text, /길음로 12/);
});

/**
 * 알림톡은 잠금화면에도 뜨고 옆 사람이 볼 수 있다.
 * 손님 문안에 주소가 들어가면 그게 곧 개인정보 노출이다.
 */
test("customerMessage: 손님 문안에는 주소가 없다", () => {
  for (const kind of ["order_placed", "canceled"] as const) {
    const text = customerMessage(NOTIFY_ORDER, kind) ?? "";
    assert.ok(text.length > 0, `${kind} 문안이 비어 있다`);
    assert.equal(text.includes("길음로"), false, `${kind} 에 주소가 들어갔다`);
    assert.match(text, /20260804-0001/);
  }
});

test("customerMessage: 픽업과 배달의 주문 완료 문구가 다르다", () => {
  const delivery = customerMessage(NOTIFY_ORDER, "order_placed") ?? "";
  const pickup =
    customerMessage(
      { ...NOTIFY_ORDER, fulfillment: "pickup", pickup_at: "2026-08-04T09:30:00+00:00" },
      "order_placed",
    ) ?? "";

  assert.match(delivery, /배달/);
  assert.match(pickup, /오시면/);
});

/**
 * 손님에게 가는 알림은 둘뿐이다 (사장님 결정, 2026-08).
 * 알림톡은 건당 요금이라, 단계마다 보내면 주문 하나에 네다섯 통이 나간다.
 * 중간 상태는 앱 화면에 실시간으로 보이므로 알림까지 보낼 값이 없다.
 */
test("shouldNotifyCustomer: 손님에게는 주문완료와 취소만 보낸다", () => {
  assert.equal(shouldNotifyCustomer("order_placed"), true);
  assert.equal(shouldNotifyCustomer("canceled"), true);

  for (const kind of ["accepted", "preparing", "ready", "delivering", "completed"] as const) {
    assert.equal(shouldNotifyCustomer(kind), false, `${kind} 는 보내지 않아야 한다`);
    assert.equal(customerMessage(NOTIFY_ORDER, kind), null);
  }
  // 매장용이라 손님 문안이 없다
  assert.equal(shouldNotifyCustomer("new_order"), false);
});

/**
 * 제목을 statusMeta 에서 가져오면 order_placed 가 모르는 값으로 취급돼
 * "취소됨" 이 제목으로 나간다 — 주문하자마자 취소 카톡을 받는 셈이다.
 */
test("customerMessage: 주문 완료 제목이 취소로 나가지 않는다", () => {
  const text = customerMessage(NOTIFY_ORDER, "order_placed") ?? "";
  assert.match(text, /주문 완료/);
  assert.equal(text.includes("취소"), false);
});

// ---- 결제 웹훅 서명 ----
//
// 서명이 유일한 방어선은 아니다 (통과해도 포트원에 금액을 다시 물어본다).
// 그래도 여기가 뚫리면 위조된 요청이 DB 까지 들어온다.
// 아래 시크릿은 테스트 전용 문자열이고 실제 포트원 값이 아니다.

const HOOK_SECRET = "whsec_dGVzdC1zZWNyZXQtZm9yLXVuaXQtdGVzdHMtb25seQ==";
const HOOK_BODY = '{"data":{"paymentId":"20260804-0001-abc12345"}}';
const HOOK_ID = "msg_test_1";
const NOW = 1_785_000_000_000; // 고정 시각 — 테스트가 시간에 흔들리면 안 된다
const HOOK_TS = String(Math.floor(NOW / 1000));

function signed(body = HOOK_BODY, ts = HOOK_TS, secret = HOOK_SECRET) {
  return `v1,${signBody(body, HOOK_ID, ts, secret)}`;
}

test("웹훅 서명: 제대로 서명된 요청은 통과", () => {
  const ok = verifyWebhookSignature(
    HOOK_BODY,
    { id: HOOK_ID, timestamp: HOOK_TS, signature: signed() },
    HOOK_SECRET,
    NOW,
  );
  assert.equal(ok, true);
});

test("웹훅 서명: 본문이 한 글자라도 바뀌면 거부", () => {
  const tampered = HOOK_BODY.replace("abc12345", "abc12346");
  const ok = verifyWebhookSignature(
    tampered,
    { id: HOOK_ID, timestamp: HOOK_TS, signature: signed() },
    HOOK_SECRET,
    NOW,
  );
  assert.equal(ok, false);
});

test("웹훅 서명: 다른 시크릿으로 만든 서명은 거부", () => {
  const ok = verifyWebhookSignature(
    HOOK_BODY,
    {
      id: HOOK_ID,
      timestamp: HOOK_TS,
      signature: signed(HOOK_BODY, HOOK_TS, "whsec_b3RoZXItc2VjcmV0LXZhbHVl"),
    },
    HOOK_SECRET,
    NOW,
  );
  assert.equal(ok, false);
});

// 가로챈 요청을 나중에 다시 보내는 걸 막는다
test("웹훅 서명: 5분 넘은 요청은 거부", () => {
  const old = String(Math.floor(NOW / 1000) - MAX_AGE_SECONDS - 1);
  const ok = verifyWebhookSignature(
    HOOK_BODY,
    { id: HOOK_ID, timestamp: old, signature: signed(HOOK_BODY, old) },
    HOOK_SECRET,
    NOW,
  );
  assert.equal(ok, false);
});

test("웹훅 서명: 헤더나 시크릿이 없으면 거부", () => {
  const headers = { id: HOOK_ID, timestamp: HOOK_TS, signature: signed() };
  assert.equal(
    verifyWebhookSignature(
      HOOK_BODY,
      { ...headers, signature: null },
      HOOK_SECRET,
      NOW,
    ),
    false,
  );
  assert.equal(
    verifyWebhookSignature(HOOK_BODY, { ...headers, id: null }, HOOK_SECRET, NOW),
    false,
  );
  // 시크릿을 아직 안 넣었는데 통과해 버리면 최악이다
  assert.equal(verifyWebhookSignature(HOOK_BODY, headers, "", NOW), false);
});

test("웹훅 서명: 키 교체 중 여러 서명 중 하나만 맞아도 통과", () => {
  const wrong = signBody(HOOK_BODY, HOOK_ID, HOOK_TS, "whsec_b3RoZXItc2VjcmV0");
  const ok = verifyWebhookSignature(
    HOOK_BODY,
    { id: HOOK_ID, timestamp: HOOK_TS, signature: `v1,${wrong} ${signed()}` },
    HOOK_SECRET,
    NOW,
  );
  assert.equal(ok, true);
});

// ---- 주문서 임시 저장 ----

const DRAFT_CONTEXT = {
  pickupEnabled: true,
  deliveryEnabled: true,
  addressIds: ["addr-1", "addr-2"],
  defaultAddressId: "addr-1",
  slots: ["11:00", "11:30", "12:00"],
};

test("encodeDraft/decodeDraft 왕복", () => {
  const draft = {
    fulfillment: "pickup" as const,
    addressId: "addr-2",
    slot: "11:30",
    memo: "덜 맵게 해주세요",
  };
  assert.deepEqual(decodeDraft(encodeDraft(draft)), draft);
});

test("decodeDraft: 값이 없거나 망가졌으면 빈 객체", () => {
  assert.deepEqual(decodeDraft(undefined), {});
  assert.deepEqual(decodeDraft(""), {});
  assert.deepEqual(decodeDraft("not-json"), {});
});

// 쿠키 값은 손님이 고칠 수 있다. 이상한 값이 그대로 주문에 실리면 안 된다.
test("decodeDraft: 모르는 수령 방법과 문자열 아닌 값은 버린다", () => {
  const raw = encodeURIComponent(JSON.stringify({ f: "택배", m: 42 }));
  const decoded = decodeDraft(raw);
  assert.equal(decoded.fulfillment, undefined);
  assert.equal(decoded.memo, undefined);
});

test("reconcileDraft: 저장한 값이 아직 유효하면 그대로 되살린다", () => {
  const restored = reconcileDraft(
    {
      fulfillment: "pickup",
      addressId: "addr-2",
      slot: "11:30",
      memo: "문 앞에",
    },
    DRAFT_CONTEXT,
  );
  assert.deepEqual(restored, {
    fulfillment: "pickup",
    addressId: "addr-2",
    slot: "11:30",
    memo: "문 앞에",
  });
});

/**
 * 저장한 뒤에 상황이 바뀔 수 있다. 그대로 되살리면 주문 버튼을 눌렀을 때에야 거절당한다.
 * 요청사항은 손으로 쓴 것이라 무슨 일이 있어도 지킨다.
 */
test("reconcileDraft: 지워진 배송지는 기본 배송지로 되돌린다", () => {
  const restored = reconcileDraft(
    { addressId: "삭제된주소", memo: "지켜져야 함" },
    DRAFT_CONTEXT,
  );
  assert.equal(restored.addressId, "addr-1");
  assert.equal(restored.memo, "지켜져야 함");
});

test("reconcileDraft: 지나간 픽업 시간은 지금 가장 빠른 시간으로", () => {
  assert.equal(reconcileDraft({ slot: "09:00" }, DRAFT_CONTEXT).slot, "11:00");
  // 고를 수 있는 시간이 아예 없으면 빈 값 (화면이 안내를 띄운다)
  assert.equal(
    reconcileDraft({ slot: "11:00" }, { ...DRAFT_CONTEXT, slots: [] }).slot,
    "",
  );
});

test("reconcileDraft: 사장님이 배달을 끄면 픽업으로 내려온다", () => {
  const restored = reconcileDraft(
    { fulfillment: "delivery" },
    { ...DRAFT_CONTEXT, deliveryEnabled: false },
  );
  assert.equal(restored.fulfillment, "pickup");
});

test("reconcileDraft: 저장된 것이 없으면 배달이 기본", () => {
  assert.equal(reconcileDraft({}, DRAFT_CONTEXT).fulfillment, "delivery");
  assert.equal(
    reconcileDraft({}, { ...DRAFT_CONTEXT, deliveryEnabled: false })
      .fulfillment,
    "pickup",
  );
});

test("pickupSlots: 픽업이 꺼져 있거나 마감 후면 비어 있다", () => {
  assert.deepEqual(
    pickupSlots(store({ pickup_enabled: false }), { weekday: 1, minutes: 600 }),
    [],
  );
  assert.deepEqual(pickupSlots(store(), { weekday: 1, minutes: 1250 }), []);
});

/*
 * 주문 알림. 못 울리면 사장님이 주문을 놓치고, 잘못 울리면 소리를 꺼 버리신다.
 * 둘 다 매장이 손해라 돈·재고와 같은 급으로 본다.
 */
const T = (m: number) => `2026-08-03T10:${String(m).padStart(2, "0")}:00.000Z`;

test("checkNewOrders: 첫 화면에 있던 주문은 새 주문이 아니다", () => {
  const first = checkNewOrders([T(5), T(1)], null);
  assert.equal(first.count, 0);
  assert.equal(first.watermark, Date.parse(T(5)));
});

test("checkNewOrders: 기준보다 늦게 들어온 것만 센다", () => {
  const base = Date.parse(T(5));
  assert.equal(checkNewOrders([T(5), T(1)], base).count, 0);
  assert.equal(checkNewOrders([T(6), T(5), T(1)], base).count, 1);
  assert.equal(checkNewOrders([T(8), T(7), T(5)], base).count, 2);
});

test("checkNewOrders: 기간을 넓혀 지난 주문이 쏟아져도 조용하다", () => {
  // '오늘'로 보다가 '7일'을 누르면 며칠치가 한꺼번에 들어온다.
  const base = checkNewOrders([T(5)], null).watermark;
  const wider = checkNewOrders(
    ["2026-07-28T09:00:00.000Z", "2026-07-30T09:00:00.000Z", T(5)],
    base,
  );
  assert.equal(wider.count, 0);
  assert.equal(wider.watermark, base);
});

test("checkNewOrders: 한 번에 두 건이 들어와도 기준은 가장 늦은 것으로", () => {
  const base = Date.parse(T(5));
  const next = checkNewOrders([T(9), T(7), T(5)], base);
  assert.equal(next.count, 2);
  // 같은 주문으로 두 번 울리면 안 된다.
  assert.equal(checkNewOrders([T(9), T(7), T(5)], next.watermark).count, 0);
});

test("checkNewOrders: 주문이 하나도 없다가 첫 주문이 와도 울린다", () => {
  const empty = checkNewOrders([], null);
  assert.equal(empty.count, 0);
  assert.equal(checkNewOrders([T(3)], empty.watermark).count, 1);
});

/*
 * 결제 켜짐 판정. 반쪽만 켜지면 손님은 카드로 결제되는데 주문이 안 잡힌다.
 * 특히 웹훅 시크릿 — PC 는 화면 쪽 확인이 살려 주지만 휴대폰은 리다이렉트라
 * 웹훅이 유일한 경로다. 한 번 빠뜨렸던 자리라 다섯 개를 각각 확인한다.
 */
const FULL_KEYS: PaymentKeys = {
  storeId: "store-test",
  channelKey: "channel-key-test",
  apiSecret: "api-secret",
  webhookSecret: "whsec_test",
  dbSecret: "db-secret",
};

test("isPaymentReady: 다섯 개가 다 있을 때만 켠다", () => {
  assert.equal(isPaymentReady(FULL_KEYS), true);

  for (const key of Object.keys(FULL_KEYS) as (keyof PaymentKeys)[]) {
    assert.equal(
      isPaymentReady({ ...FULL_KEYS, [key]: "" }),
      false,
      `${key} 가 없는데 결제가 켜졌다`,
    );
  }
});

test("isPaymentReady: 공백만 채운 것은 채운 게 아니다", () => {
  // Vercel 환경변수에 실수로 스페이스가 들어가는 일이 있다.
  assert.equal(isPaymentReady({ ...FULL_KEYS, webhookSecret: "   " }), false);
});

/*
 * 결제수단. 계약하지 않은 수단이 화면에 뜨면 손님이 고른 뒤에야 결제창이
 * 오류를 낸다 — 가게를 의심하게 되는 실패라 값으로 확인해 둔다.
 */
const NO_CHANNELS: PaymentChannels = { card: "", kakaopay: "", mobile: "" };

test("availableMethods: 채널키가 있는 수단만 나온다", () => {
  assert.deepEqual(availableMethods(NO_CHANNELS), []);

  const cardOnly = availableMethods({ ...NO_CHANNELS, card: "ch-card" });
  assert.deepEqual(
    cardOnly.map((m) => m.key),
    ["card"],
  );
  assert.equal(cardOnly[0].channelKey, "ch-card");
  assert.equal(cardOnly[0].payMethod, "CARD");
});

test("availableMethods: 카카오페이는 카드와 다른 채널을 쓴다", () => {
  const both = availableMethods({
    ...NO_CHANNELS,
    card: "ch-card",
    kakaopay: "ch-kakao",
  });
  assert.deepEqual(
    both.map((m) => m.key),
    ["card", "kakaopay"],
  );
  // 같은 채널로 부르면 포트원이 거절한다. 섞이지 않는지 본다.
  assert.equal(both[1].channelKey, "ch-kakao");
  assert.equal(both[1].payMethod, "EASY_PAY");
});

test("availableMethods: 공백만 든 채널키는 없는 것으로 친다", () => {
  assert.deepEqual(availableMethods({ ...NO_CHANNELS, mobile: "   " }), []);
});

test("pickMethod: 고른 것이 사라지면 첫 번째로 되돌린다", () => {
  const methods = availableMethods({
    ...NO_CHANNELS,
    card: "ch-card",
    mobile: "ch-mobile",
  });
  assert.equal(pickMethod(methods, "mobile")?.key, "mobile");
  // 화면을 오래 열어 둔 사이 사장님이 카카오페이 계약을 내렸다면
  assert.equal(pickMethod(methods, "kakaopay")?.key, "card");
  assert.equal(pickMethod(methods, null)?.key, "card");
  assert.equal(pickMethod([], "card"), null);
});

test("missingPaymentKeys: 빠진 것의 이름만 돌려준다 (값은 안 나간다)", () => {
  assert.deepEqual(missingPaymentKeys(FULL_KEYS), []);

  const half = missingPaymentKeys({
    ...FULL_KEYS,
    channelKey: "",
    dbSecret: "  ",
  });
  assert.deepEqual(half, [
    "NEXT_PUBLIC_PORTONE_CHANNEL_KEY",
    "PAYMENT_WEBHOOK_SECRET",
  ]);

  // 값이 섞여 나가면 관리자 화면에 시크릿이 찍힌다.
  const all = missingPaymentKeys({ ...FULL_KEYS, apiSecret: "" }).join(" ");
  assert.equal(all.includes(FULL_KEYS.storeId), false);
  assert.equal(all.includes(FULL_KEYS.webhookSecret), false);
});

/*
 * 목록 순서. sort_order 는 카테고리마다 1부터 다시 매겨져 있어 전체에서는
 * 중복이 많다. 동점 기준이 없으면 재고를 고칠 때마다 순서가 흔들린다.
 */
test("compareProducts: sort_order 가 같으면 이름으로 가른다", () => {
  const 목록 = [
    { sort_order: 2, name: "가지나물" },
    { sort_order: 1, name: "고추장진미채" },
    { sort_order: 2, name: "간장홍진미채" },
    { sort_order: 1, name: "고추잎무침" },
  ];

  const 정렬 = [...목록].sort(compareProducts).map((p) => p.name);
  assert.deepEqual(정렬, [
    "고추잎무침",
    "고추장진미채",
    "가지나물",
    "간장홍진미채",
  ]);

  // 순서를 어떻게 섞어 넣어도 결과가 같아야 한다. 이게 흔들리지 않는다는 뜻이다.
  const 거꾸로 = [...목록].reverse().sort(compareProducts).map((p) => p.name);
  assert.deepEqual(거꾸로, 정렬);
});
