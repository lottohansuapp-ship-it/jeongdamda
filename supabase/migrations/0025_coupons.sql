-- 0025 쿠폰
--
-- 신규가입 쿠폰 한 종류부터. 써 보고 필요하면 늘린다.
--
-- 1인 1회는 user_coupons 의 unique(user_id, coupon_id) 가 보장한다.
-- 같은 사람이 계정을 여러 개 만드는 것은 0024 의 전화번호 유니크가 막는다.
-- 둘이 같이 있어야 의미가 있다.
--
-- **금액 계산은 전부 DB 안에서 한다.** 화면이 보낸 할인액은 쓰지 않는다 —
-- 손님이 고치면 그대로 공짜가 된다. 재고와 같은 규칙이다.
--
-- **이 SQL 을 먼저 실행하고 앱을 배포한다.** orders 에 컬럼이 늘어서
-- 반대로 하면 주문 조회가 깨진다.

create table if not exists public.coupons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- 지금은 'signup' 하나. 코드 입력형·재주문형을 넣을 자리를 남겨 둔다.
  kind       text not null default 'signup' check (kind in ('signup')),
  discount   int  not null check (discount > 0),
  min_order  int  not null default 0 check (min_order >= 0),
  valid_days int  not null default 30 check (valid_days > 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- 같은 종류의 쿠폰이 동시에 둘 이상 켜져 있으면 어느 것을 줄지 알 수 없다.
create unique index if not exists coupons_active_kind_idx
  on public.coupons (kind) where is_active;

create table if not exists public.user_coupons (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  coupon_id  uuid not null references public.coupons(id) on delete cascade,
  issued_at  timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at    timestamptz,
  -- 주문이 지워져도 쿠폰 기록은 남는다. 언제 썼는지가 사라지면 안 된다.
  order_id   uuid references public.orders(id) on delete set null,
  -- 이게 1인 1회다.
  unique (user_id, coupon_id)
);

create index if not exists user_coupons_user_idx
  on public.user_coupons (user_id, used_at);

alter table public.orders
  add column if not exists discount int not null default 0 check (discount >= 0),
  add column if not exists user_coupon_id uuid references public.user_coupons(id) on delete set null;

alter table public.coupons      enable row level security;
alter table public.user_coupons enable row level security;

-- 쿠폰 규칙은 누구나 읽는다. 주문서에 "3,000원 할인" 을 보여줘야 한다.
drop policy if exists coupons_public_read on public.coupons;
create policy coupons_public_read on public.coupons
  for select to anon, authenticated using (true);

drop policy if exists coupons_admin_write on public.coupons;
create policy coupons_admin_write on public.coupons
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 내 쿠폰만 본다. 쓰는 것은 place_order 가 한다 (직접 고치지 못한다).
drop policy if exists user_coupons_own_read on public.user_coupons;
create policy user_coupons_own_read on public.user_coupons
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists user_coupons_admin_read on public.user_coupons;
create policy user_coupons_admin_read on public.user_coupons
  for select to authenticated using ((select public.is_admin()));

/*
 * 신규가입 쿠폰 발급.
 *
 * 전화번호를 넣은 뒤에 부른다. 번호가 있어야 1인 1회에 힘이 생긴다 (0024).
 * 여러 번 불려도 안전하다 — unique 제약에 걸리면 조용히 넘어간다.
 */
create or replace function public.claim_signup_coupon()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_rule   public.coupons%rowtype;
  v_exists uuid;
  v_phone  text;
begin
  if v_user is null then
    return jsonb_build_object('issued', false, 'reason', 'anonymous');
  end if;

  select phone into v_phone from public.profiles where id = v_user;
  if coalesce(trim(v_phone), '') = '' then
    return jsonb_build_object('issued', false, 'reason', 'no_phone');
  end if;

  select * into v_rule from public.coupons
   where kind = 'signup' and is_active limit 1;
  if not found then
    return jsonb_build_object('issued', false, 'reason', 'no_coupon');
  end if;

  select id into v_exists from public.user_coupons
   where user_id = v_user and coupon_id = v_rule.id;
  if found then
    return jsonb_build_object('issued', false, 'reason', 'already');
  end if;

  insert into public.user_coupons (user_id, coupon_id, expires_at)
  values (v_user, v_rule.id, now() + (v_rule.valid_days || ' days')::interval)
  on conflict (user_id, coupon_id) do nothing;

  return jsonb_build_object('issued', true, 'discount', v_rule.discount);
end;
$fn$;

revoke all on function public.claim_signup_coupon() from public;
grant execute on function public.claim_signup_coupon() to authenticated;

-- place_order 는 인자가 늘어서 갈아끼운다. 그냥 replace 하면 4인자짜리가
-- 남아 호출이 모호해진다.
drop function if exists public.place_order(text, uuid, timestamptz, text);

create or replace function public.place_order(
  p_fulfillment text,
  p_address_id  uuid default null,
  p_pickup_at   timestamptz default null,
  p_memo        text default null,
  p_user_coupon_id uuid default null
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
  v_minimum  int;   -- 이 금액 미만이면 배달을 받지 않는다
  v_free_from int;  -- 이 금액 이상이면 배달비가 0
  v_order_id uuid;
  v_order_no text;
  v_payment_id text;
  v_coupon   public.user_coupons%rowtype;
  v_rule     public.coupons%rowtype;
  v_discount int := 0;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  if p_fulfillment not in ('pickup', 'delivery') then
    raise exception '수령 방법이 올바르지 않습니다.';
  end if;

  perform public.sweep_expired_orders();

  select * into v_settings from public.store_settings where id = 1;
  if not found then
    raise exception '매장 설정을 찾을 수 없습니다.';
  end if;

  if not public.store_is_open_now() then
    raise exception '지금은 주문을 받지 않습니다. 영업시간을 확인해 주세요.';
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

  perform 1 from public.products
   where id in (select product_id from public.cart_items where user_id = v_user)
   order by id
   for update;

  if not exists (select 1 from public.cart_items where user_id = v_user) then
    raise exception '장바구니가 비어 있습니다.';
  end if;

  select p.name into v_blocked
    from public.cart_items c
    join public.products p on p.id = c.product_id
   where c.user_id = v_user and not p.today_available
   limit 1;
  if v_blocked is not null then
    raise exception '%은(는) 오늘 판매하지 않습니다.', v_blocked;
  end if;

  -- 재고 부족은 차감 '전에' 확인한다 (위에서 FOR UPDATE 로 잠갔다).
  select p.name into v_blocked
    from public.cart_items c
    join public.products p on p.id = c.product_id
   where c.user_id = v_user and p.today_stock < c.quantity
   limit 1;
  if v_blocked is not null then
    raise exception '%이(가) 방금 품절되었습니다.', v_blocked;
  end if;

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

    -- 배달 접수 시간. 매장 영업시간보다 짧을 수 있다 (0023).
    -- 영업시간 자체는 위에서 store_is_open_now() 가 이미 확인했다.
    if not public.delivery_open_now() then
      raise exception '지금은 배달 주문을 받지 않습니다. 배달 가능 시간을 확인해 주세요.';
    end if;

    v_fee := v_settings.delivery_fee;
    v_minimum := v_settings.min_order_amount;
    v_free_from := v_settings.free_delivery_from;

    if v_settings.restrict_delivery_area then
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
      v_free_from := coalesce(v_area.free_delivery_from, v_settings.free_delivery_from);
    end if;

    -- 최소주문. 배달비를 받아도 못 가는 금액대가 있다 (0022).
    if v_minimum > 0 and v_subtotal < v_minimum then
      raise exception '배달은 %원 이상부터 가능합니다.', v_minimum;
    end if;

    -- 무료배달 기준을 넘으면 배달비를 빼 준다.
    if v_free_from > 0 and v_subtotal >= v_free_from then
      v_fee := 0;
    end if;

    v_address_text := trim(
      coalesce('(' || v_address.postcode || ') ', '') || v_address_text);
  else
    v_address_text := null;
    if p_pickup_at is null then
      raise exception '픽업 시간을 선택해 주세요.';
    end if;
  end if;

  /*
    쿠폰 (0025). 금액 계산은 전부 여기서 한다.

    화면이 보낸 할인액은 쓰지 않는다 — 손님이 고치면 그대로 공짜가 된다.
    쿠폰 번호만 받고 조건과 금액은 DB 가 다시 본다. 재고와 같은 규칙이다.
  */
  if p_user_coupon_id is not null then
    select * into v_coupon
      from public.user_coupons
     where id = p_user_coupon_id and user_id = v_user
     for update;

    if not found then
      raise exception '쿠폰을 찾을 수 없습니다.';
    end if;
    if v_coupon.used_at is not null then
      raise exception '이미 사용한 쿠폰입니다.';
    end if;
    if v_coupon.expires_at <= now() then
      raise exception '사용 기한이 지난 쿠폰입니다.';
    end if;

    select * into v_rule from public.coupons where id = v_coupon.coupon_id;
    if not found or not v_rule.is_active then
      raise exception '지금은 쓸 수 없는 쿠폰입니다.';
    end if;
    if v_subtotal < v_rule.min_order then
      raise exception '이 쿠폰은 %원 이상 주문에 쓸 수 있습니다.', v_rule.min_order;
    end if;

    -- 배달비는 깎지 않는다. 반찬 값보다 많이 깎이지도 않는다.
    v_discount := least(v_rule.discount, v_subtotal);
  end if;

  update public.products p
     set today_stock = p.today_stock - c.quantity
    from public.cart_items c
   where c.user_id = v_user
     and p.id = c.product_id
     and p.today_stock >= c.quantity;

  v_order_no := to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
                || '-' || lpad((nextval('public.order_no_seq') % 10000)::text, 4, '0');

  -- 결제 식별자. gen_random_uuid() 는 암호학적 난수다.
  v_payment_id := v_order_no || '-'
                  || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.orders (
    order_no, user_id, status, fulfillment,
    receiver_name, receiver_phone, address_snapshot, pickup_at,
    subtotal, delivery_fee, discount, total, memo, reserved_until, payment_id,
    user_coupon_id
  ) values (
    v_order_no, v_user, 'pending_payment', p_fulfillment,
    v_profile.name, v_profile.phone, v_address_text,
    case when p_fulfillment = 'pickup' then p_pickup_at else null end,
    v_subtotal, v_fee, v_discount, v_subtotal + v_fee - v_discount,
    nullif(trim(coalesce(p_memo, '')), ''),
    now() + interval '10 minutes',
    v_payment_id,
    p_user_coupon_id
  )
  returning id into v_order_id;

  -- 결제 전이라도 여기서 잡아 둔다. 안 그러면 한 쿠폰으로 주문을 여러 개 만든다.
  -- 결제에 실패해 주문이 만료되면 sweep_expired_orders 가 되돌린다.
  if p_user_coupon_id is not null then
    update public.user_coupons
       set used_at = now(), order_id = v_order_id
     where id = p_user_coupon_id;
  end if;

  insert into public.order_items
    (order_id, product_id, name, unit_price, quantity, line_total)
  select v_order_id, p.id, p.name, p.price, c.quantity, p.price * c.quantity
    from public.cart_items c
    join public.products p on p.id = c.product_id
   where c.user_id = v_user;

  return jsonb_build_object(
    'order_id',   v_order_id,
    'order_no',   v_order_no,
    'payment_id', v_payment_id,
    'discount',   v_discount,
    'total',      v_subtotal + v_fee - v_discount
  );
end;
$$;

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason   text default null,
  p_refunded int  default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_admin boolean := public.is_admin();
  v_order public.orders%rowtype;
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '주문을 찾을 수 없습니다.';
  end if;

  if not v_admin and v_order.user_id is distinct from v_user then
    raise exception '주문을 찾을 수 없습니다.';
  end if;

  if v_order.status = 'canceled' then
    raise exception '이미 취소된 주문입니다.';
  end if;
  if v_order.status = 'completed' then
    raise exception '완료된 주문은 취소할 수 없습니다.';
  end if;
  if not v_admin and v_order.status not in ('pending_payment', 'paid') then
    raise exception '이미 준비가 시작되었어요. 매장에 연락해 주세요.';
  end if;

  -- 새로 생긴 관문이다. 결제까지 간 주문인데 환불한 흔적이 없으면 거절한다.
  -- errcode 55000 은 "지금 상태로는 할 수 없다" 는 뜻이고, 호출부가 이 코드를
  -- 보고 환불을 먼저 처리한 뒤 다시 부른다.
  if v_order.status = 'paid'
     and v_order.refunded_at is null
     and p_refunded is null then
    raise exception '환불을 먼저 처리해야 취소할 수 있습니다.'
      using errcode = '55000';
  end if;

  perform 1
     from public.products
    where id in (
      select product_id from public.order_items
       where order_id = p_order_id and product_id is not null
    )
    order by id
    for update;

  update public.products p
     set today_stock = p.today_stock + agg.qty
    from (
      select product_id, sum(quantity) as qty
        from public.order_items
       where order_id = p_order_id and product_id is not null
       group by product_id
    ) agg
   where p.id = agg.product_id;

  -- 쿠폰을 썼다면 돌려준다 (0025). 주문이 없어졌는데 쿠폰만 사라지면
  -- 손님은 받은 적 없는 손해를 본다.
  update public.user_coupons
     set used_at = null, order_id = null
   where order_id = p_order_id;

  update public.orders
     set status        = 'canceled',
         canceled_at   = now(),
         cancel_reason = nullif(trim(coalesce(p_reason, '')), ''),
         refunded_at   = case when p_refunded is not null then now()
                              else refunded_at end,
         refund_amount = coalesce(p_refunded, refund_amount)
   where id = v_order.id;

  return jsonb_build_object('order_id', p_order_id, 'order_no', v_order.order_no);
end;
$$;

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

  -- 결제에 실패해 만료된 주문이 잡고 있던 쿠폰을 놓아 준다 (0025).
  -- 안 놓아 주면 손님은 결제 한 번 실패하고 쿠폰을 영영 잃는다.
  update public.user_coupons
     set used_at = null, order_id = null
   where order_id = any(v_expired);

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

grant execute on function public.place_order(text, uuid, timestamptz, text, uuid) to authenticated;
grant execute on function public.cancel_order(uuid, text, int) to authenticated;

-- 신규가입 쿠폰 첫 값. 관리자 화면에서 바꿀 수 있다.
insert into public.coupons (name, kind, discount, min_order, valid_days)
select '신규가입 감사 쿠폰', 'signup', 3000, 15000, 30
 where not exists (select 1 from public.coupons where kind = 'signup');

select name as 쿠폰, discount as 할인, min_order as 최소주문, valid_days as 유효일수
  from public.coupons where kind = 'signup';
