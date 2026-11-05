-- 0032 사장님 휴대폰 푸시 알림 (2026-11-05 사용자 결정: "앱 푸시알림이 좋겠어")
--
-- 관리자 앱(홈 화면에 추가한 웹앱)을 닫아도 새 주문이 오면 휴대폰에 알림이 뜨게 한다.
-- 기기마다 브라우저가 주는 "알림 받을 주소"(endpoint + 암호 키 둘)를 여기에 저장한다.
--
-- 표는 직접 읽고 쓰지 못한다(정책 없음 = 전부 막힘). 함수 넷으로만 다룬다.
--   · save_push_subscription      — 관리자 본인 기기 등록 (로그인 세션 필요)
--   · delete_push_subscription    — 관리자 본인 기기 해제
--   · push_targets(secret)        — 결제 확정 서버가 보낼 곳 목록을 읽는다 (웹훅엔 세션이 없다)
--   · drop_push_subscription      — 브라우저가 "그 주소는 없어졌다"(404/410) 하면 지운다
-- 비밀값은 order_for_notify(0018) 와 같은 app_secrets 'payment_webhook' 이다.
--
-- order_for_notify 는 요청사항(memo)도 돌려주게 한다 — 알림에 「비대면」 을 보이려고.

create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
-- 정책을 일부러 만들지 않는다. 손님·관리자 누구도 표를 직접 못 본다 — 아래 함수로만.
revoke all on public.push_subscriptions from anon, authenticated;


create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 알림을 켤 수 있어요.' using errcode = '42501';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception '알림 주소가 올바르지 않아요.' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
     set user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         created_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = '42501';
  end if;
  delete from public.push_subscriptions
   where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

create or replace function public.push_targets(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select value into v_secret from public.app_secrets where key = 'payment_webhook';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception '권한이 없습니다.' using errcode = '28000';
  end if;

  -- 관리자 자격이 빠진 사람의 기기는 보내지 않는다(관리자에서 빠졌으면 알림도 끊긴다).
  return coalesce(
    (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
       from public.push_subscriptions s
      where exists (select 1 from public.admins a where a.user_id = s.user_id)),
    '[]'::jsonb);
end;
$$;

create or replace function public.drop_push_subscription(p_endpoint text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select value into v_secret from public.app_secrets where key = 'payment_webhook';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception '권한이 없습니다.' using errcode = '28000';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

-- Supabase 는 새 함수를 anon·authenticated 에 자동으로 연다 — 누가 부를 수 있는지 직접 정한다.
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon, authenticated;
revoke all on function public.delete_push_subscription(text) from public, anon, authenticated;
revoke all on function public.push_targets(text) from public, anon, authenticated;
revoke all on function public.drop_push_subscription(text, text) from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
-- 결제 웹훅은 세션이 없어 anon 으로 부른다. 비밀값이 문지기다(order_for_notify 와 같다).
grant execute on function public.push_targets(text) to anon, authenticated;
grant execute on function public.drop_push_subscription(text, text) to anon, authenticated;


-- order_for_notify: 0018 그대로에 memo 한 줄만 더한다.
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
           'memo',             o.memo,
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

  return v_result;
end;
$$;


-- 확인용 결과 줄
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'push_subscriptions')
    as "알림 기기 표 (1이면 정상)",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('save_push_subscription', 'delete_push_subscription', 'push_targets', 'drop_push_subscription'))
    as "함수 (4이면 정상)",
  has_function_privilege('anon', 'public.save_push_subscription(text,text,text,text)', 'execute')
    as "로그인 안 한 사람이 등록 (false 정상)";
