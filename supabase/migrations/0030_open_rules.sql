-- 0030 오픈 전 손님 규칙 두 가지 (2026-10-16)
--
-- 1. 손님 취소는 결제 후 10분까지만 앱에서 (begin_cancel).
--    예전엔 「완료」 직전까지 앱에서 전액 취소가 됐다. 반찬을 다 싸 둔 뒤에도.
--    환불정책은 「매장이 접수하기 전까지」라고 적혀 있어 서로 맞지 않았다.
--    관리자 취소, 결제 전(pending_payment) 취소는 그대로다.
--
-- 2. 한 시간에 결제 안 한 주문 제한 5개 → 10개 (place_order).
--    결제창이 몇 번 실패한 손님이 한 시간 동안 주문을 못 했다. 취소된 것까지 세는
--    이유는 그대로다 — 새 주문이 이전 대기 주문을 풀어 주므로, 대기 중인 것만 세면
--    늘 1이라 제한이 없는 것과 같다. 안내에 매장 번호를 넣었다.
--
-- 두 함수 모두 0028/0029 본문 그대로에 위 줄만 바꿨다.

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
    if v_unpaid >= 10 then
      raise exception '결제가 끝나지 않은 주문이 많아요. 주문 내역의 「다시 결제하기」를 이용하시거나 매장(02-6953-8086)으로 전화 주세요.';
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
  v_vbank boolean;
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

  -- 가상계좌 주문인가. 계좌번호가 기록 안 됐어도(포트원 조회에 빠졌을 때)
  -- 결제수단 기록으로 한 번 더 본다 — 둘 중 하나만 놓쳐도 손님 취소 경로가 열린다.
  v_vbank := v_order.vbank_account is not null
             or v_order.payment_method = 'PaymentMethodVirtualAccount';

  if not v_admin
     and v_vbank
     and v_order.paid_at is not null then
    raise exception '가상계좌로 입금한 주문은 매장에 전화로 취소해 주세요. 환불은 매장에서 계좌로 보내 드려요.';
  end if;

  -- 결제 후 10분이 지나면 반찬을 담기 시작한다. 그 뒤 취소는 전화로 받는다 (환불정책 1조).
  -- 앱(orders.ts CANCEL_WINDOW_MINUTES)도 같은 값으로 버튼을 감춘다 — 진짜 막는 곳은 여기다.
  if not v_admin
     and v_order.paid_at is not null
     and now() > v_order.paid_at + interval '10 minutes' then
    raise exception '결제하고 10분이 지나 반찬 준비를 시작했어요. 취소는 매장(02-6953-8086)으로 전화 주세요.';
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
    'needs_refund', v_order.paid_at is not null
                    and v_order.payment_id is not null
                    and v_order.refunded_at is null,
    'manual_refund', v_admin
                    and v_vbank
                    and v_order.paid_at is not null
                    and v_order.refunded_at is null,
    'vbank_open',   v_order.status = 'pending_payment'
                    and v_order.vbank_account is not null
  );
end;
$$;

-- 확인용 결과 줄
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'place_order')
    as "place_order (1이면 정상)",
  (select position('10 minutes' in pg_get_functiondef('public.begin_cancel(uuid)'::regprocedure)) > 0)
    as "취소 10분 규칙 (true 정상)",
  (select position('v_unpaid >= 10' in pg_get_functiondef('public.place_order(text,uuid,timestamptz,text,uuid)'::regprocedure)) > 0)
    as "미결제 10건 (true 정상)";
