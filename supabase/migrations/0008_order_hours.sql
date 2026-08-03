-- 버그 수정: place_order 가 영업시간을 검사하지 않았다.
--
-- 0007 은 is_open 토글과 pickup/delivery 스위치만 봤다. 그래서 영업시간이
-- 09:00~20:00 인데 한국 시간 23:29 에 주문이 통과했다.
--
-- src/lib/store.ts 의 storeOpenState() 는 화면 안내용이다. 손님이 REST 엔드포인트를
-- 직접 치면 그 코드는 지나가지도 않는다. 진짜 관문은 여기다.
--
-- 서버는 UTC 로 돌고 사장님이 입력한 시각은 한국 벽시계다.
-- 환산하지 않고 비교하면 9시간 어긋난다.

create or replace function public.store_is_open_now()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.store_settings%rowtype;
  v_seoul    timestamp;
  v_dow      int;
  v_time     time;
begin
  select * into v_settings from public.store_settings where id = 1;
  if not found or not v_settings.is_open then
    return false;
  end if;

  v_seoul := now() at time zone 'Asia/Seoul';
  v_dow   := extract(dow from v_seoul)::int;   -- 0=일 … 6=토
  v_time  := v_seoul::time;

  if v_dow = any(v_settings.closed_weekdays) then
    return false;
  end if;

  -- 개점과 마감이 같으면 24시간 영업으로 본다
  if v_settings.open_time = v_settings.close_time then
    return true;
  end if;

  if v_settings.close_time > v_settings.open_time then
    return v_time >= v_settings.open_time and v_time < v_settings.close_time;
  end if;

  -- 자정을 넘기는 영업 (예: 10:00 ~ 02:00)
  return v_time >= v_settings.open_time or v_time < v_settings.close_time;
end;
$$;

revoke all on function public.store_is_open_now() from public;
grant execute on function public.store_is_open_now() to anon, authenticated;

---------------------------------------------------------------------------
-- place_order 에 영업시간 검사를 넣는다. 나머지 로직은 0007 과 동일하다.
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
  if not found then
    raise exception '매장 설정을 찾을 수 없습니다.';
  end if;

  -- 영업시간 검사. 화면이 아니라 여기가 실제 방어선이다.
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

  -- 잠금 순서 고정. 여러 품목을 아무 순서로 잠그면 동시 주문끼리 교착한다.
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
