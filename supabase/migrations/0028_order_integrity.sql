-- 주문·재고·환불 무결성 (2026-10-14 점검에서 확인된 것들).
--
-- 0027 은 feature/identity 브랜치가 쓴다. 그 파일은 주문·취소 함수를 건드리지
-- 않으므로 어느 쪽을 먼저 실행해도 서로 덮어쓰지 않는다.
--
-- 순서: 이 파일 실행 → 결과 줄 확인 → 바로 앱 배포.
--   · 실행 후 배포 전까지: 옛 앱은 cancel_order 에 p_refunded 를 늘 붙여 보내므로
--     **모든 취소가 실패한다**(돈은 안 나간다 — 막히는 쪽이다). 그래서 바로 배포한다.
--   · 거꾸로 앱부터 배포하면 위험하다. 포트원 환불은 나가는데 record_refund 가 없어
--     주문이 결제됨으로 남는다. 반드시 이 파일이 먼저다.
--
--   1. 환불 기록은 서버만 남긴다 (record_refund). 손님이 cancel_order 에
--      "환불했음" 을 직접 넣어 보낼 수 있었다.
--   2. 환불이 필요한지는 "결제된 적이 있는가"(paid_at) 로 본다. 예전에는
--      status = 'paid' 만 봐서, 접수·준비 중에 멈춘 옛 주문을 취소하면
--      돈을 돌려주지 않고 취소만 됐다.
--   3. place_order — 장바구니를 한 번만 읽고, 차감이 전부 됐는지 센다.
--      같은 손님의 결제 대기 주문은 하나만 남기고, 결제 안 한 주문을 연달아
--      만들어 재고를 묶어 두지 못하게 한다.
--   4. 만료 정리를 1분마다 돌린다. 예전에는 누군가 주문에 성공해야만 돌아서
--      한산한 날엔 포기한 결제의 재고가 품절로 묶여 있었다.
--   5. adjust_stock — 관리자 +/- 버튼이 "화면에 보이는 숫자" 를 덮어쓰지 않고
--      DB 값에 더하고 뺀다. 그 사이 팔린 수량이 되살아나지 않는다.
--   6. coupon_usage — 쿠폰별 발급·사용 수를 DB 에서 센다(관리자 쿠폰 화면).


---------------------------------------------------------------------------
-- 1. 환불 기록
--
-- mark_order_paid 와 같은 비밀값으로만 부를 수 있다. 포트원 환불이 실제로
-- 성공한 뒤 서버(order-actions, payments/confirm)만 부른다.
--
-- 결제가 늦게 들어와 이미 취소된 주문(paid_at 이 비어 있음)을 자동 환불할 때도
-- 여기로 온다. 그때는 결제 시각·금액도 같이 남긴다 — 매출 화면에서
-- "결제 후 취소·환불" 로 짝이 맞게 잡히고, 돈이 오간 흔적이 주문에 남는다.
-- 예전에는 error_logs 에만 남았고, 그건 90일 뒤 지워진다.
---------------------------------------------------------------------------
create or replace function public.record_refund(
  p_payment_id text,
  p_amount     int,
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

  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception '환불 기록 권한이 없습니다.' using errcode = '28000';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception '환불 금액이 올바르지 않습니다.';
  end if;

  select * into v_order
    from public.orders where payment_id = p_payment_id for update;
  if not found then
    raise exception '환불에 해당하는 주문을 찾을 수 없습니다.';
  end if;

  -- 이미 남겼다. 웹훅 재시도·취소 재시도에서 두 번 온다.
  if v_order.refunded_at is not null then
    return jsonb_build_object('order_id', v_order.id, 'applied', false);
  end if;

  update public.orders
     set refunded_at   = now(),
         refund_amount = p_amount,
         paid_at       = coalesce(paid_at, now()),
         paid_amount   = coalesce(paid_amount, p_amount)
   where id = v_order.id;

  return jsonb_build_object('order_id', v_order.id, 'applied', true);
end;
$$;

revoke all on function public.record_refund(text, int, text) from public;
grant execute on function public.record_refund(text, int, text) to anon, authenticated;


---------------------------------------------------------------------------
-- 2. 취소 선점 — 환불 필요 여부를 paid_at 으로
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
    -- status = 'paid' 가 아니라 paid_at 이다. 접수(accepted)·준비 중(preparing)
    -- 같은 옛 단계에 남은 주문도 돈은 받은 주문이다.
    'needs_refund', v_order.paid_at is not null
                    and v_order.payment_id is not null
                    and v_order.refunded_at is null
  );
end;
$$;


---------------------------------------------------------------------------
-- 2'. 취소 — 환불 금액을 더는 받지 않는다
--
-- 인자에서 p_refunded 를 뺀다. 남겨 두면 손님이 아무 숫자나 넣어 "환불됨" 으로
-- 취소할 수 있다(돈은 안 나가고 매출 통계만 틀어진다). 환불 기록은 1번이 남긴다.
---------------------------------------------------------------------------
drop function if exists public.cancel_order(uuid, text, int);

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason   text default null
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

  -- 돈을 받은 주문인데 환불 기록이 없으면 거절한다. 55000 을 본 호출부가
  -- 환불부터 하고 다시 부른다 (0018 과 같은 약속, 기준만 paid_at 으로 넓혔다).
  if v_order.paid_at is not null
     and v_order.payment_id is not null
     and v_order.refunded_at is null then
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

  update public.user_coupons
     set used_at = null, order_id = null
   where order_id = p_order_id;

  update public.orders
     set status        = 'canceled',
         canceled_at   = now(),
         cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = v_order.id;

  return jsonb_build_object('order_id', p_order_id, 'order_no', v_order.order_no);
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public;
grant execute on function public.cancel_order(uuid, text) to authenticated;


---------------------------------------------------------------------------
-- 3. 결제 대기 주문 풀어 주기 — 만료 정리와 place_order 가 같이 쓴다
--
-- 주문 행을 먼저 잠그고(호출부), 상품을 id 순으로 잠근다. cancel_order 와 같은 순서다.
--
-- 두 겹으로 막는다.
--   · 권한: Supabase 는 public 스키마에 새 함수를 만들면 anon·authenticated 에게
--     실행 권한을 **따로** 준다. "from public" 만 빼면 그 둘은 그대로 남는다.
--     그래서 이름을 대고 뺀다. 이걸 빠뜨리면 손님이 자기 주문 번호로 이 함수를
--     되풀이 불러 재고를 끝없이 늘릴 수 있다.
--   · 본문: 그래도 뚫릴 때를 대비해 결제 대기(pending_payment) 주문만 다룬다.
--     이미 취소·결제된 주문이 섞여 들어와도 재고·쿠폰·상태를 건드리지 않는다.
---------------------------------------------------------------------------
create or replace function public.release_pending_orders(
  p_ids    uuid[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.orders
   where id = any(p_ids) and status = 'pending_payment';

  if v_ids is null then
    return;
  end if;

  perform 1 from public.products
   where id in (
     select distinct product_id from public.order_items
      where order_id = any(v_ids) and product_id is not null
   )
   order by id
   for update;

  update public.user_coupons
     set used_at = null, order_id = null
   where order_id = any(v_ids);

  update public.products p
     set today_stock = p.today_stock + agg.qty
    from (
      select product_id, sum(quantity) as qty
        from public.order_items
       where order_id = any(v_ids) and product_id is not null
       group by product_id
    ) agg
   where p.id = agg.product_id;

  update public.orders
     set status        = 'canceled',
         canceled_at   = now(),
         cancel_reason = p_reason
   where id = any(v_ids);
end;
$$;

revoke all on function public.release_pending_orders(uuid[], text)
  from public, anon, authenticated;

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

  perform public.release_pending_orders(v_expired, '결제 시간 초과');
end;
$$;


---------------------------------------------------------------------------
-- 3'. 주문 생성
--
-- 0025 의 본문에서 바뀐 곳만 적는다.
--   · 장바구니를 처음에 **한 번** 배열로 읽어 끝까지 그것만 쓴다. 예전에는
--     문장마다 cart_items 를 다시 읽어서, 다른 탭에서 그 사이 담은 반찬이
--     차감 없이 주문 항목에만 들어갈 틈이 있었다.
--   · 차감한 줄 수를 센다. 하나라도 모자라면 예외 → 전부 되돌린다.
--   · 같은 손님의 결제 대기 주문은 새 주문이 대신한다(이전 것은 풀어 준다).
--   · 한 시간에 결제 안 한 주문을 5개 넘게 만들 수 없다(관리자 제외).
--     하나만 남겨도 10분마다 새로 만들면 재고를 계속 묶어 둘 수 있어서다.
--     결제를 다시 하고 싶은 손님은 주문 화면의 「다시 결제하기」를 쓴다.
--   · 결제할 금액이 0원이면 만들지 않는다(포트원이 결제창을 못 연다).
--   · 요청사항은 200자에서 자른다(앱만 자르고 있었다).
---------------------------------------------------------------------------
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
  v_minimum  int;
  v_free_from int;
  v_order_id uuid;
  v_order_no text;
  v_payment_id text;
  v_coupon   public.user_coupons%rowtype;
  v_rule     public.coupons%rowtype;
  v_discount int := 0;
  v_pids     uuid[];
  v_qtys     int[];
  v_rows     int;
  v_unpaid   int;
  v_previous uuid[];
begin
  if v_user is null then
    raise exception '로그인이 필요합니다.' using errcode = '28000';
  end if;

  if p_fulfillment not in ('pickup', 'delivery') then
    raise exception '수령 방법이 올바르지 않습니다.';
  end if;

  -- 같은 손님의 주문 만들기는 한 번에 하나씩. 결제 버튼을 두 번 누르면 둘 다
  -- "이전 대기 주문 없음" 을 보고 지나가 재고를 두 번 잡았다. 다른 손님은 막지 않는다.
  perform pg_advisory_xact_lock(hashtext('place_order:' || v_user::text));

  perform public.sweep_expired_orders();

  if not public.is_admin() then
    select count(*) into v_unpaid
      from public.orders
     where user_id = v_user
       and created_at > now() - interval '1 hour'
       and paid_at is null;
    if v_unpaid >= 5 then
      raise exception '결제가 끝나지 않은 주문이 많아요. 주문 내역의 「다시 결제하기」를 이용하시거나 한 시간쯤 뒤에 다시 주문해 주세요.';
    end if;
  end if;

  select array_agg(id) into v_previous from (
    select id from public.orders
     where user_id = v_user and status = 'pending_payment'
     for update
  ) t;

  select array_agg(product_id order by product_id),
         array_agg(quantity   order by product_id)
    into v_pids, v_qtys
    from public.cart_items
   where user_id = v_user;

  if v_pids is null then
    raise exception '장바구니가 비어 있습니다.';
  end if;

  -- 이전 대기 주문의 상품과 이번 장바구니 상품을 **한 번에** id 순으로 잠근다.
  -- 따로따로 잠그면(이전 주문 5번 → 장바구니 3번) 다른 손님(3번 → 5번)과 엇갈려 교착이 난다.
  perform 1 from public.products
   where id = any(v_pids)
      or id in (select product_id from public.order_items
                 where order_id = any(coalesce(v_previous, '{}')) and product_id is not null)
   order by id
   for update;

  perform public.release_pending_orders(v_previous, '새 주문으로 대체');

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

  select p.name into v_blocked
    from unnest(v_pids, v_qtys) as l(product_id, quantity)
    join public.products p on p.id = l.product_id
   where not p.today_available
   limit 1;
  if v_blocked is not null then
    raise exception '%은(는) 오늘 판매하지 않습니다.', v_blocked;
  end if;

  select p.name into v_blocked
    from unnest(v_pids, v_qtys) as l(product_id, quantity)
    join public.products p on p.id = l.product_id
   where p.today_stock < l.quantity
   limit 1;
  if v_blocked is not null then
    raise exception '%이(가) 방금 품절되었습니다.', v_blocked;
  end if;

  select coalesce(sum(p.price * l.quantity), 0) into v_subtotal
    from unnest(v_pids, v_qtys) as l(product_id, quantity)
    join public.products p on p.id = l.product_id;

  if p_fulfillment = 'delivery' then
    select * into v_address
      from public.addresses
     where id = p_address_id and user_id = v_user;
    if not found then
      raise exception '배송지를 선택해 주세요.';
    end if;

    v_address_text := trim(both ' ' from
      coalesce(v_address.address1, '') || ' ' || coalesce(v_address.address2, ''));

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

    if v_minimum > 0 and v_subtotal < v_minimum then
      raise exception '배달은 %원 이상부터 가능합니다.', v_minimum;
    end if;

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

    v_discount := least(v_rule.discount, v_subtotal);
  end if;

  if v_subtotal + v_fee - v_discount <= 0 then
    raise exception '결제할 금액이 없어요. 매장에 문의해 주세요.';
  end if;

  update public.products p
     set today_stock = p.today_stock - l.quantity
    from unnest(v_pids, v_qtys) as l(product_id, quantity)
   where p.id = l.product_id
     and p.today_stock >= l.quantity;

  -- 한 줄이라도 못 깎았으면 전부 되돌린다. 위에서 확인했어도 여기서 다시 센다 —
  -- 이 줄이 마지막 방어선이다 (CLAUDE.md 「재고의 진실」).
  get diagnostics v_rows = row_count;
  if v_rows <> array_length(v_pids, 1) then
    raise exception '재고가 방금 바뀌었어요. 장바구니를 다시 확인해 주세요.';
  end if;

  v_order_no := to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD')
                || '-' || lpad((nextval('public.order_no_seq') % 10000)::text, 4, '0');

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
    nullif(left(trim(coalesce(p_memo, '')), 200), ''),
    now() + interval '10 minutes',
    v_payment_id,
    p_user_coupon_id
  )
  returning id into v_order_id;

  if p_user_coupon_id is not null then
    update public.user_coupons
       set used_at = now(), order_id = v_order_id
     where id = p_user_coupon_id;
  end if;

  insert into public.order_items
    (order_id, product_id, name, unit_price, quantity, line_total)
  select v_order_id, p.id, p.name, p.price, l.quantity, p.price * l.quantity
    from unnest(v_pids, v_qtys) as l(product_id, quantity)
    join public.products p on p.id = l.product_id;

  return jsonb_build_object(
    'order_id',   v_order_id,
    'order_no',   v_order_no,
    'payment_id', v_payment_id,
    'discount',   v_discount,
    'total',      v_subtotal + v_fee - v_discount
  );
end;
$$;

revoke all on function public.place_order(text, uuid, timestamptz, text, uuid) from public;
grant execute on function public.place_order(text, uuid, timestamptz, text, uuid) to authenticated;

-- 취소·만료 정리가 order_id 로 쿠폰을 찾는다. 인덱스가 없어 매번 전체를 훑었다.
create index if not exists user_coupons_order_idx on public.user_coupons (order_id)
  where order_id is not null;


---------------------------------------------------------------------------
-- 4. 재고 더하기·빼기 (관리자 +/- 버튼)
--
-- security invoker — 쓰기 권한은 products 의 is_admin() 정책이 그대로 가른다.
-- 관리자가 아니면 0행이 되고, 0행은 예외로 바꾼다(조용히 "저장됨" 이 되지 않게).
---------------------------------------------------------------------------
create or replace function public.adjust_stock(p_product_id uuid, p_delta int)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_stock int;
begin
  if p_delta is null or abs(p_delta) > 999 then
    raise exception '재고 변경량이 올바르지 않습니다.';
  end if;

  update public.products
     set today_stock = least(999, greatest(0, today_stock + p_delta))
   where id = p_product_id
  returning today_stock into v_stock;

  if not found then
    raise exception '재고를 바꿀 권한이 없거나 반찬을 찾을 수 없습니다.'
      using errcode = '42501';
  end if;

  return v_stock;
end;
$$;

revoke all on function public.adjust_stock(uuid, int) from public;
grant execute on function public.adjust_stock(uuid, int) to authenticated;


---------------------------------------------------------------------------
-- 4'. 쿠폰별 발급·사용 수 (관리자 쿠폰 화면)
--
-- 예전엔 user_coupons 를 전부 받아 화면에서 셌다. 회원이 늘면 받는 양이 끝없이
-- 늘고, PostgREST 한도(1,000행)를 넘으면 숫자가 조용히 틀린다. 여기서 센다.
-- security invoker — user_coupons_admin_read 정책이 그대로 걸린다(관리자가 아니면 0).
---------------------------------------------------------------------------
create or replace function public.coupon_usage()
returns table (coupon_id uuid, issued bigint, used bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select coupon_id, count(*), count(used_at)
    from public.user_coupons
   group by coupon_id;
$$;

revoke all on function public.coupon_usage() from public, anon;
grant execute on function public.coupon_usage() to authenticated;


---------------------------------------------------------------------------
-- 5. 만료 정리를 1분마다
--
-- 0017 과 같은 방식이다. pg_cron 을 못 쓰면 이 블록만 건너뛰고 안내를 띄운다.
-- cron.schedule 은 같은 이름이면 덮어쓰므로 여러 번 실행해도 된다.
---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;

  perform cron.schedule(
    'sweep-expired-orders',
    '* * * * *',
    $cron$ select public.sweep_expired_orders(); $cron$
  );

  raise notice 'sweep_expired_orders 를 1분마다 돌리도록 예약했습니다.';
exception
  when others then
    raise notice 'pg_cron 을 쓸 수 없어 예약을 건너뛰었습니다 (%).', sqlerrm;
    raise notice '  Supabase 대시보드 > Database > Extensions 에서 pg_cron 을 켜고';
    raise notice '  이 파일을 다시 실행하세요.';
end;
$$;

-- 확인용. 결과 행으로 보인다 (notice 는 SQL Editor 에서 놓치기 쉽다).
-- cron.job 을 직접 읽지 않는다 — pg_cron 이 없으면 그 표가 없어 여기서 멈춘다.
select
  (select count(*) from pg_extension where extname = 'pg_cron') = 1
    as "1분 정리 예약 가능",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('record_refund', 'adjust_stock', 'release_pending_orders', 'coupon_usage'))
    as "새 함수 (4이면 정상)",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cancel_order')
    as "cancel_order (1이면 정상)",
  -- 손님(authenticated)·비로그인(anon)이 직접 부를 수 있으면 안 된다. 둘 다 false 여야 정상.
  has_function_privilege('authenticated', 'public.release_pending_orders(uuid[],text)', 'execute')
    as "손님 직접 호출 (false 정상)",
  has_function_privilege('anon', 'public.release_pending_orders(uuid[],text)', 'execute')
    as "비로그인 직접 호출 (false 정상)";
