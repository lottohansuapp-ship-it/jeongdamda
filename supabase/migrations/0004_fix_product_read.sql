-- 버그 수정: 로그인한 손님에게 상품이 하나도 안 보였다.
--
-- 0001 에서 숨긴 상품 유출을 막으려고 products_public_read 를 좁힐 때
-- 대상 role 에서 authenticated 를 같이 떨어뜨렸다. 그래서 손님이 로그인하는 순간
-- role 이 anon → authenticated 로 바뀌면서 SELECT 가 전부 막혔다.
--
-- 카탈로그 화면은 쿠키 없는 anon 클라이언트를 써서 증상이 안 보였지만,
-- 장바구니·주문서·주문 생성은 세션 클라이언트를 쓰므로 그대로 두면 v2-B 에서 터진다.
--
-- 관리자는 products_admin_write(for all ... is_admin()) 가 SELECT 도 포함하므로
-- 두 정책이 OR 로 합쳐져 숨긴 상품까지 계속 볼 수 있다.

drop policy if exists products_public_read on public.products;

create policy products_public_read on public.products
  for select to anon, authenticated
  using (today_available = true);
