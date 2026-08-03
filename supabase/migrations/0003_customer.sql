-- v2-A 손님 회원: 프로필 + 배송지
-- RLS는 여기서 같이 켠다. 나중에 붙이면 잊는다.

create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  label      text,
  postcode   text,
  address1   text not null,
  address2   text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index addresses_user_idx on public.addresses (user_id, created_at desc);

-- 기본 배송지는 사용자당 하나뿐이어야 한다. 앱 코드로 지키면 언젠가 깨진다.
create unique index addresses_one_default_per_user
  on public.addresses (user_id) where is_default;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 가입 폼이 넘긴 이름·휴대폰을 그대로 심는다 (D18).
-- 카카오 가입은 휴대폰을 주지 않으므로 phone 이 비고, 앱이 /signup/phone 으로 보낸다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 가입한 계정(사장님)도 프로필을 갖게 한다
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- RLS: 본인 행만. 관리자는 주문 처리에 필요하므로 읽기만 허용한다.
alter table public.profiles  enable row level security;
alter table public.addresses enable row level security;

create policy profiles_own on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_admin_read on public.profiles
  for select to authenticated using (public.is_admin());

create policy addresses_own on public.addresses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy addresses_admin_read on public.addresses
  for select to authenticated using (public.is_admin());
