-- v2-F 알림
--
-- 지금 사장님이 새 주문을 아는 방법은 "화면을 보고 있는 것" 하나뿐이다.
-- 저녁 장사 중에 휴대폰을 계속 볼 수는 없다. 결제가 끝나면 알림톡이 가야 한다.
--
-- 두 방향이 있다:
--   · 매장 ← 새 주문
--   · 손님 ← 접수 / 준비완료 / 배달중 / 취소
--
-- 중복 발송은 이 테이블로 막지 않는다. mark_order_paid 와 advanceOrder 가 이미
-- "한 번만 성공"하도록 되어 있고, 발송은 그 성공 뒤에만 일어난다.
-- 여기는 **무엇이 나갔고 무엇이 실패했는지 보기 위한 기록**이다.

create table public.notification_logs (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references public.orders(id) on delete set null,
  -- new_order / accepted / preparing / ready / delivering / completed / canceled
  kind       text not null,
  -- alimtalk / log … 어떤 통로로 보냈는지
  channel    text not null,
  -- 받는 사람 번호. 개인정보라 관리자만 볼 수 있다 (아래 정책)
  recipient  text,
  status     text not null check (status in ('sent', 'failed')),
  error      text,
  created_at timestamptz not null default now()
);

create index notification_logs_order_idx
  on public.notification_logs (order_id, created_at desc);

-- 실패한 발송을 찾는 인덱스. 사장님이 주문을 놓친 원인이 여기 있다.
create index notification_logs_failed_idx
  on public.notification_logs (created_at desc)
  where status = 'failed';

alter table public.notification_logs enable row level security;

-- 손님에게는 보여주지 않는다. 남의 연락처가 들어 있다.
create policy notification_logs_admin_read on public.notification_logs
  for select to authenticated using (public.is_admin());

-- 쓰기는 이 함수로만. 손님이 직접 넣을 이유가 없다.
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
  insert into public.notification_logs
    (order_id, kind, channel, recipient, status, error)
  values (p_order_id, p_kind, p_channel, p_recipient, p_status, p_error);
end;
$$;

revoke all on function public.log_notification(uuid, text, text, text, text, text)
  from public;
grant execute on function public.log_notification(uuid, text, text, text, text, text)
  to anon, authenticated;

---------------------------------------------------------------------------
-- Realtime.
--
-- 지금은 15초마다 다시 받아온다. 이 매장 규모에는 그걸로도 충분하지만,
-- 사장님이 새 주문을 15초 늦게 아는 것과 즉시 아는 것은 저녁 피크에 차이가 크다.
--
-- RLS 는 그대로 적용된다. 손님은 자기 주문의 변경만, 관리자는 전부 받는다.
-- 구독이 실패해도 폴링이 남아 있어 화면이 멈추지는 않는다.
---------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders;
