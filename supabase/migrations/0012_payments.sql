-- v2-E 결제
--
-- 규칙 하나로 요약하면: **손님이 "결제됐다"고 말하는 것을 믿지 않는다.**
-- 확정은 포트원 API 로 결제 건을 다시 조회해서 그 금액이 orders.total 과
-- 같을 때만 일어난다. 이 파일은 그 확정을 원자적·멱등적으로 만드는 부분이다.

---------------------------------------------------------------------------
-- 서버끼리 쓰는 비밀값.
--
-- 웹훅은 로그인 세션이 없다. mark_order_paid 를 부를 권한이 필요한데,
-- service_role 키를 쓰면 그 키 하나가 새는 순간 손님 주소·연락처까지 전부 털린다.
-- 대신 "주문을 결제됨으로 표시한다" 딱 그 일만 되는 좁은 비밀값을 쓴다.
-- 이게 새도 피해는 가짜 결제 표시에 그치고, 포트원 내역과 대조하면 드러난다.
--
-- RLS 를 켜고 정책을 하나도 만들지 않는다 → 어떤 역할도 읽을 수 없다.
-- SECURITY DEFINER 함수만 소유자 권한으로 읽는다.
--
-- 값은 이 파일에 적지 않는다. 적용 후 직접 넣는다:
--   insert into public.app_secrets (key, value)
--   values ('payment_webhook', '<32바이트 이상 난수>');
---------------------------------------------------------------------------
create table public.app_secrets (
  key   text primary key,
  value text not null
);

alter table public.app_secrets enable row level security;
revoke all on table public.app_secrets from anon, authenticated;

---------------------------------------------------------------------------
alter table public.orders
  -- 포트원에 넘기는 결제 식별자. 웹훅이 이걸로 주문을 찾으므로
  -- 결제창이 열리기 전에 반드시 저장돼 있어야 한다 (place_order 안에서 만든다).
  add column payment_id          text unique,
  add column paid_amount         int,
  add column payment_method      text,
  -- 취소를 시작했다는 표시. 환불을 두 번 보내지 않기 위한 선점 자물쇠다.
  add column cancel_requested_at timestamptz,
  add column refunded_at         timestamptz,
  add column refund_amount       int;

-- 환불이 걸린 주문을 사장님이 찾을 수 있어야 한다
create index orders_stuck_refund_idx on public.orders (cancel_requested_at)
  where cancel_requested_at is not null and refunded_at is null;

---------------------------------------------------------------------------
-- 결제 확정. 웹훅과 손님 화면 양쪽이 부르고, 몇 번을 불러도 결과가 같아야 한다.
-- 포트원은 웹훅을 재시도한다. 같은 웹훅이 두 번 와도 장바구니가 두 번 비면 안 된다.
---------------------------------------------------------------------------
create or replace function public.mark_order_paid(
  p_payment_id text,
  p_amount     int,
  p_method     text,
  p_secret     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_order  public.orders%rowtype;
begin
  select value into v_secret
    from public.app_secrets where key = 'payment_webhook';

  -- 비밀값은 32바이트 이상 난수다. plpgsql 의 <> 가 조기 종료하더라도
  -- 네트워크 너머에서 타이밍으로 알아낼 수 있는 수준이 아니다.
  -- 메시지에 값을 담지 않는다.
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception '결제 확정 권한이 없습니다.' using errcode = '28000';
  end if;

  select * into v_order
    from public.orders where payment_id = p_payment_id for update;

  if not found then
    raise exception '결제에 해당하는 주문을 찾을 수 없습니다.';
  end if;

  -- 이미 처리했다. 오류가 아니라 할 일이 없는 것이다 (웹훅 재시도).
  if v_order.status <> 'pending_payment' then
    return jsonb_build_object(
      'order_id', v_order.id,
      'order_no', v_order.order_no,
      'status',   v_order.status,
      'applied',  false
    );
  end if;

  -- 금액이 다르면 절대 확정하지 않는다. 주문은 pending_payment 로 남고
  -- 10분 뒤 자동 취소되어 재고가 돌아간다.
  if p_amount is distinct from v_order.total then
    raise exception '결제 금액이 주문 금액과 다릅니다.';
  end if;

  update public.orders
     set status         = 'paid',
         paid_at        = now(),
         paid_amount    = p_amount,
         payment_method = p_method,
         reserved_until = null   -- 더 이상 만료 정리 대상이 아니다
   where id = v_order.id;

  -- 장바구니는 여기서 비운다 (D22). 주문 만들 때 비우면 결제창을 닫고 나온
  -- 손님이 빈 장바구니를 마주한다.
  delete from public.cart_items where user_id = v_order.user_id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_no', v_order.order_no,
    'status',   'paid',
    'applied',  true
  );
end;
$$;

revoke all on function public.mark_order_paid(text, int, text, text) from public;
grant execute on function public.mark_order_paid(text, int, text, text)
  to anon, authenticated;

---------------------------------------------------------------------------
-- 취소 선점.
--
-- 왜 따로 두는가: 환불을 먼저 보내고 DB 를 고치면, 두 사람이 동시에 취소를 눌렀을 때
-- 둘 다 포트원에 환불을 보낸다. 그래서 DB 가 먼저 "내가 취소한다"를 선점한다.
--
-- 이미 선점된 주문을 다시 불러도 오류가 아니다. 환불까지 갔다가 실패했을 때
-- 이어서 재시도할 수 있어야 하기 때문이다. 이미 환불됐으면 needs_refund 가 false 다.
---------------------------------------------------------------------------
create or replace function public.begin_cancel(p_order_id uuid)
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

  -- 남의 주문에는 '권한 없음'이 아니라 '없음'으로 답한다 (0011 과 같은 이유)
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

  if v_order.cancel_requested_at is null then
    update public.orders set cancel_requested_at = now() where id = v_order.id;
  end if;

  return jsonb_build_object(
    'payment_id',   v_order.payment_id,
    'total',        v_order.total,
    'needs_refund', v_order.status = 'paid'
                    and v_order.payment_id is not null
                    and v_order.refunded_at is null
  );
end;
$$;

revoke all on function public.begin_cancel(uuid) from public;
grant execute on function public.begin_cancel(uuid) to authenticated;

---------------------------------------------------------------------------
-- 취소 확정. 0011 의 함수에 환불 기록을 더한다.
-- 인자를 하나 늘리므로 기존 2인자 함수는 지운다 — 남겨두면 호출이 모호해진다.
---------------------------------------------------------------------------
drop function if exists public.cancel_order(uuid, text);

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

  -- 잠금 순서 고정. 없으면 동시 취소끼리 교착한다.
  perform 1 from public.products
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

  update public.orders
     set status        = 'canceled',
         canceled_at   = now(),
         cancel_reason = nullif(trim(coalesce(p_reason, '')), ''),
         refunded_at   = case when p_refunded is not null then now()
                              else refunded_at end,
         refund_amount = coalesce(p_refunded, refund_amount)
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'order_no', v_order.order_no);
end;
$$;

revoke all on function public.cancel_order(uuid, text, int) from public;
grant execute on function public.cancel_order(uuid, text, int) to authenticated;

---------------------------------------------------------------------------
-- place_order 가 결제 식별자를 함께 만든다.
--
-- 서버 액션에서 나중에 붙이면 안 된다. 그 사이에 손님이 결제를 마치면
-- 포트원은 아는데 우리 DB 는 어느 주문인지 못 찾는 결제가 생긴다.
-- 주문 행과 같은 트랜잭션에서 만들어야 그 틈이 없다.
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
  v_payment_id text;
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

    v_fee := v_settings.delivery_fee;
    v_minimum := v_settings.min_order_amount;

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
    end if;

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
    subtotal, delivery_fee, total, memo, reserved_until, payment_id
  ) values (
    v_order_no, v_user, 'pending_payment', p_fulfillment,
    v_profile.name, v_profile.phone, v_address_text,
    case when p_fulfillment = 'pickup' then p_pickup_at else null end,
    v_subtotal, v_fee, v_subtotal + v_fee,
    nullif(trim(coalesce(p_memo, '')), ''),
    now() + interval '10 minutes',
    v_payment_id
  )
  returning id into v_order_id;

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
    'total',      v_subtotal + v_fee
  );
end;
$$;

revoke all on function public.place_order(text, uuid, timestamptz, text) from public;
grant execute on function public.place_order(text, uuid, timestamptz, text) to authenticated;
