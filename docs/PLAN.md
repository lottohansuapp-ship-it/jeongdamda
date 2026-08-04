# 오늘의 반찬 — 설계 및 구현 계획

요구사항을 그대로 두지 않고, 만들 수 있는 형태로 결정을 내린 문서다.
스펙과 다르게 정한 부분은 "결정 기록"에 이유와 함께 남긴다. 결정이 뒤집히면 지우지 않고
**superseded 로 표시**한다 — 왜 그렇게 갔다가 왜 돌아왔는지가 다음 사람에게 필요한 정보다.

- **v1 (완료)**: 카탈로그 + 실시간 재고 + 관리자 재고 관리
- **v2 (진행 중)**: 회원 · 장바구니 · 주문(픽업/배달) · 결제(포트원) · 카카오 알림톡
- **v3 (이후)**: 리뷰, 단골/포인트, 정기구독, 네이버 지도, 배달대행 연동

---

## 결정 기록

### D1. 스펙의 DB 스키마로는 요구한 UI를 그릴 수 없다 — 컬럼 5개 조정

| 원안 | 변경 | 이유 |
|---|---|---|
| `Category.order` | `sort_order` | `order` 는 SQL 예약어 |
| (없음) | `Product.sort_order` | 관리자 "순서 변경"에 대응 컬럼이 없었음 |
| (없음) | `Product.made_today` | "오늘 만든 반찬" / TODAY 뱃지 전용. `today_available`(판매 ON/OFF)과 다른 개념 |
| `price` 타입 미지정 | `integer` | 원화는 소수점이 없다. numeric/float은 반올림 버그 유발 |
| `recommended` | 유지 + `sort_order` 병용 | "사장님 추천 3개"는 `recommended = true` 상위 3개 |

### D2. 품절 상태 정의

- `today_available = false` → **손님 화면에서 완전히 제외**
- `today_available = true` + `today_stock = 0` → **목록에 보이되 🔴 품절**, 담기 불가
- 임계값은 `src/lib/stock.ts` 한 곳: `0` 품절 / `1~5` 얼마 안 남음(🔥) / `6+` 충분
- 뱃지 계산은 `stockStatus()` 단일 함수. 복사 금지.

### ~~D3. "실시간 재고" vs "성능" — 태그 무효화로 양립~~ → **D10 으로 대체됨 (superseded)**

v1에는 주문이 없어 재고가 관리자 수정으로만 바뀌었다. 그래서
`cacheLife('max')` + 관리자 액션의 `updateTag` 조합이 성립했고, 실제로 `/` 가 정적 프리렌더됐다.

**v2에서 이 전제가 깨진다.** 손님 주문으로도 재고가 바뀐다. D10 참조.

### D4. 검색·카테고리 필터는 클라이언트 상태

URL 쿼리스트링 대신 클라이언트 `useState`. 서버 왕복 0, 즉시 반응, 목록 전체가 정적 셸에 들어간다.
반찬가게 상품 수는 수십~수백 개 규모라 전량 전송이 안전하다.

### D5. 테스트 범위

v1은 순수 함수 단위 테스트(`stockStatus`, `formatPrice`, `normalize`, `filterProducts`) 15개 + 빌드 통과.
**v2에서는 기준을 올린다** — 돈과 재고가 걸리기 때문이다. D14 참조.

### D6. 오프라인 캐시는 범위 밖

`app/manifest.ts` 는 의존성 없이 "홈화면 추가"를 제공한다 → 포함.
서비스워커 오프라인 캐시는 v2의 주문 흐름과 궁합이 나쁘다 (낡은 재고로 주문하게 됨) → 보류.

### D7. Supabase 프로젝트

사용자가 기존과 **다른 Google/GitHub 계정**으로 Supabase·GitHub·Vercel을 개설했다.
프로젝트 ref `yzwsmzharmwgzktmgobj`. 세션의 Supabase MCP 커넥터는 구 계정에 붙어 있어 조작 불가.
→ DB 변경은 `supabase/migrations/*.sql` 파일로 관리하고 사용자가 SQL Editor / `supabase db push` 로 적용한다.

### D8. 숨긴 상품은 anon 에게 아예 노출하지 않는다

`products_public_read` 를 `using (today_available = true)` 로 좁혔다.
`using (true)` 면 오늘 안 파는 상품도 REST 엔드포인트를 직접 치면 읽힌다.
대가로 관리자 조회는 `serverClient()` 를 쓰고 `'use cache'` 를 못 쓴다 — 관리자는 한 명이라 비용 0.

**여기서 실제로 버그를 냈다 (0004 로 수정).** 정책을 좁히면서 대상 role 을
`to anon, authenticated` → `to anon` 으로 같이 줄여버렸다. 그 결과 손님이 로그인하는 순간
role 이 `authenticated` 로 바뀌며 **상품이 전부 안 보였다.**

카탈로그 화면은 쿠키 없는 `publicClient()`(anon)를 쓰기 때문에 증상이 드러나지 않았고,
v2-A 검증에서 로그인 토큰으로 조회해 보고서야 발견했다. 장바구니·주문서·주문 생성은
세션 클라이언트를 쓰므로 그대로 뒀으면 v2-B 첫 화면에서 터졌을 것이다.

교훈: **RLS 정책을 바꿀 때는 익명·로그인·관리자 세 role 로 각각 조회해 본다.**
한 role 로만 확인하면 나머지 둘이 조용히 깨진다.

### D9. "로그인함 = 관리자" 는 인증이 아니다 — `admins` 테이블로 분리

`for all to authenticated using (true)` 에는 구멍이 둘 있었다. Postgres에서 `FOR ALL` 은 SELECT를 포함하고,
새 Supabase 프로젝트는 공개 회원가입이 기본 ON이다. 즉 아무나 가입해서 전체 반찬을 읽고 지울 수 있었다.
→ `public.admins` + `public.is_admin()` 을 두고 모든 쓰기 정책이 통과해야 한다.
대시보드의 "회원가입 끄기"는 2차 방어선으로만 쓴다.

**v2에서 회원가입을 다시 연다.** 손님 계정이 필요하기 때문이다. 그래서 D9가 더 중요해졌다 —
이제 1차 방어선이 유일한 방어선이다.

### D10. 화면의 재고는 안내, 진실은 DB 차감 시점 (D3 대체)

주문이 생기면 "표시된 재고를 항상 정확하게" 만드는 것은 불가능하다.
두 손님이 같은 화면을 보고 있는 순간에도 숫자는 달라진다. 그걸 쫓지 않는다.

**대신 초과판매를 물리적으로 불가능하게 만든다.**

- 목록/상세: `cacheLife('minutes')` + `cacheTag('products')`. 몇 초 낡아도 된다.
- 관리자 수정, 주문 확정 → `updateTag('products')`
- 실제 차감은 DB 함수 `public.place_order(...)` 안에서만. `update ... where today_stock >= qty` 가
  0행이면 예외 → 트랜잭션 전체 롤백.
- 여러 품목은 `product_id` 정렬 후 차감. 순서 없이 동시에 여러 행을 잠그면 교착이 난다.
- 앱 코드의 재고 검사는 **UX용 안내**일 뿐 방어선이 아니다.

### D11. 재고는 장바구니가 아니라 결제 시작 시점에 잡는다

장바구니에 담을 때 재고를 잡으면, 담아두고 안 사는 손님이 재고를 말려 죽인다.
→ 담기는 자유. `place_order` 가 호출되는 순간(결제창 띄우기 직전)에만 잡는다.
→ 장바구니 화면은 담긴 상품이 품절/부족이면 그 자리에서 알려준다 (담기 취소는 아님).

### D12. 미결제 주문의 재고 회수는 **지연 정리(lazy sweep)** 로 한다

결제창을 띄우고 손님이 창을 닫으면 재고가 잡힌 채 남는다. 되돌려야 한다.

크론으로 10분마다 청소하는 게 교과서적이지만, Vercel Hobby 플랜의 크론은 하루 1회라
10분 만료에 쓸 수 없다. 그리고 스케줄러는 조용히 죽는다.

→ **`place_order` 함수가 시작할 때 만료된 `pending_payment` 주문을 먼저 회수한다.**
스케줄러가 필요 없고, 재고가 필요한 바로 그 순간에 정리된다.
크론이 가능해지면 보조 수단으로 추가하되, 이 경로를 제거하지 않는다.

만료 시간: 결제 시작 후 **10분**.

### D13. 알림톡은 어댑터 뒤에 둔다 — 서류가 코드를 막지 않게

카카오 알림톡은 비즈니스 채널 개설 + 발송 대행사 계약 + **템플릿 사전 승인**이 필요하고,
승인에 며칠~2주가 걸린다. 이걸 기다리면 v2 전체가 멈춘다.

→ `src/lib/notify/` 에 인터페이스를 두고 구현 두 개를 준비한다.
- `LogNotifier` — `notification_logs` 테이블에 기록만 (개발/승인 대기 중)
- `AlimtalkNotifier` — 실제 발송

환경변수로 전환한다. 승인이 나면 코드 한 줄도 안 고치고 켠다.
**발송 기록은 두 구현 모두 `notification_logs` 에 남긴다.** 안 갔는지 못 갔는지 알아야 한다.

### D14. v2 테스트 기준 상향

돈과 재고가 걸린 로직은 눈으로 확인할 수 없다. 반드시 테스트를 남긴다.

- 순수 함수: 장바구니 합계, 배달비 계산, 최소주문금액 판정, 영업시간 판정, 주문 상태 전이 규칙
- DB 함수: `place_order` 동시성 — 재고 1개에 두 주문을 동시에 넣어 하나만 성공하는지
- 웹훅 멱등성: 같은 `payment_id` 로 두 번 호출해도 재고·알림이 한 번만
- E2E(Playwright): 담기 → 주문서 → 결제(테스트 키) → 주문내역 반영

### D15. 네이티브 래핑(Capacitor)은 하지 않는다

"네이티브 앱처럼"은 PWA로 충분히 만족된다 — standalone 표시, 하단 탭 내비게이션, 웹 푸시.
Capacitor를 넣으면 앱스토어 심사·서명·빌드 파이프라인이 통째로 따라온다.

**iOS 한계는 미리 알아둔다**: iOS Safari의 웹 푸시는 손님이 **홈화면에 추가한 뒤에만** 동작한다.
그래서 주문 상태 알림은 푸시에 의존하지 않고 주문 내역 화면에서 항상 확인 가능해야 한다.

앱스토어 등록이 실제로 필요해지면 그때 Capacitor를 검토한다.

### D16. 외부 계약이 필요한 것은 코드부터, 스위치는 마지막에

카카오 로그인(개발자센터 앱 등록)과 포트원(사업자 심사)은 사용자의 결정으로
**코드는 지금 다 넣되 활성화는 마지막 단계**에서 한다.

그래서 둘 다 **환경변수 하나로 켜고 끄는 형태**로 만든다.

| 기능 | 꺼져 있을 때 | 켤 때 |
|---|---|---|
| 카카오 로그인 | 로그인 화면에 카카오 버튼이 **안 보인다**. 이메일 로그인만 동작 | `NEXT_PUBLIC_KAKAO_LOGIN_ENABLED=1` + Supabase Provider 활성화 |
| 포트원 결제 | 테스트 키로 결제창까지 동작. 실 승인 없음 | 실 키 교체 + 웹훅 URL 등록 |
| 알림톡 | `LogNotifier` 가 DB에만 기록 (D13) | `ALIMTALK_ENABLED=1` |

버튼을 숨기는 것이지 코드를 빼는 게 아니다. 켜는 날 고칠 코드가 없어야 한다.

### D17. 로그인 화면은 하나로 합친다

`/admin/login` 을 따로 두면 폼·검증·에러 처리가 두 벌이 된다.
손님과 사장님은 **같은 Supabase Auth 사용자**이고 다른 건 `admins` 등록 여부뿐이다.

→ `/login` 하나. `?next=` 로 목적지를 받는다. `proxy.ts` 가 보호 경로에서 여기로 보낸다.
→ 기존 `/admin/login` 은 삭제한다.

### D18. 이름·휴대폰은 가입 때 받는다. 가입 경로는 이메일과 카카오 둘.

주문 없이 계정만 있는 손님은 매장에 쓸모가 없고, 사장님이 연락할 방법이 없는 주문은
사고가 났을 때 손쓸 수가 없다. 그래서 가입 시점에 받는다.

- **이메일 가입**: 이름 · 휴대폰 · 이메일 · 비밀번호를 한 폼에서 받는다.
  `signUp` 의 `options.data` 로 넘기면 가입 트리거가 `profiles` 에 그대로 심는다.
- **카카오 가입**: 카카오는 이름(닉네임)은 주지만 **휴대폰 번호는 주지 않는다.**
  전화번호 제공은 카카오 비즈니스 앱 심사를 따로 통과해야 하는 항목이다.
  → 카카오 콜백 직후 프로필이 비어 있으면 `/signup/phone` 으로 보내 **번호만** 받는다.
  화면 하나, 입력 칸 하나. 여기서 이탈할 이유가 없다.

번호는 `010-1234-5678` 형태로 정규화해서 저장한다. 알림톡·주문 연락 모두 이 형식을 기대한다.
`/account` 에서 언제든 수정 가능하다.

### D19. 주소 입력은 다음 우편번호 서비스를 쓴다

손님이 주소를 자유 입력하면 `delivery_areas` 매칭이 무너진다. 오타 하나로 배달비가 틀린다.
다음(카카오) 우편번호 서비스는 **API 키 없이 무료**이고 한국에서 사실상 표준이다.

→ 우편번호·도로명은 검색 결과에서만 채우고, 손님은 **상세주소만** 직접 입력한다.

### D20. `place_order` 는 SECURITY DEFINER 여야 한다

손님은 `products` 에 UPDATE 권한이 없다 — `products_admin_write` 가 `is_admin()` 을 요구한다.
그래서 `reorder_products` 처럼 `SECURITY INVOKER` 로 짜면 재고 차감이 **매번 0행**이 되고,
함수는 "재고 부족"이라고 결론낸다. 0004 와 같은 조용한 0행 실패다.

→ `SECURITY DEFINER` 로 만든다. 그러면 RLS 가 더 이상 보호해 주지 않으므로 **함수가 직접 권한을 확인한다.**

- `user_id` 를 **인자로 받지 않는다.** 반드시 함수 안에서 `auth.uid()` 로 구한다.
  인자로 받으면 남의 계정으로 주문을 넣을 수 있다.
- `set search_path = ''` 를 쓰므로 `auth.uid()` 처럼 스키마를 붙여 호출한다.
- 장바구니·주소 조회는 항상 `where user_id = v_user` 로 건다.

### D21. 금액은 인자로 받지 않고 함수가 다시 계산한다

`summarizeCart` 는 화면 표시용이다. 금액을 클라이언트가 보내면 반찬 57개를 100원에 살 수 있고,
결제 웹훅의 금액 검증은 **위조된 총액과 비교**하므로 그대로 통과한다.

→ `place_order` 는 `fulfillment`, `address_id`, `pickup_at`, `memo` 만 받는다.
`subtotal` · `delivery_fee` · `total` 은 `products.price` 와 `delivery_areas.fee` 에서 직접 계산한다.

### D22. 장바구니는 주문 시점이 아니라 결제 완료 시점에 비운다

결제창을 닫고 나온 손님이 **빈 장바구니**를 마주하면 처음부터 다시 담아야 한다.
재고는 10분 뒤 회수되는데 손님의 바구니는 돌아오지 않는다.

→ `place_order` 는 `cart_items` 를 건드리지 않는다. 웹훅이 `paid` 로 전이할 때 비운다.

### D23. 손님의 주문 취소는 사장님 접수 전까지

`pending_payment` · `paid` 상태에서는 손님이 직접 취소할 수 있다.
사장님이 `accepted` 를 누르는 순간부터는 포장이 시작될 수 있으므로 매장에 연락해야 한다.

### D24. 화면의 판단과 DB 의 판단이 갈리면 안 된다 (0004 이후 두 번째)

`checkDelivery()` 가 `restrict_delivery_area` 를 보지 않아, 지역 제한이 꺼져 있는데도
화면은 "아직 이 지역은 배달이 어려워요"로 막고 `place_order` 는 같은 주문을 받아줬다.
손님은 왜 안 되는지 영영 알 수 없다.

0004 와 같은 종류다. **한쪽이 조용히 0행을 돌려주거나 한쪽만 더 엄격하면, 그 차이는
에러가 아니라 침묵으로 나타난다.** 사람이 알아채기 전까지 손해가 계속 쌓인다.

→ 손님의 행동을 막는 판단은 **한 곳에만** 둔다. 화면이 쓰는 함수와 DB 함수의 분기가
같은지 테스트로 고정한다. v2-E 웹훅의 금액 검증도 같은 규칙을 따른다 —
"클라이언트가 성공이라 말했다"와 "포트원 조회 결과가 일치한다"를 같은 자리에 두지 않는다.

### D25. `cancel_order` 도 SECURITY DEFINER 여야 한다 (D20 과 같은 이유)

손님은 `products` 에 UPDATE 권한이 없다. 취소 시 재고를 되돌리는 UPDATE 를 앱 코드에서
하면 RLS 가 0행으로 막고, **주문만 취소되고 재고는 영영 묶인다.** 에러도 안 난다.

→ `cancel_order()` 는 SECURITY DEFINER. RLS 가 지켜주지 않으므로 함수가 직접
`auth.uid()` 와 `is_admin()` 을 확인한다. 남의 주문에는 '권한 없음'이 아니라
'주문을 찾을 수 없습니다'로 답한다 — 권한 오류는 그 주문번호가 존재한다고 알려주는 셈이다.

### D26. 픽업 시각은 한국 벽시계, 서버가 다시 검증한다

`pickup_at` 은 `timestamptz` 인데 손님이 고르는 것은 `"18:30"` 이라는 벽시계다.
서버는 UTC 로 돌기 때문에 그냥 날짜를 붙이면 하루가 어긋난다.

→ `pickupTimestamp()` 가 한국 날짜에 `+09:00` 을 붙인다 (한국은 1988년 이후 서머타임 없음).
그리고 `place_order` 는 `p_pickup_at is null` 인지만 보므로 **지나간 시각도 통과시킨다.**
서버 액션이 슬롯 목록을 그 자리에서 다시 만들어 그 안에 있는 값만 받는다.
손님이 보낸 문자열은 신뢰 경계 바깥이다.

---

## 데이터 모델

### v1 (적용됨)

```
categories  id, name, slug, sort_order, created_at
products    id, category_id, name, description, price(int), origin, allergy, storage,
            pairing, photo_path, today_stock(int), today_available, made_today,
            recommended, sort_order, created_at, updated_at
admins      user_id (→ auth.users), created_at
```

### v2 (추가)

```
profiles
  id            uuid pk → auth.users(id) on delete cascade
  name          text
  phone         text                     -- 알림톡/연락용
  created_at    timestamptz default now()

addresses
  id            uuid pk
  user_id       uuid → auth.users(id) on delete cascade
  label         text                     -- 집, 회사
  postcode      text
  address1      text not null            -- 도로명/지번
  address2      text                     -- 상세주소
  is_default    boolean default false
  created_at    timestamptz default now()

cart_items
  user_id       uuid → auth.users(id) on delete cascade
  product_id    uuid → products(id) on delete cascade
  quantity      int not null check (quantity > 0)
  updated_at    timestamptz default now()
  primary key (user_id, product_id)

orders
  id                 uuid pk
  order_no           text unique              -- 사람이 부르는 번호 (예: 20260803-0007)
  user_id            uuid → auth.users(id) on delete set null
  status             text not null            -- 아래 상태 표 참조
  fulfillment        text not null            -- 'pickup' | 'delivery'
  -- 스냅샷 (주소를 지워도 주문 내역이 깨지지 않게)
  receiver_name      text not null
  receiver_phone     text not null
  address_snapshot   text                     -- delivery 일 때만
  pickup_at          timestamptz              -- pickup 일 때만
  -- 금액 (전부 원 단위 정수)
  subtotal           int not null
  delivery_fee       int not null default 0
  total              int not null
  memo               text
  reserved_until     timestamptz              -- pending_payment 만료 시각
  paid_at            timestamptz
  canceled_at        timestamptz
  cancel_reason      text
  created_at         timestamptz default now()
  updated_at         timestamptz default now()

order_items
  id            uuid pk
  order_id      uuid → orders(id) on delete cascade
  product_id    uuid → products(id) on delete set null   -- 상품 삭제해도 주문은 남는다
  name          text not null            -- 스냅샷
  unit_price    int  not null            -- 스냅샷
  quantity      int  not null check (quantity > 0)
  line_total    int  not null

payments
  id                uuid pk
  order_id          uuid → orders(id) on delete cascade
  provider          text not null default 'portone'
  payment_id        text unique not null     -- 포트원 결제 ID (멱등 키)
  method            text                     -- card, kakaopay, ...
  amount            int  not null            -- 포트원에서 재조회한 실제 금액
  status            text not null            -- pending | paid | failed | canceled | refunded
  raw               jsonb                    -- 원문 보관 (분쟁 대비)
  created_at        timestamptz default now()
  updated_at        timestamptz default now()

store_settings                              -- 단일 행 (id = 1)
  id                  int primary key default 1 check (id = 1)
  is_open             boolean default true   -- 임시 휴무 스위치
  open_time           time                   -- 주문 접수 시작
  close_time          time                   -- 주문 접수 마감
  closed_weekdays     int[]                  -- 0=일 … 6=토
  pickup_enabled      boolean default true
  delivery_enabled    boolean default true
  min_order_amount    int default 0          -- 배달 최소주문금액
  pickup_lead_minutes int default 30         -- 최소 준비 시간
  notice              text                   -- 상단 공지 한 줄
  updated_at          timestamptz default now()

delivery_areas
  id            uuid pk
  name          text not null            -- '정담동', '○○아파트'
  fee           int  not null default 0
  min_amount    int                      -- 지역별 최소주문금액 (없으면 store_settings 값)
  is_active     boolean default true
  sort_order    int default 0

notification_logs
  id            uuid pk
  order_id      uuid → orders(id) on delete set null
  channel       text not null            -- 'alimtalk' | 'log'
  template_code text
  recipient     text
  payload       jsonb
  status        text not null            -- queued | sent | failed
  error         text
  created_at    timestamptz default now()
```

### 주문 상태

| status | 뜻 | 다음 상태 |
|---|---|---|
| `pending_payment` | 재고 잡고 결제창 띄운 상태 | `paid`, `canceled`(만료/실패) |
| `paid` | 결제 검증 완료. 매장에 알림 발송 | `accepted`, `canceled`(환불) |
| `accepted` | 사장님 접수 | `preparing` |
| `preparing` | 조리/포장 중 | `ready`(픽업), `delivering`(배달) |
| `ready` | 픽업 준비 완료 | `completed` |
| `delivering` | 배달 출발 | `completed` |
| `completed` | 수령 완료 | — |
| `canceled` | 취소 (재고 복구됨) | — |

상태 전이 규칙은 `src/lib/orders.ts` 의 순수 함수 하나에 모은다. 화면마다 if 문을 흩뿌리지 않는다.

### RLS 요약

| 테이블 | anon | 로그인 손님 | 관리자 |
|---|---|---|---|
| categories | SELECT | SELECT | ALL |
| products | SELECT (`today_available = true`) | 동일 | ALL |
| profiles / addresses / cart_items | ✕ | 본인 행만 ALL | SELECT |
| orders / order_items | ✕ | 본인 행 SELECT, INSERT는 함수 경유 | ALL |
| payments | ✕ | 본인 주문 건 SELECT | ALL |
| store_settings / delivery_areas | SELECT | SELECT | ALL |
| notification_logs | ✕ | ✕ | SELECT |

---

## 주문·결제 흐름

```
[손님]                          [서버]                        [포트원]        [매장]

담기 ─────────────────────────▶ cart_items upsert
                                 (재고 안 잡음)

주문서 작성 ──────────────────▶ 영업시간/최소금액/배달지역 검증
                                 배달비 계산

"결제하기" ───────────────────▶ place_order() ── 단일 트랜잭션
                                  ① 만료된 pending 회수
                                  ② 상품을 id 순으로 FOR UPDATE 잠금 (D20)
                                  ③ 금액을 서버가 다시 계산 (D21)
                                  ④ 재고 차감 (부족하면 예외 → 전체 롤백)
                                  ⑤ orders(status=pending_payment,
                                           reserved_until=now()+10분)
                                  ⑥ order_items 스냅샷 기록
                                     ※ 장바구니는 건드리지 않는다 (D22)
                                 ↓ order_id, order_no, total 반환

결제창 ◀────────────────────────────────────────────── SDK
결제 진행 ──────────────────────────────────────────▶ 승인

                                 웹훅 수신 ◀──────────── 결제 완료 통지
                                  ① payment_id 로 멱등 확인
                                  ② 포트원 API 재조회
                                  ③ 금액 == orders.total 확인
                                  ④ status = paid, paid_at 기록
                                  ⑤ updateTag('products')
                                  ⑥ 알림톡 발송 ───────────────────────▶ 새 주문 알림

주문내역 ◀──────────────────── 상태 조회 (캐시 안 함)
```

**실패 경로**
- 재고 부족 → `place_order` 예외 → "○○이(가) 방금 품절되었어요" 안내, 장바구니 유지
- 결제 취소/이탈 → 주문은 `pending_payment` 로 남음 → 10분 뒤 다음 `place_order` 가 회수
- 금액 불일치 → `paid` 로 올리지 않음. `payments.status = failed`, 주문은 만료 처리, 로그 남김
- 웹훅 중복 → `payment_id` unique 제약에 걸려 두 번째는 무시

---

## 단계

### v1 — 완료
- [x] Next.js 16 + TS + Tailwind v4, Pretendard 서브셋 셀프호스팅, 디자인 토큰
- [x] 스키마 + RLS + `is_admin()` + 시드 57종
- [x] 메인(추천 캐러셀 / 국·찌개 / 검색 / 카테고리 / 필터 / 카드), 상세, 404
- [x] 관리자 로그인, 재고 스테퍼(낙관적+디바운스+롤백), CRUD, 순서 변경
- [x] PWA manifest, robots, sitemap
- [x] 테스트 15개 · 빌드 · 린트 통과 · **실데이터 렌더 검증 완료**

### v2-A — 회원 (선행. 나머지 전부가 여기 의존)
- [ ] `0003_customer.sql` — `profiles`, `addresses` + RLS + 가입 트리거
- [ ] `/login` 통합 로그인/가입 (D17) — 가입 폼에 이름·휴대폰 포함 (D18),
      카카오 버튼은 환경변수로 노출 (D16)
- [ ] `/auth/callback` — OAuth 코드 교환 + 프로필 완성 여부 검사
- [ ] `/signup/phone` — 카카오 가입자용 휴대폰 입력 (D18)
- [ ] `/account` — 내 정보(이름·휴대폰), 배송지 CRUD, 기본 배송지 (D19)
- [ ] `proxy.ts` 확장: `/cart`, `/checkout`, `/orders`, `/account` 로그인 가드
- [ ] `/admin/login` 삭제 → `/login?next=/admin` 으로 통합 (D17)

### v2-B — 장바구니
- [ ] `cart_items` 마이그레이션 + RLS
- [ ] 상세/카드에서 담기 (수량 스테퍼)
- [ ] `/cart` — 품목·수량 변경·삭제, 소계, 품절/부족 경고
- [ ] 하단 탭 내비게이션 + 장바구니 뱃지 (네이티브 느낌의 핵심)

### v2-C — 매장 설정 (주문서가 이걸 읽는다)
- [ ] `store_settings`, `delivery_areas` 마이그레이션 + RLS
- [ ] 관리자 화면: 영업시간, 임시 휴무, 픽업/배달 on-off, 최소주문금액, 준비시간, 공지
- [ ] 관리자 화면: 배달 지역·배달비 관리
- [ ] 순수 함수 + 테스트: 영업중 판정, 배달비 계산, 최소금액 판정, 픽업 가능 시간대 생성

### v2-D — 주문
- [ ] `orders`, `order_items` 마이그레이션 + RLS
- [ ] **`place_order()` DB 함수** — 만료 회수 → 정렬 차감 → 주문 생성 (D10, D12)
- [ ] `/checkout` — 픽업/배달 선택, 배송지/픽업시간, 요청사항, 금액 요약
- [ ] `/orders`, `/orders/[id]` — 상태 추적 타임라인
- [ ] 관리자 주문 목록 — 신규 배지, 접수/조리/완료 상태 전환
- [ ] 동시성 테스트: 재고 1개 · 동시 주문 2건 → 정확히 1건만 성공

### v2-E — 결제
- [ ] `payments` 마이그레이션 + RLS
- [ ] 포트원 V2 SDK 결제창 연동 (테스트 키로 먼저)
- [ ] `/api/payments/webhook` — 재조회 · 금액 검증 · 멱등 처리
- [ ] 결제 실패/이탈 UX, 주문 취소 및 환불 요청
- [ ] 웹훅 멱등성 테스트

### v2-F — 알림
- [ ] `notification_logs` 마이그레이션
- [ ] `src/lib/notify/` 어댑터 (`LogNotifier` 먼저, `AlimtalkNotifier` 나중) — D13
- [ ] 알림톡 템플릿 문안 작성 및 승인 신청 (아래 참조)
- [ ] 관리자 화면 신규 주문 실시간 표시 (Supabase Realtime)
- [ ] 웹 푸시 (선택) — iOS는 홈화면 추가 후에만 동작 (D15)

### v2-G — 마감
- [ ] E2E: 담기 → 주문서 → 테스트 결제 → 주문내역 (Playwright)
- [ ] 320 / 768 / 1440 반응형 확인
- [ ] Lighthouse 실측 (배포 후)
- [ ] 개인정보처리방침 · 이용약관 · 사업자정보 표기 (전자상거래법상 필수)

### v3 — 이후
리뷰, 단골/포인트, 정기 반찬 구독, 네이버 지도, 배달대행 연동, 카카오톡 채널 문의

---

## 사용자가 직접 해야 하는 것

### 이미 완료
- [x] Supabase 프로젝트 생성, anon 키 입력
- [x] `0001_init.sql`, `0002_seed.sql` 적용
- [x] 사장님 계정 생성 + `admins` 등록
- [x] 공개 회원가입 끄기

### v2 시작 전 — 되돌려야 할 것
- [ ] **공개 회원가입 다시 켜기.** v2는 손님 계정이 필요하다.
      D9의 `admins` 테이블이 관리자 권한을 막고 있으므로 안전하다.
- [ ] Supabase → Authentication → Providers → **Kakao 활성화**
      (카카오 개발자센터에서 앱 생성 → REST API 키 / Client Secret → Redirect URI 등록)

### v2 진행 중 — 병행 가능 (심사가 코드를 막지 않게 D13 참조)
- [ ] **사업자등록증** — 포트원·알림톡 모두 필수
- [ ] **포트원 가입 및 PG 계약** — 프로모션 중인 PG사 확인 후 심사 신청.
      심사 전에는 **테스트 키로 개발 진행 가능**
- [ ] **카카오 비즈니스 채널 개설** + 발송 대행사 계약(솔라피/알리고 등)
- [ ] **알림톡 템플릿 사전 승인** — 아래 문안으로 신청 (승인 며칠~2주)

**알림톡 템플릿 초안 (매장 수신용)**
```
[오늘의 반찬] 새 주문이 들어왔어요

주문번호: #{주문번호}
수령방법: #{수령방법}
주문금액: #{주문금액}원
주문시각: #{주문시각}

#{상품요약}

주문 확인하기
```
변수는 대행사 규격에 맞춰 조정한다. 버튼은 `/admin` 링크.

### 출시 전
- [ ] 커스텀 도메인 연결 + `NEXT_PUBLIC_SITE_URL` 갱신 (포트원 웹훅 URL이 여기 의존)
- [ ] 포트원 대시보드에 **웹훅 URL 등록**
- [ ] 개인정보처리방침 / 이용약관 / 사업자정보 페이지
- [ ] QR 코드 제작 (도메인 확정 후)

---

## 열려 있는 질문

구현하다 답이 필요해지면 여기서 물어본다. 지금 막고 있지는 않다.

1. **배달을 사장님이 직접 하는가?** 직접이라면 배달 상태를 사장님이 수동 전환하면 된다.
   나중에 배달대행을 붙이면 그 자리에 API가 들어간다.
2. **픽업 시간 단위** — 30분 단위 슬롯인지, "가능한 한 빨리"만인지.
   지금은 `pickup_lead_minutes` 이후 30분 단위 슬롯으로 가정한다.
3. **주문 취소를 손님이 직접 할 수 있는 시점** — `paid` 까지만인지, `accepted` 전까지인지.
   지금은 사장님 접수(`accepted`) 전까지만 손님이 취소 가능하다고 가정한다.
