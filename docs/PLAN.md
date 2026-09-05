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

### D27. 로그인 확인은 `getClaims()` 로. `getUser()` 는 네트워크 왕복이다.

관리자 화면과 주문서가 눈에 띄게 느렸던 원인이 전부 여기였다.
`supabase.auth.getUser()` 는 **매번 Supabase Auth 서버까지 왕복해서** 토큰을 확인한다.
그런데 이 호출이 조회 함수마다, 서버 액션마다, `proxy` 에까지 흩어져 있었다.

주문서 한 번 그리기 = proxy 1 + 프로필 1 + 장바구니 1 + 배송지 1 = **왕복 4회**.
버튼 한 번 = 액션 1 + `router.refresh()` 로 위의 4회 = **왕복 5회**.

→ `getClaims()` 는 JWT 서명을 **로컬에서** 검증한다. 이 프로젝트의 서명키는 ES256 이고
공개키(JWKS)는 auth-js 가 프로세스 전역에 캐시한다. 대칭키(HS256) 프로젝트라면
알아서 `getUser()` 로 되돌아가므로 **틀릴 수는 없고 빨라지지 않을 뿐이다.**

`serverClient()` 는 React `cache()` 로 감싸 한 요청에 하나만 만든다.

주의: 이건 성능 최적화지 보안 완화가 아니다. 서명 검증에 실패하면 그대로 거절되고,
설령 여기가 뚫려도 실제 데이터는 Postgres 의 RLS 가 같은 토큰으로 다시 판단한다.
비밀번호 변경처럼 서버가 직접 확인해야 하는 자리에는 `getUser()` 를 그대로 둔다.

### D28. 화면을 먼저 바꾸고 서버에 보낸다

`서버 액션 → router.refresh()` 는 필드 하나 바꾸는 데 화면 전체를 다시 받아온다.
사장님이 주문 상태 하나를 바꾸면 주문 100건과 그 품목이 전부 다시 왔다.

→ 누른 즉시 화면을 바꾸고 저장은 뒤따르게 한다. 실패하면 이전 값으로 되돌리고
이유를 띄운다. 장바구니 금액은 `summarizeCart()` 로 화면에서 다시 계산한다 —
서버가 쓰는 것과 **같은 함수**여야 한다. 다른 함수를 쓰면 D24 가 반복된다.

이건 어디까지나 표시다. 돈과 재고의 진실은 여전히 `place_order` 안에만 있다 (D10).

### D29. 서버 함수 지역을 서울(icn1)로 못 박는다

Supabase 프로젝트가 서울인데 Vercel 함수가 다른 지역에서 돌면 **모든 DB 조회가
그 거리만큼 왕복한다.** 미국 동부(iad1)라면 쿼리 하나에 200ms 넘게 붙고,
화면 하나에 조회가 서너 번 있으니 그대로 체감 지연이 된다.

확인해 보니 이미 `icn1` 로 돌고 있었다 (응답 헤더 `x-vercel-id: icn1::…`).
문제는 이게 대시보드 설정이라 누가 바꾸면 **에러 없이 조용히 느려진다**는 것이다.

→ `vercel.json` 에 `"regions": ["icn1"]` 로 고정한다. 설정 파일이라 주석을 못 넣어
이유를 여기 남긴다. Supabase 리전을 옮기면 이 값도 함께 옮겨야 한다.

부수 효과로 개인정보가 국내에 머문다 — 개인정보처리방침의 보관 지역 항목과 같은 사실이다.

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
- [x] 320 / 768 / 1440 반응형 확인 — 7개 폭 자동 검사, 가로 넘침 없음
- [x] Lighthouse — 성능 97 · 접근성 100 · 권장사항 100 · SEO 100 (배포 후 재확인)
- [x] 개인정보처리방침 · 이용약관 · 사업자정보 표기 (전자상거래법상 필수)
- [x] 로그 보유 기간 (0017) — 방침에 적은 파기를 실제로 하게

#### D24. 오래된 주문은 아카이빙하지 않는다

주문이 쌓이면 조회가 느려질까 봐 별도 보관 테이블을 만들려고 했다.
숫자를 놓고 보니 필요가 없었다.

하루 100건이면 1년에 3만 6천 행이다. 5년을 모아도 18만 행,
용량으로는 100MB가 안 된다. 이 규모에서 Postgres는 인덱스만 맞으면
느려지지 않는다. 느리게 만드는 것은 행 수가 아니라 **인덱스를 못 타는 조회**다.

실제로 확인한 것:

| 조회 | 인덱스 | 상태 |
|---|---|---|
| 손님 주문내역 | `orders (user_id, created_at desc)` | 있음 |
| 관리자 주문 목록 | `orders (created_at desc)` + 기간 제한 | 있음 (0015) |
| 매출 — 결제 | `orders (paid_at) where not null` | 있음 (0014) |
| 매출 — 환불 | `orders (refunded_at) where not null` | **없었음 → 0017** |

환불 집계만 매번 전체를 훑고 있었다. 인덱스 한 줄로 끝나는 일이었다.

아카이빙을 넣었다면 보관 테이블, 옮기는 작업, 두 테이블을 합쳐 보는 조회까지
따라왔을 것이다. 실측으로 드러난 문제는 인덱스 하나였다.

**대신 반드시 지워야 하는 것은 따로 있다.** 로그다. `notification_logs.recipient`
에 손님 전화번호가 들어가는데 지우는 장치가 없었다. 개인정보처리방침에는
"보유 기간이 지나면 지체 없이 파기한다"고 적어 두고서다.
90일 지난 로그를 매일 지우도록 했다 (0017). 주문 자체는 건드리지 않는다 —
전자상거래법이 계약·결제 기록을 5년 보존하라고 한다.
**지워야 하는 것과 보존해야 하는 것은 다르다.**

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

### 결제 — 테스트 먼저, 실연동은 그다음

코드는 전부 들어가 있다 (0012 적용 완료). 아래 값만 채우면 켜진다.
**넷 중 하나라도 비면 결제창을 띄우지 않고 지금처럼 주문만 접수된다**
(`isPaymentLive()`). 반쪽만 켜져서 손님 돈이 새는 일을 막기 위한 것이다.

포트원은 PG 계약 전에 **테스트 채널**을 쓸 수 있다. 그래서 순서는
테스트 결제로 흐름을 다 확인한 뒤에 심사를 넣는 것이다.

#### 1단계 — 테스트 채널로 검증 (계약 전, 지금)

**웹훅은 localhost 로 오지 않는다.** 포트원이 바깥에서 우리 서버를 부르는 것이라
`http://localhost:3000` 은 닿지 않는다. 배포본(`jeongdamda.vercel.app`)에서 한다.

**(1) 웹훅용 비밀값을 만들어 두 곳에 같은 값을 넣는다**

`service_role` 키를 쓰지 않는 이유는 D30 에 있다. 값은 한 번만 만든다.

```bash
openssl rand -base64 32
```

- Vercel → Settings → Environment Variables → `PAYMENT_WEBHOOK_SECRET`
- Supabase SQL Editor:
  ```sql
  insert into public.app_secrets (key, value)
  values ('payment_webhook', '<위에서 만든 값>')
  on conflict (key) do update set value = excluded.value;
  ```

**(2) 포트원 콘솔에서 테스트 채널을 만든다**

결제 연동 → 연동 관리 → 채널 추가. **환경을 "테스트"로** 고른다.
결제대행사는 아무거나 (KG이니시스·토스페이먼츠 테스트). 계약과 무관하다.

**결제수단마다 채널을 따로 만든다.** 카카오페이는 그 자체가 결제대행사라
카드용 채널로 부르면 거절된다. 휴대폰 결제는 보통 카드와 같은 PG 사가
중계하지만 계약은 따로 해야 한다.

주문서에는 **채널키를 넣은 수단만** 나온다. 계약하지 않은 것을 띄우면
손님이 고른 뒤에야 결제창이 오류를 내고, 그건 손님이 가게를 의심하게 되는
실패다. 하나뿐이면 고르는 화면 자체가 안 나온다.

**(3) 값 네 개를 Vercel 환경변수에 넣는다**

| 이름 | 포트원 콘솔 위치 | 성격 |
|---|---|---|
| `NEXT_PUBLIC_PORTONE_STORE_ID` | 결제 연동 → 연동 관리 (상점 아이디) | 공개 |
| `NEXT_PUBLIC_PORTONE_CHANNEL_KEY` | 결제 연동 → 연동 관리 → 방금 만든 채널 (카드) | 공개 |
| `NEXT_PUBLIC_PORTONE_CHANNEL_KEY_KAKAOPAY` | 카카오페이 채널 (별도로 만든다) | 공개 · 선택 |
| `NEXT_PUBLIC_PORTONE_CHANNEL_KEY_MOBILE` | 휴대폰 결제 채널 (같은 PG면 같은 값) | 공개 · 선택 |
| `PORTONE_API_SECRET` | 결제 연동 → 연동 관리 → 식별코드·API Keys → **V2 API** | **서버 전용** |
| `PORTONE_WEBHOOK_SECRET` | 결제 연동 → 연동 관리 → 결제알림(Webhook) 관리 → 웹훅 시크릿 발급 (`whsec_…`) | **서버 전용** |

아래 둘에 `NEXT_PUBLIC_` 을 붙이지 않는다. 붙이면 브라우저로 새어나간다.
API Secret 은 발급 화면을 벗어나면 다시 못 본다 — 그 자리에서 복사한다.

**(4) 웹훅 URL 등록**

결제 연동 → 연동 관리 → 결제알림(Webhook) 관리 → Endpoint URL:

```
https://jeongdamda.vercel.app/api/payments/webhook
```

Content-Type 은 `application/json`. 이벤트는 최소 `Transaction.Paid`,
`Transaction.Cancelled`, `Transaction.Failed`.
도메인을 바꾸면 이 값도 함께 바꾼다.

**(5) 다시 배포한다.** 환경변수는 빌드 때 박히므로 넣기만 해서는 안 바뀐다.

**(6) 테스트 카드로 확인한다 — 화면 문구가 아니라 값으로**

소리를 확인하려면 **관리자 화면을 먼저 열어 두고** 다른 기기(또는 다른 탭)에서
주문해야 한다. 주문한 뒤에 관리자로 들어가면 그 주문은 첫 화면에 이미 있는
상태라 새 주문으로 치지 않는다 — 조용한 게 정상이다.

- [ ] 주문서 버튼이 "○○원 주문하기" → **"○○원 결제하기"** 로 바뀐다
      (안 바뀌면 다섯 값 중 하나가 비었거나 재배포를 안 한 것이다)
- [ ] PC 로 관리자 주문 관리를 열고 주황 바를 눌러 소리를 켜 둔다
- [ ] **휴대폰으로** 테스트 카드 결제 → 주문이 `결제 완료`, 장바구니 비워짐
      (휴대폰이 중요하다. 리다이렉트라 웹훅만이 유일한 확정 경로다)
- [ ] 관리자 화면에 그 주문이 뜨고 **소리가 울린다**
- [ ] 채널을 여러 개 만들었다면 **수단마다 한 번씩** 결제해 본다
      (카드 채널키로 카카오페이를 부르면 거절된다 — 섞였는지는 이걸로만 안다)
- [ ] `select status, payment_id, paid_amount from orders order by created_at desc limit 1;`
      — `paid_amount` 가 주문 총액과 같은지
- [ ] 그 주문을 취소 → 승인 취소가 잡히고 **재고가 돌아온다**
      (`today_stock` 값으로 확인. 화면 뱃지로 판단하지 않는다)
- [ ] 결제창을 그냥 닫아 본다 → `pending_payment` 로 남고 10분 뒤 재고 반환
- [ ] `select * from error_logs order by created_at desc limit 10;` — 웹훅 오류가 없는지

여기까지 통과하면 심사 의뢰.

#### 2단계 — 실연동 전환 (심사 통과 후)

같은 자리에서 **실연동 채널**을 추가하고 네 값을 전부 바꾼다.
테스트와 실연동은 채널 키도 웹훅 시크릿도 다르다. 넷 중 하나만 옛 값으로
남으면 그때부터 결제가 조용히 어긋난다.

- [ ] 채널 키 교체
- [ ] API Secret 교체 (실연동용)
- [ ] 웹훅 시크릿 교체 (실연동 환경에서 다시 발급)
- [ ] 재배포 후 **소액 실제 결제 1건** → 확정 → 취소까지 확인
- [ ] `store_settings` 로 주문 받기 시작

### 출시 전
- [ ] 커스텀 도메인 연결 + `NEXT_PUBLIC_SITE_URL` 갱신 (포트원 웹훅 URL이 여기 의존)
- [x] 개인정보처리방침 / 이용약관 / 취소·환불 정책 / 사업자정보 표시
- [ ] `src/lib/store-info.ts` 의 빈칸 채우기 — 대표자, 사업자등록번호,
      통신판매업신고번호, 사업장 주소, 이메일, 개인정보 보호책임자.
      **PG 심사 신청 전에 채워야 한다.** 안 채우면 관리자 화면에 계속 뜬다
- [ ] QR 코드 제작 (도메인 확정 후)

---

## 닫힌 질문 (2026-08-05 사장님 확인)

가정으로 만들어 두고 물어봤던 셋이다. 셋 다 만든 대로가 맞다는 답을 받았다.
답만 받은 게 아니라 코드와 대조해서 실제로 그렇게 되어 있는지도 확인했다.

1. **배달은 사장님이 직접 한다.** 그래서 배달 상태를 관리자 화면에서 손으로 넘긴다.
   `nextStatuses` 가 `preparing → delivering → completed` 로 이어 준다.
   나중에 배달대행을 붙이면 그 자리에 API가 들어간다. 지금 구조를 바꿀 필요는 없다.

2. **픽업은 30분 단위.** `SLOT_MINUTES = 30`, `pickup_lead_minutes` 이후부터 마감까지.

3. **손님 취소는 사장님이 접수하기 전까지.** 접수했다는 건 이미 반찬을 담고 있다는 뜻이다.
   `canCustomerCancel` 이 `pending_payment` 와 `paid` 만 허용한다.

   **이건 화면 규칙이 아니라 DB 규칙이다.** `begin_cancel` 안에서 막는다.

   ```sql
   if not v_admin and v_order.status not in ('pending_payment', 'paid') then
     raise exception '이미 준비가 시작되었어요. 매장에 연락해 주세요.';
   end if;
   ```

   화면이 버튼을 감추는 건 UX 고, 방어선은 여기다. 손님이 요청을 직접 만들어
   보내도 접수된 주문은 취소되지 않는다.
   지금은 사장님 접수(`accepted`) 전까지만 손님이 취소 가능하다고 가정한다.
