-- v2-B 장바구니
--
-- 담을 때 재고를 잡지 않는다 (D11). 담아두고 안 사는 손님이 재고를 말려 죽이면 안 된다.
-- 재고는 결제 시작 시점에 place_order() 가 원자적으로 잡는다.
-- 그래서 여기엔 재고 관련 제약이 없다 — quantity 가 현재 재고를 넘어도 저장은 된다.
-- 화면이 "부족해요"를 알려주고, 실제 차단은 주문 시점에 DB가 한다.

create table public.cart_items (
  user_id    uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity   int  not null check (quantity > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index cart_items_user_idx on public.cart_items (user_id, updated_at desc);

create trigger cart_items_touch_updated_at
  before update on public.cart_items
  for each row execute function public.touch_updated_at();

alter table public.cart_items enable row level security;

create policy cart_items_own on public.cart_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
