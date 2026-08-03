-- 뱃지를 boolean 두 개에서 배열 하나로 바꾼다.
--
-- made_today / recommended 로는 뱃지를 늘릴 때마다 컬럼이 하나씩 붙는다.
-- 뱃지 종류는 앞으로도 바뀔 값이지 스키마가 아니다.
--
-- 키 목록은 src/lib/badges.ts 가 단일 진실이다. DB 는 문자열만 담는다.
-- 여기에 check 제약을 걸면 뱃지 하나 추가할 때마다 마이그레이션이 필요해진다.

alter table public.products
  add column badges text[] not null default '{}';

-- 기존 값 이관
update public.products
   set badges = (
     case when made_today  then array['today']     else array[]::text[] end ||
     case when recommended then array['recommend'] else array[]::text[] end
   );

-- 추천 캐러셀이 이 컬럼으로 상위 3개를 고른다
create index products_badges_idx on public.products using gin (badges);

alter table public.products drop column made_today;
alter table public.products drop column recommended;
