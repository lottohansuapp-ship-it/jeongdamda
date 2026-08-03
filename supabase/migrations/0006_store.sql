-- v2-C 매장 설정: 영업시간 · 픽업/배달 · 배달지역
--
-- open_time / close_time 은 "한국 시간 벽시계" 다. timestamptz 가 아니라 time 인 이유는
-- 사장님이 입력하는 값이 특정 순간이 아니라 매일 반복되는 시각이기 때문이다.
-- 서버는 UTC 로 돌므로 비교할 때 반드시 Asia/Seoul 로 환산한다 (src/lib/store.ts).

create table public.store_settings (
  id                  int primary key default 1 check (id = 1),
  is_open             boolean not null default true,
  open_time           time not null default '09:00',
  close_time          time not null default '20:00',
  closed_weekdays     int[] not null default '{}',   -- 0=일 … 6=토
  pickup_enabled      boolean not null default true,
  delivery_enabled    boolean not null default true,
  min_order_amount    int not null default 0 check (min_order_amount >= 0),
  pickup_lead_minutes int not null default 30 check (pickup_lead_minutes >= 0),
  notice              text,
  updated_at          timestamptz not null default now()
);

create table public.delivery_areas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  fee        int  not null default 0 check (fee >= 0),
  min_amount int  check (min_amount >= 0),   -- null 이면 store_settings.min_order_amount 를 쓴다
  is_active  boolean not null default true,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create index delivery_areas_active_idx on public.delivery_areas (is_active, sort_order);

create trigger store_settings_touch_updated_at
  before update on public.store_settings
  for each row execute function public.touch_updated_at();

-- 단일 행을 미리 만들어 둔다. 없으면 화면이 매번 "설정 없음"을 다뤄야 한다.
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

-- 손님도 읽어야 한다 (영업시간·배달비를 주문서에서 보여줘야 함). 쓰기는 사장님만.
alter table public.store_settings enable row level security;
alter table public.delivery_areas enable row level security;

create policy store_settings_public_read on public.store_settings
  for select to anon, authenticated using (true);

create policy store_settings_admin_write on public.store_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy delivery_areas_public_read on public.delivery_areas
  for select to anon, authenticated using (true);

create policy delivery_areas_admin_write on public.delivery_areas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
