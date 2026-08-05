-- 개인정보 파기와 매출 화면 인덱스.
--
-- 두 가지를 한 파일에 두는 이유는 둘 다 "주문이 쌓여도 괜찮게" 에 속하기 때문이다.
-- 다만 성격은 다르다. 인덱스는 성능이고, 파기는 약속이다.


-- 1. 환불 집계 인덱스
--
-- 매출 함수(get_sales)는 환불액을 이렇게 센다.
--   where c.refunded_at >= v_start and c.refunded_at < v_end
-- paid_at 에는 인덱스가 있는데 refunded_at 에는 없었다. 그래서 사장님이
-- 매출 화면을 열 때마다 주문 테이블 전체를 훑었다. 환불은 드물게 일어나므로
-- 부분 인덱스로 충분하다 — 환불 안 된 주문은 인덱스에 들어가지도 않는다.

create index orders_refunded_at_idx on public.orders (refunded_at)
  where refunded_at is not null;


-- 2. 로그 파기
--
-- 개인정보처리방침에 "보유 기간이 지나거나 처리 목적이 달성된 개인정보는
-- 지체 없이 파기합니다" 라고 적어 두고, 정작 지우는 장치가 없었다.
-- notification_logs.recipient 에는 손님 전화번호가 들어간다.
--
-- 이 로그의 쓸모는 둘이다. (a) 알림톡을 두 번 보내지 않기, (b) 실패 원인 찾기.
-- 둘 다 며칠이면 끝나는 일이라 90일이면 넉넉하다. 통신비밀보호법이 정한
-- 접속 기록 3개월과도 맞춘다.
--
-- 주문 자체는 지우지 않는다. 전자상거래법이 계약·결제 기록을 5년간
-- 보존하라고 한다. 지워야 하는 것과 보존해야 하는 것을 섞으면 안 된다.

create or replace function public.purge_old_logs(p_days int default 90)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := now() - make_interval(days => greatest(p_days, 1));
  v_notify int;
  v_errors int;
begin
  with gone as (
    delete from public.notification_logs
     where created_at < v_cutoff
    returning 1
  )
  select count(*) into v_notify from gone;

  with gone as (
    delete from public.error_logs
     where created_at < v_cutoff
    returning 1
  )
  select count(*) into v_errors from gone;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'notification_logs', v_notify,
    'error_logs', v_errors
  );
end;
$$;

-- 손님도 관리자도 직접 부를 일이 없다. 스케줄러만 쓴다.
revoke all on function public.purge_old_logs(int) from public;


-- 3. 스케줄
--
-- 파기는 아무도 화면을 열지 않아도 돌아야 한다. 그래서 만료 재고를 회수하는
-- sweep_expired_orders 처럼 주문할 때 곁다리로 돌리는 방식을 쓸 수 없다.
-- 손님이 한 명도 없는 주에도 파기 기한은 지나간다.
--
-- pg_cron 을 못 쓰는 환경이면 이 블록만 조용히 넘어간다. 마이그레이션 전체를
-- 실패시키지 않는다 — 인덱스와 함수는 이미 올라갔고, 그것만으로도 의미가 있다.
-- 그 경우 아래 안내가 출력되니 대시보드에서 pg_cron 을 켜고 다시 실행하면 된다.

do $$
begin
  create extension if not exists pg_cron;

  perform cron.schedule(
    'purge-old-logs',
    '17 4 * * *',  -- 매일 UTC 4시 17분 (한국 13시 17분). 정각을 피해 몰림을 줄인다.
    $cron$ select public.purge_old_logs(90); $cron$
  );

  raise notice 'purge_old_logs 를 매일 돌리도록 예약했습니다.';
exception
  when others then
    raise notice E'pg_cron 을 쓸 수 없어 예약을 건너뛰었습니다 (%).\n'
      '  Supabase 대시보드 > Database > Extensions 에서 pg_cron 을 켠 뒤\n'
      '  이 파일을 다시 실행하세요. 그 전까지는 오래된 로그가 지워지지 않습니다.',
      sqlerrm;
end;
$$;
