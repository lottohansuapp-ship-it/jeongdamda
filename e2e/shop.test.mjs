/**
 * 손님이 실제로 밟는 길을 브라우저로 훑는다.
 *
 * @playwright/test 를 새로 받지 않고 node --test 로 돌린다.
 * 이 프로젝트는 이미 node --test 를 쓰고 있고, 러너를 하나 더 두면
 * 테스트를 어디서 돌리는지부터 헷갈린다. 재시도나 트레이스 뷰어가 없지만
 * 반찬가게 연기 테스트에는 필요 없다.
 *
 * 로그인이 필요한 길(담기, 주문, 결제)은 여기서 다루지 않는다.
 * 계정을 만들면 사장님의 실제 Supabase 에 사용자가 생긴다.
 * 대신 "로그인 안 하면 어디로 보내는가" 를 확인한다 — 거기가 실제로
 * 조용히 깨지는 자리다.
 *
 *   npm start          (다른 창에서)
 *   npm run test:e2e
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * 크로미움을 따로 받지 않은 컴퓨터가 많다. 기본으로 시도하고,
 * 없으면 시스템에 깔린 엣지나 크롬을 쓴다. 셋 다 없으면 이유를 말하고 멈춘다.
 */
async function launch() {
  const attempts = [undefined, "msedge", "chrome"];
  const reasons = [];

  for (const channel of attempts) {
    try {
      return await chromium.launch(channel ? { channel } : {});
    } catch (error) {
      reasons.push(`${channel ?? "chromium"}: ${error.message.split("\n")[0]}`);
    }
  }

  throw new Error(
    `브라우저를 열지 못했습니다.\n  ${reasons.join("\n  ")}\n` +
      `  npx playwright install chromium 으로 받을 수 있습니다.`,
  );
}

let browser;
let page;

before(async () => {
  const reachable = await fetch(BASE)
    .then((r) => r.ok)
    .catch(() => false);

  assert.ok(
    reachable,
    `${BASE} 에 서버가 없습니다. 다른 창에서 npm start 를 먼저 켜 주세요.`,
  );

  browser = await launch();
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
});

after(async () => {
  await browser?.close();
});

describe("손님 화면", () => {
  test("홈에 오늘의 반찬이 보인다", async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    const rows = await page.locator("article").count();
    assert.ok(rows > 0, "반찬이 한 줄도 보이지 않습니다");

    // 상호가 없으면 어느 가게인지 알 수 없다
    await assert.doesNotReject(
      page.getByText("정, 담따").first().waitFor({ timeout: 3000 }),
    );
  });

  test("검색하면 그 반찬만 남는다", async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    const before = await page.locator("article").count();
    const name = await page.locator("article h3 a").first().innerText();

    await page.getByRole("searchbox").fill(name.slice(0, 2));
    await page.waitForTimeout(400);

    const after = await page.locator("article").count();
    assert.ok(after > 0, "검색 결과가 하나도 없습니다");
    assert.ok(after <= before, "검색했는데 오히려 늘었습니다");
  });

  test("반찬을 누르면 상세로 간다", async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    const name = await page.locator("article h3 a").first().innerText();
    await page.locator("article h3 a").first().click();
    await page.waitForURL(/\/product\//);

    await assert.doesNotReject(
      page.getByText(name).first().waitFor({ timeout: 3000 }),
      "상세에 반찬 이름이 없습니다",
    );
  });

  test("품절 반찬은 담기 버튼이 없다", async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    const soldOut = page.locator("article", { hasText: "품절" });
    if ((await soldOut.count()) === 0) return; // 오늘은 품절이 없다

    const buttons = await soldOut.first().getByRole("button").count();
    assert.equal(buttons, 0, "품절인데 담기 버튼이 남아 있습니다");
  });
});

describe("로그인 가드", () => {
  // 조용히 깨지면 손님이 빈 화면을 보거나, 남의 주문을 보게 된다
  for (const path of ["/cart", "/orders", "/account", "/admin"]) {
    test(`${path} 는 로그인으로 보낸다`, async () => {
      // networkidle 을 쓰면 안 된다. 관리자 화면은 Realtime 으로 상시 연결을
      // 열어 두기 때문에 네트워크가 조용해지는 순간이 오지 않는다.
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {});
      assert.match(
        page.url(),
        /\/login/,
        `${path} 가 로그인을 거치지 않고 열렸습니다`,
      );
    });
  }

  test("담기를 누르면 로그인으로 보낸다", async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });

    const add = page.locator("article button").first();
    if ((await add.count()) === 0) return; // 오늘 담을 수 있는 반찬이 없다

    await add.click();
    await page.waitForURL(/\/login/, { timeout: 5000 });
    assert.match(page.url(), /\/login/);
  });
});

describe("법정 고지", () => {
  // PG 심사에서 확인하는 항목이다. 링크가 깨지면 심사가 막힌다.
  for (const [path, heading] of [
    ["/terms", "이용약관"],
    ["/privacy", "개인정보처리방침"],
    ["/refund", "환불"],
  ]) {
    test(`${path} 가 열린다`, async () => {
      const response = await page.goto(`${BASE}${path}`, {
        waitUntil: "domcontentloaded",
      });
      assert.equal(response.status(), 200);
      await assert.doesNotReject(
        page.getByText(heading).first().waitFor({ timeout: 3000 }),
      );
    });
  }
});
