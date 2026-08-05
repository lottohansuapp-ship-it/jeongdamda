-- 오류 기록.
--
-- 지금은 프로덕션에서 결제 웹훅이 실패하거나 알림이 안 나가도 **아무도 모른다.**
-- 손님이 전화로 알려줘야 안다.
--
-- 왜 Sentry 같은 걸 안 쓰는가: 계정·요금·설정이 또 하나 늘고, 이 규모에서 실제로
-- 필요한 건 "무엇이 몇 번 실패했나" 한 화면이다. 이미 있는 DB 로 충분하다.
-- 나중에 필요해지면 src/lib/report.ts 한 파일만 바꾸면 된다.
--
-- 개인정보는 담지 않는다. 주소·연락처가 오류 메시지에 섞이면 그게 곧 유출이다.
-- scope 와 message 만 남기고 detail 에는 주문번호 정도만 넣는다.

create table public.error_logs (
  id         uuid primary key default gen_random_uuid(),
  -- 어디서 났는지. payment-webhook / notify / order-action …
  scope      text not null,
  message    text not null,
  -- 주문번호 같은 식별자. 개인정보는 넣지 않는다.
  detail     text,
  created_at timestamptz not null default now()
);

create index error_logs_recent_idx on public.error_logs (created_at desc);

alter table public.error_logs enable row level security;

create policy error_logs_admin_read on public.error_logs
  for select to authenticated using (public.is_admin());

-- 기록은 이 함수로만. 손님이 직접 넣을 이유가 없다.
--
-- 오류 기록이 실패해도 앱이 멈추면 안 되므로 예외를 삼킨다 —
-- "오류를 남기다 오류가 나서 주문이 실패했다"는 최악이다.
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
  insert into public.error_logs (scope, message, detail)
  values (p_scope, left(p_message, 500), left(p_detail, 200));
exception when others then
  null;
end;
$$;

revoke all on function public.log_error(text, text, text) from public;
grant execute on function public.log_error(text, text, text) to anon, authenticated;
