-- 정책 평가 횟수를 줄이고, 오류 기록이 스팸에 묻히지 않게 한다.
-- 둘 다 "이용자가 늘어도 원활해야 한다" 에 속한다.


-- 1. is_admin() 이 행마다 불렸다
--
-- 정책을 `using (public.is_admin())` 로 쓰면 Postgres 가 **행마다** 이 함수를
-- 부른다. auth.uid() 는 `(select auth.uid())` 로 잘 감쌌는데 그 위에 얹은
-- 함수 호출은 안 감쌌다. 감싸면 planner 가 InitPlan 으로 빼서 조회당 한 번만
-- 평가한다. 판정 결과는 똑같고 횟수만 줄어든다.
--
-- 손님에게도 영향이 있다. orders 에는 정책이 둘(본인 것 / 관리자 전체)이고
-- Postgres 는 둘을 OR 로 합쳐 평가하므로, 손님이 자기 주문 50건을 읽을 때도
-- is_admin() 이 50번 불렸다. 사장님이 200건을 볼 때는 200번이다.
--
-- 정책을 지웠다 다시 만드는 사이에는 그 테이블이 잠깐 무방비가 된다.
-- 한 트랜잭션 안에서 처리해 중간에 실패하면 통째로 되돌아가게 한다.

begin;

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists products_admin_write on public.products;
create policy products_admin_write on public.products
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists product_photos_admin_write on storage.objects;
create policy product_photos_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'product-photos' and (select public.is_admin()))
  with check (bucket_id = 'product-photos' and (select public.is_admin()));

drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles
  for select to authenticated using ((select public.is_admin()));

drop policy if exists addresses_admin_read on public.addresses;
create policy addresses_admin_read on public.addresses
  for select to authenticated using ((select public.is_admin()));

drop policy if exists store_settings_admin_write on public.store_settings;
create policy store_settings_admin_write on public.store_settings
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists delivery_areas_admin_write on public.delivery_areas;
create policy delivery_areas_admin_write on public.delivery_areas
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists order_items_admin_all on public.order_items;
create policy order_items_admin_all on public.order_items
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists notification_logs_admin_read on public.notification_logs;
create policy notification_logs_admin_read on public.notification_logs
  for select to authenticated using ((select public.is_admin()));

drop policy if exists error_logs_admin_read on public.error_logs;
create policy error_logs_admin_read on public.error_logs
  for select to authenticated using ((select public.is_admin()));

commit;


-- 2. 오류 기록이 무한정 쌓일 수 있었다
--
-- log_error 와 log_notification 은 anon 에게 열려 있다. 서버가 세션 없이
-- 부르기 때문인데, anon 키는 브라우저 번들에 공개돼 있어 누구나 이 함수를
-- 직접 호출할 수 있다. 반복해서 부르면 로그가 끝없이 쌓인다.
--
-- 진짜 문제는 저장 용량이 아니라 **묻히는 것**이다. 이 로그는 "결제 웹훅이
-- 실패해도 아무도 모른다" 를 풀려고 만든 관측 창구인데, 그 창구가 쓰레기로
-- 가득 차면 정작 봐야 할 실패를 못 찾는다.
--
-- 분당 상한을 둔다. 정상 운영에서는 닿을 일이 없는 숫자다 — 주문이 분당
-- 수십 건이어도 실패 로그가 60개를 넘을 이유가 없다. 넘으면 조용히 버린다.
-- 여기서 예외를 던지면 로그 때문에 주문이 실패하므로 그럴 수 없다.
--
-- created_at 에 인덱스가 있어(0013, 0016) 이 세기는 범위 스캔으로 끝난다.

create or replace function public.log_error(
  p_scope   text,
  p_message text,
  p_detail  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.error_logs
       where created_at > now() - interval '1 minute') >= 60 then
    return;  -- 이미 충분히 시끄럽다. 더 쌓아도 알아볼 수 없게 될 뿐이다.
  end if;

  insert into public.error_logs (scope, message, detail)
  values (p_scope, left(p_message, 500), left(p_detail, 200));
exception when others then
  null;
end;
$$;

revoke all on function public.log_error(text, text, text) from public;
grant execute on function public.log_error(text, text, text) to anon, authenticated;


-- 알림 로그는 주문 한 건에 여러 통이 나갈 수 있어 상한을 넉넉히 잡는다.
create or replace function public.log_notification(
  p_order_id  uuid,
  p_kind      text,
  p_channel   text,
  p_recipient text,
  p_status    text,
  p_error     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.notification_logs
       where created_at > now() - interval '1 minute') >= 120 then
    return;
  end if;

  insert into public.notification_logs
    (order_id, kind, channel, recipient, status, error)
  values (p_order_id, p_kind, p_channel, p_recipient, p_status, p_error);
exception when others then
  -- 원래는 예외를 그대로 올렸지만, 호출부(notify/index.ts)가 try/catch 로
  -- 감싸고 있었을 뿐이다. 상한 검사가 들어온 김에 여기서 닫는다 —
  -- 알림 기록이 실패했다고 주문 처리가 멈추면 안 된다.
  null;
end;
$$;

revoke all on function public.log_notification(uuid, text, text, text, text, text) from public;
grant execute on function public.log_notification(uuid, text, text, text, text, text)
  to anon, authenticated;
