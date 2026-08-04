-- 주문 취소. 재고를 되돌리는 일이 함께 일어나야 한다.
--
-- 왜 DB 함수인가:
--   손님은 products 에 UPDATE 권한이 없다 (D20). 앱 코드에서 재고를 더하려 하면
--   RLS 가 0행으로 조용히 막고, 주문만 취소되고 재고는 영영 묶인다.
--   place_order 와 같은 이유로 SECURITY DEFINER 다.
--
-- 권한은 함수가 직접 확인한다. user_id 를 인자로 받지 않는다.
-- 손님은 자기 주문만, 접수 전까지만 (D23). 사장님은 완료·취소가 아니면 언제든.

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

  -- 잠근 뒤에 상태를 본다. 안 잠그면 두 번 눌렀을 때 재고가 두 번 돌아온다.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception '주문을 찾을 수 없습니다.';
  end if;

  -- 남의 주문은 '권한 없음'이 아니라 '없음'으로 답한다.
  -- 권한 오류를 주면 그 주문번호가 존재한다는 사실을 알려주는 셈이다.
  if not v_admin and v_order.user_id is distinct from v_user then
    raise exception '주문을 찾을 수 없습니다.';
  end if;

  if v_order.status = 'canceled' then
    raise exception '이미 취소된 주문입니다.';
  end if;
  if v_order.status = 'completed' then
    raise exception '완료된 주문은 취소할 수 없습니다.';
  end if;

  -- 손님은 매장이 접수하기 전까지만. 그 뒤엔 이미 포장이 시작됐을 수 있다.
  if not v_admin and v_order.status not in ('pending_payment', 'paid') then
    raise exception '이미 준비가 시작되었어요. 매장에 연락해 주세요.';
  end if;

  -- 잠금 순서 고정 (place_order 와 같은 규칙). 없으면 동시 취소끼리 교착한다.
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
     set status = 'canceled',
         canceled_at = now(),
         cancel_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'order_no', v_order.order_no);
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public;
grant execute on function public.cancel_order(uuid, text) to authenticated;
