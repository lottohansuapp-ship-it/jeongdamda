@AGENTS.md

# 정, 담따 반찬가게

실제 매장의 상호다. 간판은 검은 굵은 글씨 **「정, 담따」** 옆에 빨간 라운드 사각형 배지
**「반찬 / 가게」**(두 줄). 전화 02-6953-8086.

간판 서체는 상용 폰트라 웹에 실을 수 없어 Pretendard 굵기 + 좁은 자간으로 대신한다.
알아보게 하는 건 빨간 배지이므로 그건 두 줄 배치까지 그대로 재현했다.
화면에 상호를 적을 일이 있으면 문자열을 직접 쓰지 말고 `src/components/ui/Wordmark.tsx` 를 쓴다.

동네 반찬가게용 모바일 우선 PWA. 손님은 오늘 만든 반찬과 **실시간 재고**를 보고,
장바구니에 담아 **주문·결제**한다. 픽업과 배달을 모두 지원한다.
결제되면 매장에 **카카오 알림톡**이 간다. 사장님은 휴대폰으로 재고와 주문을 관리한다.

v1(카탈로그 + 재고 + 관리자)은 완료. 현재는 **v2(회원·장바구니·주문·결제·알림)** 를 만든다.
전체 설계와 단계는 [docs/PLAN.md](docs/PLAN.md).

## 스택

| 영역 | 선택 |
|---|---|
| Framework | Next.js 16 App Router + Cache Components (PPR) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 (`@theme` 토큰, config 파일 없음) |
| Backend/DB/Auth/Storage | Supabase (PostgreSQL 17, RLS 필수) |
| 로그인 | Supabase Auth — 이메일 + 카카오 OAuth |
| 결제 | 포트원(PortOne) V2 — 실제 PG는 포트원 계약 PG사 |
| 매장 알림 | 카카오 알림톡 (발송 대행사 경유) |
| Font | Pretendard Variable (동적 서브셋, 셀프호스팅) |
| Deploy | Vercel |

## 명령어

```bash
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드 (PPR 검증 포함 — 커밋 전 필수)
npm run lint
npm test           # node:test 기반 순수 로직 테스트
```

## 폴더 구조

```
src/
├── app/
│   ├── page.tsx             # 홈 (카탈로그)
│   ├── product/[id]/        # 상세 — PPR, 본문은 Suspense 안
│   ├── cart/                # 장바구니
│   ├── checkout/            # 주문서 (픽업/배달 선택, 결제)
│   ├── orders/              # 주문 내역 + 상태 추적
│   ├── account/             # 내 정보, 배송지 관리
│   ├── login/               # 손님 로그인/가입 (카카오 + 이메일)
│   ├── admin/               # 사장님 — 재고, 주문 접수, 매장 설정
│   ├── api/
│   │   └── payments/webhook/  # 포트원 웹훅 (금액 검증 + 멱등 처리)
│   ├── layout.tsx globals.css pretendard.css icon.svg
│   └── manifest.ts robots.ts sitemap.ts not-found.tsx
├── components/
│   ├── shop/ cart/ checkout/ orders/ admin/ ui/
├── lib/
│   ├── supabase/public.ts   # 쿠키 없는 읽기 전용 — 'use cache' 안에서 쓸 수 있는 유일한 클라이언트
│   ├── supabase/server.ts   # 세션 붙은 클라이언트 — Server Action / 로그인 필요한 조회
│   ├── queries.ts actions.ts
│   ├── orders.ts            # 주문 생성·상태 전이
│   ├── payments/portone.ts  # 결제 검증 (서버 전용)
│   ├── notify/              # 알림톡 어댑터 (인터페이스 + 실제 구현 + 로그 스텁)
│   ├── stock.ts filter.ts format.ts
│   └── logic.test.ts
├── types/database.ts
└── proxy.ts                 # 인증 가드 (Next 16에서 middleware → proxy 로 개명됨)
supabase/migrations/         # 순번 SQL — 항상 파일로 남긴다
docs/PLAN.md                 # 설계 + 결정 기록 + 단계
```

`src/lib/filter.ts` 는 상대 import에 `.ts` 확장자를 붙인다 (`./format.ts`).
`node --test` 가 확장자 없는 지정자를 해석하지 못하기 때문이고, `tsconfig`의
`allowImportingTsExtensions` 로 TS·Turbopack 모두 통과한다.

## 재고의 진실은 어디에 있는가 (가장 중요한 규칙)

> **화면의 재고는 안내다. 진실은 DB가 차감되는 순간에만 있다.**

화면에 보이는 숫자를 항상 정확하게 만들려고 하지 마라. 그건 불가능하고, 시도하면 성능이 죽는다.
대신 **초과판매가 물리적으로 불가능하게** 만든다.

- 목록/상세의 재고 표시는 캐시된 값이어도 된다. 몇 초 낡아도 손님은 손해 보지 않는다.
- 실제 차감은 **DB 함수 하나** 안에서 원자적으로 일어난다.
  `update ... where today_stock >= qty` 가 0행이면 예외를 던져 트랜잭션 전체를 되돌린다.
- 여러 품목을 차감할 때는 반드시 `product_id` 순서로 정렬해서 잠근다. 순서가 없으면 교착이 난다.
- 장바구니에 담을 때는 재고를 잡지 않는다. **결제 시작 시점에만** 잡는다.
- 애플리케이션 코드로 재고를 검사하고 나서 쓰는 방식(check-then-write)은 금지.
  두 손님이 마지막 1개를 동시에 사면 둘 다 통과한다.

## 캐싱 규칙

- 읽기(`src/lib/queries.ts`): `'use cache'` + `cacheTag('products')` + `cacheLife('minutes')`
- 쓰기(관리자 수정, 주문 확정): 성공 후 `updateTag('products')`
- `revalidatePath` 쓰지 않는다. 태그만 쓴다.
- 쿠키/searchParams/params 를 읽는 컴포넌트는 반드시 `<Suspense>` 로 감싼다 (PPR 요구사항)
- 장바구니·주문내역·관리자 조회는 **캐시하지 않는다**. 사용자별 데이터이고 `cookies()` 를 읽는다.

## 데이터 규칙

- 금액은 전부 `integer` (원화, 소수 없음). 표시는 `formatPrice()` 하나만 사용.
- 정렬 컬럼명은 `sort_order` (`order` 는 SQL 예약어).
- `today_available = false` → 손님 목록에서 **완전히 제외**. 의미를 바꾸지 않는다.
  "주문 가능" 같은 세 번째 플래그를 추가하지 마라.
- `today_available = true && today_stock = 0` → 목록에 **보이되 🔴 품절**, 담기 불가.
- 재고 뱃지는 `stockStatus(today_stock)` 하나만 쓴다. 카드·상세·장바구니·관리자 전부.
- **주문 항목은 스냅샷을 저장한다.** `order_items` 에 상품명·단가를 복사해 넣는다.
  나중에 가격이 바뀌어도 지난 주문 내역은 그때 가격이어야 한다.
- **배송지도 스냅샷을 저장한다.** `address_id` 만 두면 손님이 주소를 지웠을 때 주문 내역이 깨진다.
- `order_items.product_id` 는 `on delete set null`. `restrict` 로 두면 주문이 한 건이라도 있는
  상품을 관리자가 삭제할 수 없게 된다.

## 결제 규칙

- **클라이언트가 "결제 성공"이라고 말하는 것을 믿지 않는다.** 금액도 상태도 위조 가능하다.
- 포트원 웹훅 핸들러는 반드시:
  1. 포트원 API로 결제 건을 **다시 조회**한다
  2. 조회된 금액을 DB에 저장된 주문 총액과 **비교**한다
  3. 일치할 때만 `paid` 로 전이한다
- 웹훅은 **재시도된다.** `payment_id` 기준으로 멱등해야 한다. 같은 웹훅이 두 번 와도
  알림톡이 두 번 가거나 재고가 두 번 줄면 안 된다.
- 포트원 API 시크릿은 서버 전용. `NEXT_PUBLIC_` 접두사 금지.
- 결제 실패·이탈로 남은 `pending_payment` 주문은 잡아둔 재고를 반드시 되돌린다.

## 보안 규칙

- 모든 테이블 RLS ON. 쓰기는 정책으로 막는다. 앱 코드의 검사는 UX용이지 방어선이 아니다.
- 상품/카테고리 쓰기는 `public.is_admin()` 통과 필수. "로그인함 = 관리자" 아니다.
- 손님 데이터(`profiles`, `addresses`, `cart_items`, `orders`)는 `user_id = auth.uid()` 로 격리.
  관리자는 `is_admin()` 으로 전체 주문 조회 가능.
- `service_role` 키는 어떤 경우에도 클라이언트 번들에 들어가지 않는다.
- Storage 버킷 `product-photos`: public read, `is_admin()` write.
- `next.config.ts` 의 `images.remotePatterns` 에 Supabase 스토리지 호스트 등록 유지.

## 디자인 시스템

컨셉: Premium / Minimal / Warm / Natural. 무신사·오늘의집·애플 톤.
❌ 시장 좌판 느낌, 촌스러운 쇼핑몰, 올드한 관리자 UI.

토큰은 `src/app/globals.css` 의 `@theme` 에만 정의한다. 컴포넌트에 hex 하드코딩 금지.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--color-brand` | `#D8352C` | 간판의 「반찬가게」 빨강 — 상호 전용 |
| `--color-olive` | `#6B8E23` | Primary |
| `--color-cream` | `#FFF8F0` | Secondary surface |
| `--color-clay` | `#C76B29` | Accent |
| `--color-success` | `#3BA55D` | 재고 충분 |
| `--color-danger` | `#D32F2F` | 품절 |
| `--color-canvas` | `#FAFAF8` | Background |
| `--color-ink` | `#222222` | Text |

- Radius 16px, soft shadow, 카드 배경 white
- Bold 최소화 — 위계는 크기·색·여백으로 만든다
- 터치 타겟 최소 48px, 트랜지션 0.2~0.3s
- 라이트 모드 전용. 다크 모드는 범위 밖 (`prefers-color-scheme` 블록 넣지 않는다)
- 애니메이션은 `transform` / `opacity` 만. layout 속성 애니메이션 금지.
- **네이티브 앱 느낌**: 하단 탭 내비게이션, standalone 표시, 페이지 전환 시 위치 유지,
  주요 동작에 낙관적 업데이트. 실제 네이티브 래핑(Capacitor)은 하지 않는다 — PWA로 충분하다.

## 코드 규칙

- 불변 패턴. 기존 객체를 수정하지 않고 새 객체를 만든다.
- 파일 200~400줄 목표, 800줄 초과 금지. 함수 50줄 이하.
- 주석 최소. 이름으로 설명한다. 다만 **왜 이렇게 했는지**가 안 드러나는 곳에는 남긴다.
- 에러는 삼키지 않는다. Server Action은 항상 `{ ok, error }` 를 돌려주고 UI가 노출한다.
- 돈과 재고가 걸린 로직은 반드시 테스트를 남긴다.
- 임시 디자인 금지. 모든 화면은 출시 가능한 품질로 만든다.
