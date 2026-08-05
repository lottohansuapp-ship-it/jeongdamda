-- 전수 조사에서 나온 것 중 돈과 매장 운영이 걸린 두 가지를 고친다.


-- 1. 알림톡이 실제로는 한 통도 나가지 않고 있었다
--
-- notify/index.ts 의 loadOrder 가 publicClient()(anon, 세션 없음)로 orders 를
-- 직접 읽었다. 그런데 orders 의 select 정책은 둘 다 to authenticated 다.
-- anon 에 맞는 정책이 없으니 RLS 는 오류가 아니라 **0행**을 돌려준다.
-- loadOrder 는 null 을 받고 notifyNewOrder 는 `if (!order) return;` 으로
-- 조용히 끝난다. record() 까지 가지도 못해 실패 기록조차 안 남았다.
--
-- 결제 웹훅은 서버 대 서버 호출이라 세션이 아예 없다. 손님 세션에도
-- 관리자 세션에도 기댈 수 없으니 비밀값으로 여는 통로가 필요하다.
-- mark_order_paid 가 이미 쓰는 app_secrets.payment_webhook 을 같이 쓴다.
-- 비밀값을 하나 더 만들면 사장님이 넣어야 할 값만 늘어난다.
--
-- 돌려주는 값에 손님 전화번호가 들어간다. 그래서 정책이 아니라 비밀값으로
-- 잠근다 — 비밀값을 모르면 한 줄도 못 읽는다.

create or replace function public.order_for_notify(
  p_order_id uuid,
  p_secret   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_result jsonb;
begin
  select value into v_secret from public.app_secrets where key = 'payment_webhook';

  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception '권한이 없습니다.' using errcode = '28000';
  end if;

  select jsonb_build_object(
           'order_no',         o.order_no,
           'fulfillment',      o.fulfillment,
           'total',            o.total,
           'address_snapshot', o.address_snapshot,
           'pickup_at',        o.pickup_at,
           'created_at',       o.created_at,
           'receiver_phone',   o.receiver_phone,
           'items', coalesce(
             (select jsonb_agg(jsonb_build_object('name', i.name, 'quantity', i.quantity)
                               order by i.name)
                from public.order_items i
               where i.order_id = o.id),
             '[]'::jsonb
           )
         )
    into v_result
    from public.orders o
   where o.id = p_order_id;

  -- 없는 주문이면 null 이 나간다. 호출부가 그걸 실패로 기록한다.
  return v_result;
end;
$$;

revoke all on function public.order_for_notify(uuid, text) from public;
grant execute on function public.order_for_notify(uuid, text) to anon, authenticated;


-- 2. 취소와 결제 확정이 겹치면 환불 없이 취소될 수 있었다
--
-- 손님이 결제창을 띄운 채로 취소를 누르면 이런 순서가 가능하다.
--
--   1) begin_cancel — 그 시점 상태가 pending_payment 라 needs_refund = false
--   2) 그 사이 웹훅 도착 → mark_order_paid → 상태가 paid 로 바뀜
--   3) cancel_order — paid 도 허용하므로 그대로 취소. p_refunded 가 null 이라
--      refunded_at 이 남지 않는다
--
-- 결과: 손님은 돈을 냈는데 주문은 환불 기록 없이 취소된다.
-- 창이 좁아 자주 나지는 않지만, 한 번 나면 손님 돈이 그대로 묶인다.
--
-- 앱에서 호출 순서를 바꿔 막으려 하면 또 다른 타이밍이 생긴다. 그래서
-- 마지막 관문인 cancel_order 가 스스로 거절하게 한다.
-- **결제된 주문은 환불 기록 없이 취소되지 않는다.**
--
-- 조용한 손실이 시끄러운 오류로 바뀐다. 호출부는 그 오류를 보고 다시
-- 시도하면 되고, 그때는 상태가 paid 라 begin_cancel 이 환불이 필요하다고 알려 준다.

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

revoke all on function public.cancel_order(uuid, text, int) from public;
grant execute on function public.cancel_order(uuid, text, int) to authenticated;


-- 3. 외래키인데 인덱스가 없던 두 곳
--
-- 상품을 지우면 Postgres 가 이 컬럼으로 자식 행을 찾아야 하는데 인덱스가 없어
-- 테이블 전체를 훑었다. cart_items 는 작게 유지되지만 order_items 는
-- 전자상거래법상 5년을 보관하므로 계속 커진다. 지금 만들어 두는 편이 낫다.

create index if not exists cart_items_product_idx  on public.cart_items  (product_id);
create index if not exists order_items_product_idx on public.order_items (product_id);
