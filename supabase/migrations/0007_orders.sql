-- v2-D 주문
--
-- 이 파일의 핵심은 place_order() 하나다. 초과판매를 물리적으로 불가능하게 만든다 (D10).
-- 읽기 전에 알아둘 것:
--   · SECURITY DEFINER 다. 손님은 products 에 UPDATE 권한이 없어서 (D20)
--     INVOKER 로 만들면 재고 차감이 매번 0행이 되고 "재고 부족"으로 끝난다.
--   · 그래서 함수가 직접 권한을 확인한다. user_id 를 인자로 받지 않는다.
--   · 금액도 인자로 받지 않는다. 서버가 products.price 에서 다시 계산한다 (D21).
--   · 장바구니는 비우지 않는다. 결제 완료 시점에 비운다 (D22).

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_no         text not null unique,
  user_id          uuid references auth.users(id) on delete set null,
  status           text not null default 'pending_payment'
                   check (status in ('pending_payment','paid','accepted','preparing',
                                     'ready','delivering','completed','canceled')),
  fulfillment      text not null check (fulfillment in ('pickup','delivery')),

  -- 스냅샷: 손님이 주소를 지우거나 이름을 바꿔도 주문 내역이 깨지면 안 된다
  receiver_name    text not null,
  receiver_phone   text not null,
  address_snapshot text,
  pickup_at        timestamptz,

  subtotal         int not null check (subtotal >= 0),
  delivery_fee     int not null default 0 check (delivery_fee >= 0),
  total            int not null check (total >= 0),

  memo             text,
  reserved_until   timestamptz,
  paid_at          timestamptz,
  canceled_at      timestamptz,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index orders_user_idx    on public.orders (user_id, created_at desc);
create index orders_status_idx  on public.orders (status, created_at desc);
create index orders_pending_idx on public.orders (reserved_until)
  where status = 'pending_payment';

create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  -- 상품이 삭제돼도 주문은 남아야 한다. restrict 로 두면 관리자가 상품을 못 지운다.
  product_id uuid references public.products(id) on delete set null,
  name       text not null,                                    -- 스냅샷
  unit_price int  not null check (unit_price >= 0),             -- 스냅샷
  quantity   int  not null check (quantity > 0),
  line_total int  not null check (line_total >= 0)
);

create index order_items_order_idx on public.order_items (order_id);

create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- 주문번호용. 시퀀스는 트랜잭션 밖에서 돌아 경합이 없다.
create sequence public.order_no_seq;

alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

create policy orders_own_read on public.orders
  for select to authenticated using (user_id = (select auth.uid()));

create policy orders_admin_all on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy order_items_own_read on public.order_items
  for select to authenticated using (
    exists (select 1 from public.orders o
             where o.id = order_id and o.user_id = (select auth.uid()))
  );

create policy order_items_admin_all on public.order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 손님이 직접 INSERT 하는 정책은 두지 않는다. 주문 생성은 place_order() 로만 한다.

---------------------------------------------------------------------------
-- 만료된 미결제 주문의 재고를 되돌린다 (D12 지연 정리).
-- 크론이 필요 없다. 재고가 필요한 바로 그 순간에 정리한다.
---------------------------------------------------------------------------
create or replace function public.sweep_expired_orders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired uuid[];
begin
  select array_agg(id) into v_expired from (
    select id from public.orders
     where status = 'pending_payment'
       and reserved_until is not null
       and reserved_until < now()
     for update skip locked
  ) t;

  if v_expired is null or array_length(v_expired, 1) is null then
    return;
  end if;

  -- 잠금 순서를 고정한다. 안 그러면 동시에 도는 두 정리가 교착한다.
  perform 1 from public.products
   where id in (
     select distinct product_id from public.order_items
      where order_id = any(v_expired) and product_id is not null
   )
   order by id
   for update;

  update public.products p
     set today_stock = p.today_stock + agg.qty
    from (
      select product_id, sum(quantity) as qty
        from public.order_items
       where order_id = any(v_expired) and product_id is not null
       group by product_id
    ) agg
   where p.id = agg.product_id;

  update public.orders
     set status = 'canceled',
         canceled_at = now(),
         cancel_reason = '결제 시간 초과'
   where id = any(v_expired);
end;
$$;

---------------------------------------------------------------------------
-- 주문 생성. 재고 차감과 주문 기록이 한 트랜잭션에서 함께 성공하거나 함께 실패한다.
---------------------------------------------------------------------------
create or replace function public.place_order(
  p_fulfillment text,
  p_address_id  uuid default null,
  p_pickup_at   timestamptz default null,
  p_memo        text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_settings public.store_settings%rowtype;
  v_profile  public.profiles%rowtype;
  v_address  public.addresses%rowtype;
  v_area     public.delivery_areas%rowtype;
  v_address_text text;
  v_blocked  text;
  v_subtotal int := 0;
  v_fee      int := 0;
  v_minimum  int;
  v_order_id uuid;
  v_order_no text;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  if p_fulfillment not in ('pickup', 'delivery') then
    raise exception '수령 방법이 올바르지 않습니다.';
  end if;

  perform public.sweep_expired_orders();

  select * into v_settings from public.store_settings where id = 1;
  if not found or not v_settings.is_open then
    raise exception '지금은 주문을 받지 않습니다.';
  end if;
  if p_fulfillment = 'pickup' and not v_settings.pickup_enabled then
    raise exception '지금은 픽업 주문을 받지 않습니다.';
  end if;
  if p_fulfillment = 'delivery' and not v_settings.delivery_enabled then
    raise exception '지금은 배달 주문을 받지 않습니다.';
  end if;

  select * into v_profile from public.profiles where id = v_user;
  if not found
     or coalesce(trim(v_profile.name), '') = ''
     or coalesce(trim(v_profile.phone), '') = '' then
    raise exception '이름과 연락처를 먼저 입력해 주세요.';
  end if;

  -- 잠금 순서 고정. 여러 품목을 아무 순서로 잠그면 동시 주문끼리 교착한다.
  perform 1 from public.products
   where id in (select product_id from public.cart_items where user_id = v_user)
   order by id
   for update;

  if not exists (select 1 from public.cart_items where user_id = v_user) then
    raise exception '장바구니가 비어 있습니다.';
  end if;

  -- 판매 중지된 상품
  select p.name into v_blocked
    from public.cart_items c
    join public.products p on p.id = c.product_id
   where c.user_id = v_user and not p.today_available
   limit 1;
  if v_blocked is not null then
    raise exception '%은(는) 오늘 판매하지 않습니다.', v_blocked;
  end if;

  -- 재고 부족은 차감 '전에' 확인한다.
  -- 차감 후에 today_stock < quantity 로 판정하면 정상 차감된 줄까지 오탐한다
  -- (재고 5, 3개 주문 → 2 남음 → 2 < 3). 위에서 FOR UPDATE 로 잠갔으므로
  -- 이 시점의 값은 커밋 전까지 아무도 못 바꾼다.
  select p.name into v_blocked
    from public.cart_items c
    join public.products p on p.id = c.product_id
   where c.user_id = v_user and p.today_stock < c.quantity
   limit 1;
  if v_blocked is not null then
    raise exception '%이(가) 방금 품절되었습니다.', v_blocked;
  end if;

  -- 금액은 서버가 계산한다 (D21)
  select coalesce(sum(p.price * c.quantity), 0) into v_subtotal
    from public.cart_items c
    join public.products p on p.id = c.product_id
   where c.user_id = v_user;

  if p_fulfillment = 'delivery' then
    select * into v_address
      from public.addresses
     where id = p_address_id and user_id = v_user;
    if not found then
      raise exception '배송지를 선택해 주세요.';
    end if;

    v_address_text := trim(both ' ' from
      coalesce(v_address.address1, '') || ' ' || coalesce(v_address.address2, ''));

    select * into v_area
      from public.delivery_areas d
     where d.is_active
       and position(replace(d.name, ' ', '') in replace(v_address_text, ' ', '')) > 0
     order by length(d.name) desc
     limit 1;
    if not found then
      raise exception '아직 이 지역은 배달이 어렵습니다.';
    end if;

    v_fee := v_area.fee;
    v_minimum := coalesce(v_area.min_amount, v_settings.min_order_amount);
    if v_subtotal < v_minimum then
      raise exception '배달 최소주문 금액은 %원입니다.', v_minimum;
    end if;

    v_address_text := trim(
      coalesce('(' || v_address.postcode || ') ', '') || v_address_text);
  else
    v_address_text := null;
    if p_pickup_at is null then
      raise exception '픽업 시간을 선택해 주세요.';
    end if;
  end if;

  -- 실제 차감. where 조건은 위 검사가 뚫렸을 때를 대비한 두 번째 방어선이다.
  update public.products p
     set today_stock = p.today_stock - c.quantity
    from public.cart_items c
   where c.user_id = v_user
     and p.id = c.product_id
     and p.today_stock >= c.quantity;

  v_order_no := to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
                || '-' || lpad((nextval('public.order_no_seq') % 10000)::text, 4, '0');

  insert into public.orders (
    order_no, user_id, status, fulfillment,
    receiver_name, receiver_phone, address_snapshot, pickup_at,
    subtotal, delivery_fee, total, memo, reserved_until
  ) values (
    v_order_no, v_user, 'pending_payment', p_fulfillment,
    v_profile.name, v_profile.phone, v_address_text,
    case when p_fulfillment = 'pickup' then p_pickup_at else null end,
    v_subtotal, v_fee, v_subtotal + v_fee,
    nullif(trim(coalesce(p_memo, '')), ''),
    now() + interval '10 minutes'
  )
  returning id into v_order_id;

  insert into public.order_items
    (order_id, product_id, name, unit_price, quantity, line_total)
  select v_order_id, p.id, p.name, p.price, c.quantity, p.price * c.quantity
    from public.cart_items c
    join public.products p on p.id = c.product_id
   where c.user_id = v_user;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_order_no,
    'total', v_subtotal + v_fee
  );
end;
$$;

revoke all on function public.place_order(text, uuid, timestamptz, text) from public;
grant execute on function public.place_order(text, uuid, timestamptz, text) to authenticated;

revoke all on function public.sweep_expired_orders() from public;
grant execute on function public.sweep_expired_orders() to authenticated;
