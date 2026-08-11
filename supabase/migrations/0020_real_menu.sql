-- 실제 메뉴로 교체 (사장님이 주신 엑셀 39개 + 사진 39장)
--
-- 0002_seed.sql 이 넣어 둔 임시 카테고리 8개와 임시 상품을 매장에서 실제로
-- 파는 구성으로 바꾼다.
--
-- 주문 내역은 남는다. order_items.product_id 가 on delete set null 이라
-- 상품이 사라져도 주문에 남긴 이름·가격 스냅샷은 그대로다.
-- 장바구니는 cascade 로 비워진다 — 없어질 상품이 담겨 있으면 곤란하다.
--
-- 알레르기는 넣지 않는다 (사장님 결정). 양념까지 알아야 정확한데 추측으로 적으면
-- 알레르기 있는 손님이 그걸 믿고 드신다. 비워 두면 화면에 그 줄이 안 나온다.

begin;

-- 1) 임시 상품 먼저. 카테고리가 on delete restrict 라 순서가 중요하다.
delete from public.products;

-- 2) 실제 카테고리
insert into public.categories (name, slug, sort_order) values
  ('나물 및 무침', 'namul-muchim', 1),
  ('볶음 및 조림', 'bokkeum-jorim', 2),
  ('마른반찬', 'mareun', 3),
  ('장아찌 및 김치', 'jangajji-kimchi', 4)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

-- 3) 안 쓰는 옛 카테고리 정리 (상품이 없으므로 안전하다)
delete from public.categories where slug not in (
  'namul-muchim', 'bokkeum-jorim', 'mareun', 'jangajji-kimchi'
);

-- 4) 반찬 39개
--    today_stock 은 0. 사장님이 아침에 만든 만큼 넣으신다.
--    today_available 은 true — 오늘 안 만든 날에만 사장님이 끈다.
insert into public.products
  (category_id, name, price, description, origin, storage, today_stock, today_available, sort_order)
values
  ((select id from public.categories where slug = 'namul-muchim'), '고추잎무침', 3000, '향긋한 고추잎에 매콤새콤한 양념을 더해 입맛을 살려주는 깔끔한 밑반찬~!', '고추잎: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 1),
  ((select id from public.categories where slug = 'mareun'), '고추장진미채', 3500, '달콤매콤한 고추장 양념에 쫄깃한 진미채가 어우러진 국민 밑반찬~', '오징어: 국산 / 고춧가루: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 1),
  ((select id from public.categories where slug = 'mareun'), '간장홍진미채', 3500, '아이들도 좋아하는 달콤 짭짤한 진미채~! 부드럽고 쫄깃해서 자꾸 손이 가는 인기 반찬이에요.', '오징어: 국산', '냉장 보관, 3일 이내 드세요', 0, true, 2),
  ((select id from public.categories where slug = 'namul-muchim'), '가지나물', 3000, '부드럽고 촉촉한 가지에 담백한 양념을 더해 부담 없이 즐기는 건강한 나물반찬~!', '가지: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 2),
  ((select id from public.categories where slug = 'namul-muchim'), '비름나물', 3000, '향긋하고 부드러운 비름나물에 깔끔하게 양념해 고소하고 담백한 맛이 일품이에요.', '비름: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 3),
  ((select id from public.categories where slug = 'namul-muchim'), '건고구마순나물', 3000, '고구마순 특유의 구수한 향과 쫄깃한 식감이 매력적인 정겨운 나물반찬~!', '고구마순: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 4),
  ((select id from public.categories where slug = 'namul-muchim'), '곤드레나물', 3000, '구수하고 향긋한 곤드레의 풍미를 그대로 살린 담백한 나물~', '곤드레: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 5),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '잔멸치볶음', 3500, '고소한 잔멸치에 달콤짭짤한 양념을 입혀 바삭하고 맛있게 볶아낸 밥도둑 반찬~!', '멸치: 국산', '냉장 보관, 3일 이내 드세요', 0, true, 1),
  ((select id from public.categories where slug = 'namul-muchim'), '건취나물', 3000, '취나물 특유의 향긋하고 구수한 풍미가 가득한 정겨운 나물반찬~', '취나물: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 6),
  ((select id from public.categories where slug = 'namul-muchim'), '참나물', 3000, '참나물의 싱그러운 향과 아삭한 식감이 살아있는 깔끔한 나물무침~', '참나물: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 7),
  ((select id from public.categories where slug = 'namul-muchim'), '무생채', 2000, '아삭아삭한 무에 새콤매콤한 양념을 더해 입맛을 확 살려주는 상큼한 반찬~!', '무: 국내산 / 고춧가루: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 8),
  ((select id from public.categories where slug = 'namul-muchim'), '고사리', 3000, '고사리 특유의 맛을 살려 정성스럽게 무쳐낸 담백한 나물반찬이에요.', '고사리: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 9),
  ((select id from public.categories where slug = 'namul-muchim'), '도라지무침', 3000, '쌉싸름한 도라지에 새콤달콤매콤한 양념을 더해 입맛을 톡 살려주는 별미 반찬~!', '도라지: 국내산 / 고춧가루: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 10),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '도라지볶음', 3000, '도라지의 은은한 쌉싸름함과 고소한 풍미를 살린 담백하고 부드러운 볶음반찬~!', '도라지: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 2),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '궁채볶음', 3000, '아삭아삭하고 오독오독한 궁채의 식감이 매력적인 고소한 볶음반찬~ 씹을수록 맛있어요.', '궁채: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 3),
  ((select id from public.categories where slug = 'namul-muchim'), '오이지무침', 3000, '짭조름하고 아삭한 오이지에 매콤새콤한 양념을 더해 입맛 없을 때 딱 좋은 반찬~!', '오이: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 11),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '연근조림', 3000, '아삭한 연근에 달콤짭짤한 양념이 쏙 배어든 정겨운 밑반찬~ 은은한 단맛이 매력적이에요.', '연근: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 4),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '우엉조림', 3000, '우엉 특유의 향긋하고 구수한 풍미에 달콤짭짤한 양념이 어우러진 쫀득한 밑반찬~!', '우엉: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 5),
  ((select id from public.categories where slug = 'namul-muchim'), '미역줄기', 3000, '꼬들꼬들한 미역줄기의 식감과 담백하고 고소한 맛이 어우러진 부담 없는 반찬이에요.', '미역: 국산', '냉장 보관, 3일 이내 드세요', 0, true, 12),
  ((select id from public.categories where slug = 'mareun'), '오징어실채', 3500, '얇고 부드러운 오징어실채에 달콤짭짤한 양념을 더해 쫄깃하게 즐기는 인기 밑반찬~!', '오징어: 국산', '냉장 보관, 3일 이내 드세요', 0, true, 3),
  ((select id from public.categories where slug = 'namul-muchim'), '깨순나물', 3000, '향긋한 깻잎 향이 은은하게 퍼지는 부드러운 나물반찬~ 고소하고 담백해서 밥과 잘 어울려요.', '깻순: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 13),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '고추장건새우볶음', 3500, '바삭고소한 건새우에 매콤달콤한 고추장 양념을 더한 감칠맛 가득한 밥도둑 반찬~!', '건새우: 국산 / 고춧가루: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 6),
  ((select id from public.categories where slug = 'namul-muchim'), '건파래무침', 3500, '고소하고 향긋한 건파래에 맛깔스러운 양념을 더해 바삭하면서도 부드럽게 즐기는 밑반찬~', '파래: 국산', '냉장 보관, 3일 이내 드세요', 0, true, 14),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '가문어조림', 4500, '쫄깃한 가문어에 달콤짭짤한 양념이 깊게 배어든 감칠맛 가득한 인기 조림반찬~!', '문어: 국산', '냉장 보관, 3일 이내 드세요', 0, true, 7),
  ((select id from public.categories where slug = 'jangajji-kimchi'), '매실장아찌', 4000, '매실 특유의 새콤달콤한 맛과 아삭한 식감이 살아있는 입맛 돋우는 별미 장아찌~!', '매실: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 1),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '고추장멸치볶음', 3000, '고소한 멸치에 매콤달콤한 고추장 양념을 더해 밥 한 공기를 부르는 중독성 있는 밑반찬~!', '멸치: 국산 / 고춧가루: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 8),
  ((select id from public.categories where slug = 'namul-muchim'), '양념깻잎', 3000, '향긋한 깻잎에 짭조름하고 감칠맛 나는 양념이 어우러진 밥도둑 반찬~', '깻잎: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 15),
  ((select id from public.categories where slug = 'namul-muchim'), '고추지무침', 3000, '아삭한 고추지에 매콤새콤한 양념을 더해 깔끔하면서도 입맛을 확 살려주는 반찬~!', '고추: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 16),
  ((select id from public.categories where slug = 'jangajji-kimchi'), '깻잎김치', 3000, '향긋한 깻잎 한 장 한 장에 맛깔스러운 양념을 더한 밥도둑 김치~ 밥과 함께 먹으면 최고예요.', '깻잎: 국내산 / 고춧가루: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 2),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '메추리알장조림', 4000, '한입에 쏙 들어가는 메추리알에 달콤짭짤한 양념이 쏙 배어든 남녀노소 인기 반찬~!', '메추리알: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 9),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '마약계란장', 3500, '촉촉한 계란에 짭조름하고 감칠맛 나는 양념이 어우러져 밥에 올려 먹으면 멈출 수 없는 맛~!', '계란: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 10),
  ((select id from public.categories where slug = 'namul-muchim'), '단호박샐러드', 3500, '달콤하고 포근한 단호박의 부드러운 맛을 살린 고소한 샐러드~ 아이들도 부담 없이 좋아해요.', '단호박: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 17),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '밥새우볶음', 3000, '작고 고소한 밥새우를 달콤짭짤하게 볶아 밥에 비벼 먹어도 맛있는 알찬 밑반찬~!', '밥새우: 국산', '냉장 보관, 3일 이내 드세요', 0, true, 11),
  ((select id from public.categories where slug = 'namul-muchim'), '콩나물무침', 1000, '아삭아삭한 콩나물에 깔끔하게 양념해 담백하고 시원한 맛이 매력적인 기본 반찬~!', '콩나물: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 18),
  ((select id from public.categories where slug = 'namul-muchim'), '빨간콩나물무침', 1000, '아삭한 콩나물에 매콤한 양념을 더해 깔끔하면서도 입맛을 살려주는 기본 밑반찬~!', '콩나물: 국내산 / 고춧가루: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 19),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '어묵볶음', 2500, '부드럽고 쫄깃한 어묵에 달콤짭짤한 양념이 어우러진 남녀노소 누구나 좋아하는 인기 반찬~!', '어묵(연육): 국산', '냉장 보관, 3일 이내 드세요', 0, true, 12),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '감자채볶음', 2500, '담백하고 포슬포슬한 감자를 식감이 살아있게 볶아낸 깔끔한 기본 반찬~!', '감자: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 13),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '땅콩조림', 4000, '고소한 땅콩에 달콤짭짤한 양념이 배어 쫀득하고 고소한 맛이 일품인 별미 조림~!', '땅콩: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 14),
  ((select id from public.categories where slug = 'bokkeum-jorim'), '콩자반', 3000, '고소하고 쫀득한 콩에 달콤짭짤한 양념을 더한 정겨운 밑반찬~ 밥과 함께 먹기 딱 좋아요.', '콩: 국내산', '냉장 보관, 3일 이내 드세요', 0, true, 15);

commit;
