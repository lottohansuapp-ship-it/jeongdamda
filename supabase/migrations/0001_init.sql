-- 오늘의 반찬 — 스키마 + RLS
-- RLS는 여기서 같이 켠다. 나중에 붙이면 잊는다.

create extension if not exists "pgcrypto";

create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.categories(id) on delete restrict,
  name            text not null,
  description     text,
  price           int  not null check (price >= 0),
  origin          text,
  allergy         text,
  storage         text,
  pairing         text,
  photo_path      text,
  today_stock     int  not null default 0 check (today_stock >= 0),
  today_available boolean not null default true,
  made_today      boolean not null default false,
  recommended     boolean not null default false,
  sort_order      int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index products_category_idx on public.products (category_id);
create index products_shop_idx     on public.products (today_available, sort_order);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- 순서 변경은 한 문장으로 끝낸다. 상품마다 UPDATE 를 날리면
-- 중간에 실패했을 때 절반만 재번호된 상태가 남는다.
-- security invoker 이므로 아래 RLS 정책(is_admin)이 그대로 적용된다.
create or replace function public.reorder_products(ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.products p
  set sort_order = o.ord
  from unnest(ids) with ordinality as o(id, ord)
  where p.id = o.id;
$$;

-- 사장님 명단. 로그인했다는 사실만으로 쓰기를 허용하면,
-- 회원가입한 아무나가 전체 반찬을 지울 수 있다. 대시보드 토글 하나에 기대지 않는다.
create table public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- RLS: 손님(anon)은 읽기만, 쓰기는 admins 에 등록된 계정만
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.admins     enable row level security;

create policy admins_self_read on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create policy categories_public_read on public.categories
  for select to anon, authenticated using (true);

create policy categories_admin_write on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 손님은 오늘 판매중인 상품만 본다. 숨긴 상품은 REST 엔드포인트로도 새어나가면 안 된다.
-- role 목록에서 authenticated 를 빼면 안 된다. 손님이 로그인하는 순간 상품이 전부 사라진다.
create policy products_public_read on public.products
  for select to anon, authenticated
  using (today_available = true);

create policy products_admin_write on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 상품 사진 버킷 + 정책. 읽기는 공개, 쓰기는 사장님만.
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

create policy product_photos_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'product-photos');

create policy product_photos_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'product-photos' and public.is_admin())
  with check (bucket_id = 'product-photos' and public.is_admin());
