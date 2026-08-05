-- 관리자 주문 목록을 기간으로 자르기 위한 인덱스.
--
-- 지금까지는 "결제 대기 빼고 최근 100건"을 매번 가져왔다.
-- 그 조회는 status <> 'pending_payment' 인데, 기존 orders_status_idx 는
-- (status, created_at desc) 라 **같음**에는 맞아도 **다름**에는 못 쓰인다.
-- 결국 주문이 쌓일수록 전체를 훑고 정렬하게 된다.
--
-- 사장님이 매일 여는 화면이라 이게 제일 먼저 체감된다.
-- 조회를 "최근 N일" 로 바꾸고, 그 범위 스캔이 이 인덱스를 타게 한다.

create index orders_created_idx on public.orders (created_at desc);
