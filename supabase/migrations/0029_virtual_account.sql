-- 가상계좌 입금 (2026-10-15 사용자 결정).
--   · 실시간 계좌이체 대신 가상계좌. 입금 기한 30분.
--   · 입금된 가상계좌 주문의 환불은 **사장님이 손님 계좌로 직접 이체**한다.
--     가상계좌는 카드처럼 결제 취소만으로 돈이 돌아가지 않는다(환불 계좌·특약 필요).
--
-- 순서: 이 파일 실행 → 결과 줄 확인 → 앱 배포. 앱이 새 칸(vbank_*)을 읽으므로
-- 앱을 먼저 배포하면 주문 화면이 열리지 않는다.


---------------------------------------------------------------------------
-- 1. 주문에 가상계좌 정보. 손님 주문 화면에 그대로 보여 준다.
--    가게로 입금받는 계좌라 손님 개인정보가 아니다.
---------------------------------------------------------------------------
alter table public.orders
  add column if not exists vbank_bank    text,
  add column if not exists vbank_account text,
  add column if not exists vbank_holder  text,
  add column if not exists vbank_due     timestamptz;


---------------------------------------------------------------------------
-- 2. 계좌 발급 기록 — 서버만 (mark_order_paid 와 같은 비밀값)
--
-- 재고를 잡아 두는 시간(reserved_until)을 입금 기한 + 10분으로 늘린다. 기본 10분으로
-- 두면 손님이 은행 앱을 여는 사이 주문이 취소되고 재고가 다른 손님에게 간다.
-- 기한은 포트원이 알려 준 값(KCP 가 실제로 정한 것)을 쓰되 주문 뒤 45분을 넘기지
-- 않는다 — KCP 가 기한을 무시하고 며칠로 잡아도 반찬은 그만큼 묶이지 않는다.
-- 넘겼으면 capped=true 로 알려 준다(호출부가 사장님 화면에 남긴다).
---------------------------------------------------------------------------
create or replace function public.mark_vbank_issued(
  p_payment_id text,
  p_bank       text,
  p_account    text,
  p_holder     text,
  p_due        timestamptz,
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
  v_limit  timestamptz;
  v_due    timestamptz;
begin
  select value into v_secret
    from public.app_secrets where key = 'payment_webhook';

  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception '가상계좌 기록 권한이 없습니다.' using errcode = '28000';
  end if;

  if coalesce(trim(p_account), '') = '' then
    raise exception '가상계좌 번호가 없습니다.';
  end if;

  select * into v_order
    from public.orders where payment_id = p_payment_id for update;
  if not found then
    raise exception '가상계좌에 해당하는 주문을 찾을 수 없습니다.';
  end if;

  -- 이미 결제됐거나 취소된 주문. 웹훅 재시도면 할 일이 없고, 취소된 주문이면
  -- 호출부가 계좌를 닫는다(입금이 들어오면 사장님이 직접 돌려줘야 하므로).
  -- refunded — 사장님이 이미 직접 돌려준 주문이면 호출부가 다시 알리지 않는다.
  if v_order.status <> 'pending_payment' then
    return jsonb_build_object(
      'order_id', v_order.id,
      'status',   v_order.status,
      'applied',  false,
      'refunded', v_order.refunded_at is not null);
  end if;

  v_limit := v_order.created_at + interval '45 minutes';
  v_due   := least(coalesce(p_due, now() + interval '30 minutes'), v_limit);

  -- 기한 뒤 10분 더 잡아 둔다. 기한 직전 입금의 결제 웹훅이 늦게 와도
  -- 그 사이 만료 정리가 주문을 취소해 버리지 않게.
  update public.orders
     set vbank_bank     = nullif(trim(p_bank), ''),
         vbank_account  = trim(p_account),
         vbank_holder   = nullif(trim(p_holder), ''),
         vbank_due      = v_due,
         reserved_until = greatest(coalesce(reserved_until, now()), v_due + interval '10 minutes')
   where id = v_order.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'status',   'pending_payment',
    'applied',  true,
    'refunded', false,
    -- 처음 적을 때만 알린다. 같은 주문을 열 때마다·웹훅 재시도마다 알림이 쌓이지 않게.
    'capped',   v_order.vbank_due is null and p_due is not null and p_due > v_limit
  );
end;
$$;

revoke all on function public.mark_vbank_issued(text, text, text, text, timestamptz, text) from public;
grant execute on function public.mark_vbank_issued(text, text, text, text, timestamptz, text)
  to anon, authenticated;


---------------------------------------------------------------------------
-- 3. 결제 대기 주문 풀어 주기 — 계좌가 발급된 주문은 기한 전엔 놓지 않는다
--
-- 0028 과 같고 한 줄만 다르다. 같은 손님이 새 주문을 넣으면 이전 대기 주문을
-- 풀어 주는데, 이미 계좌를 받은 주문까지 풀면 손님이 그 계좌로 입금했을 때
-- 돈은 들어오고 주문은 취소된 상태가 된다. 기한이 지나면(만료 정리) 은행이
-- 계좌를 닫으므로 그때 풀면 된다.
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
   where id = any(p_ids)
     and status = 'pending_payment'
     and (vbank_account is null or reserved_until < now());

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


---------------------------------------------------------------------------
-- 4. 취소 선점 — 가상계좌
--
-- 0028 과 같고 두 가지가 더해졌다.
--   · 입금이 끝난 가상계좌 주문은 **손님이 취소할 수 없다.** 아무것도 쓰기 전에
--     맨 앞에서 거절한다. 환불은 사장님이 계좌로 직접 보내야 하는 일이라서다.
--     (여기서 막지 않으면 손님이 "사장님이 환불했음" 경로를 탈 수 있다.)
--   · manual_refund — 관리자에게만 true. 앱은 이걸 보고 포트원 환불 대신
--     "직접 이체했다" 는 사장님 확인을 받는다.
--   · vbank_open — 입금 전 가상계좌 주문. 앱이 취소하면서 계좌를 닫는다.
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
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'orders'
      and column_name in ('vbank_bank', 'vbank_account', 'vbank_holder', 'vbank_due'))
    as "새 칸 (4이면 정상)",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'mark_vbank_issued')
    as "mark_vbank_issued (1이면 정상)",
  has_function_privilege('authenticated', 'public.release_pending_orders(uuid[],text)', 'execute')
    as "release 손님 직접 호출 (false 정상)";
