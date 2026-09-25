-- 0023 배달 접수 시간을 따로 둔다
--
-- 영업시간은 매장 문을 여는 시간이고 픽업은 그 시간을 따른다.
-- 배달은 그보다 짧다 — 배달 나갔다 돌아올 시간이 필요하니 마감 전에 접수를
-- 끊어야 한다.
--
--   delivery_open_time / delivery_close_time
--     비워 두면(null) 매장 영업시간을 그대로 따른다. 지금까지와 같다.
--
-- **이 SQL 을 먼저 실행하고 앱을 배포한다.** 반대로 하면 앱이 없는 컬럼을
-- 읽어서 주문서가 통째로 깨진다.

alter table public.store_settings
  add column if not exists delivery_open_time  time,
  add column if not exists delivery_close_time time;

/*
 * 지금 배달을 받을 수 있는 시간인가.
 *
 * store_is_open_now() 와 나눠 둔다. 그쪽은 임시휴무·휴무요일·영업시간을 보고,
 * 이쪽은 배달 시간대만 본다. 배달은 영업시간 안의 더 좁은 구간이라
 * 둘 다 통과해야 한다 — place_order 가 순서대로 확인한다.
 *
 * 한국 시간으로 비교한다. 서버는 UTC 라 환산하지 않으면 9시간 어긋난다 (0008).
 */
create or replace function public.delivery_open_now()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.store_settings%rowtype;
  v_open  time;
  v_close time;
  v_time  time;
begin
  select * into v_settings from public.store_settings where id = 1;
  if not found then
    return false;
  end if;

  -- 따로 안 정했으면 매장 영업시간을 따른다.
  v_open  := coalesce(v_settings.delivery_open_time,  v_settings.open_time);
  v_close := coalesce(v_settings.delivery_close_time, v_settings.close_time);

  v_time := (now() at time zone 'Asia/Seoul')::time;

  -- 시작과 마감이 같으면 24시간 (storeOpenState 와 같은 규칙)
  if v_open = v_close then
    return true;
  end if;

  if v_close > v_open then
    return v_time >= v_open and v_time < v_close;
  end if;

  -- 자정을 넘기는 시간대 (예: 10:00 ~ 02:00)
  return v_time >= v_open or v_time < v_close;
end;
$$;

revoke all on function public.delivery_open_now() from public;
grant execute on function public.delivery_open_now() to anon, authenticated;

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
  v_minimum  int;   -- 이 금액 미만이면 배달을 받지 않는다
  v_free_from int;  -- 이 금액 이상이면 배달비가 0
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

grant execute on function public.place_order(text, uuid, timestamptz, text) to authenticated;

-- 확인용. 배달 시간이 비어 있으면 영업시간을 따른다는 뜻이다.
select open_time as 영업시작, close_time as 영업마감,
       delivery_open_time as 배달시작, delivery_close_time as 배달마감,
       public.delivery_open_now() as 지금_배달가능
  from public.store_settings where id = 1;
