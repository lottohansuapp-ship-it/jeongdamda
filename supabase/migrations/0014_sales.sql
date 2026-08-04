-- 매출 집계
--
-- 사장님이 "오늘 얼마 팔았나"를 볼 방법이 없었다. 주문 목록을 눈으로 세야 했다.
--
-- 합산은 DB 안에서 한다. 주문을 전부 앱으로 가져와 JS 로 더하면 지금은 빨라도
-- 한 해가 지나면 수천 건을 옮기게 된다. 매일 여는 화면이라 그게 그대로 체감된다.
--
-- 무엇을 매출로 보는가: **결제된 뒤 취소되지 않은 주문**이다.
-- pending_payment 는 돈이 들어오지 않았고, canceled 는 돌려준 돈이다.

---------------------------------------------------------------------------
-- 기간 매출. from/to 는 한국 날짜(YYYY-MM-DD)로 받는다.
-- 서버가 UTC 라 날짜를 그냥 비교하면 자정 근처 주문이 엉뚱한 날로 넘어간다.
---------------------------------------------------------------------------
create or replace function public.sales_summary(
  p_from date,
  p_to   date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception '권한이 없습니다.' using errcode = '28000';
  end if;

  -- 한국 날짜의 00:00 부터 다음 날 00:00 직전까지
  v_start := (p_from::text || ' 00:00:00')::timestamp at time zone 'Asia/Seoul';
  v_end   := ((p_to + 1)::text || ' 00:00:00')::timestamp at time zone 'Asia/Seoul';

  select jsonb_build_object(
    'orders',   count(*),
    'revenue',  coalesce(sum(o.total), 0),
    'delivery', count(*) filter (where o.fulfillment = 'delivery'),
    'pickup',   count(*) filter (where o.fulfillment = 'pickup'),
    'canceled', (
      select count(*) from public.orders c
       where c.status = 'canceled'
         and c.paid_at >= v_start and c.paid_at < v_end
    ),
    'refunded', (
      select coalesce(sum(c.refund_amount), 0) from public.orders c
       where c.refunded_at >= v_start and c.refunded_at < v_end
    )
  )
  into v_result
  from public.orders o
  where o.paid_at >= v_start
    and o.paid_at < v_end
    and o.status <> 'canceled';

  return v_result;
end;
$$;

revoke all on function public.sales_summary(date, date) from public;
grant execute on function public.sales_summary(date, date) to authenticated;

---------------------------------------------------------------------------
-- 기간 내 많이 팔린 반찬.
--
-- 상품이 지워져도 order_items 의 이름 스냅샷은 남으므로 이름으로 묶는다.
-- product_id 로 묶으면 지워진 상품이 전부 null 하나로 합쳐진다.
---------------------------------------------------------------------------
create or replace function public.sales_top_items(
  p_from  date,
  p_to    date,
  p_limit int default 10
)
returns table (name text, quantity bigint, revenue bigint)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
begin
  if not public.is_admin() then
    raise exception '권한이 없습니다.' using errcode = '28000';
  end if;

  v_start := (p_from::text || ' 00:00:00')::timestamp at time zone 'Asia/Seoul';
  v_end   := ((p_to + 1)::text || ' 00:00:00')::timestamp at time zone 'Asia/Seoul';

  return query
  select i.name,
         sum(i.quantity)::bigint,
         sum(i.line_total)::bigint
    from public.order_items i
    join public.orders o on o.id = i.order_id
   where o.paid_at >= v_start
     and o.paid_at < v_end
     and o.status <> 'canceled'
   group by i.name
   order by sum(i.quantity) desc, sum(i.line_total) desc
   limit least(greatest(p_limit, 1), 50);
end;
$$;

revoke all on function public.sales_top_items(date, date, int) from public;
grant execute on function public.sales_top_items(date, date, int) to authenticated;

-- 기간 조회가 매번 전체를 훑지 않도록. 결제된 주문만 담아 인덱스를 작게 유지한다.
create index orders_paid_at_idx on public.orders (paid_at)
  where paid_at is not null;
